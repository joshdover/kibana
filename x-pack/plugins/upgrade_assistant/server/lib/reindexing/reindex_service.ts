/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import Boom from 'boom';

import { CallCluster } from 'src/legacy/core_plugins/elasticsearch';
import {
  ReindexSavedObject,
  ReindexStatus,
  ReindexStep,
  ReindexWarning,
} from '../../../common/types';
import { getReindexWarnings, transformFlatSettings } from './index_settings';
import { ReindexActions } from './reindex_actions';

const VERSION_REGEX = new RegExp(/^([1-9]+)\.([0-9]+)\.([0-9]+)/);

export interface ReindexService {
  /**
   * Checks an index's settings and mappings to flag potential issues during reindex.
   * Resolves to null if index does not exist.
   * @param indexName
   */
  detectReindexWarnings(indexName: string): Promise<ReindexWarning[] | null>;

  /**
   * Creates a new reindex operation for a given index.
   * @param indexName
   */
  createReindexOperation(indexName: string): Promise<ReindexSavedObject>;

  /**
   * Retrieves all reindex operations that have the given status.
   * @param status
   */
  findAllByStatus(status: ReindexStatus): Promise<ReindexSavedObject[]>;

  /**
   * Finds the reindex operation for the given index.
   * Resolves to null if there is no existing reindex operation for this index.
   * @param indexName
   */
  findReindexOperation(indexName: string): Promise<ReindexSavedObject | null>;

  /**
   * Process the reindex operation through one step of the state machine and resolves
   * to the updated reindex operation.
   * @param reindexOp
   */
  processNextStep(reindexOp: ReindexSavedObject): Promise<ReindexSavedObject>;

  /**
   * Pauses the in-progress reindex operation for a given index.
   * @param indexName
   */
  pauseReindexOperation(indexName: string): Promise<ReindexSavedObject>;

  /**
   * Resumes the paused reindex operation for a given index.
   * @param indexName
   */
  resumeReindexOperation(indexName: string): Promise<ReindexSavedObject>;
}

export const reindexServiceFactory = (
  callCluster: CallCluster,
  actions: ReindexActions
): ReindexService => {
  // ------ Functions used to process the state machine

  const validateNodesMinimumVersion = async (minMajor: number, minMinor: number) => {
    const nodesResponse = await callCluster('transport.request', {
      path: '/_nodes',
      method: 'GET',
    });

    const outDatedNodes = Object.values(nodesResponse.nodes).filter((node: any) => {
      const matches = node.version.match(VERSION_REGEX);
      const major = parseInt(matches[1], 10);
      const minor = parseInt(matches[2], 10);

      // All ES nodes must be >= 6.7.0 to pause ML jobs
      return !(major > minMajor || (major === minMajor && minor >= minMinor));
    });

    if (outDatedNodes.length > 0) {
      const nodeList = JSON.stringify(outDatedNodes.map((n: any) => n.name));
      throw new Error(
        `Some nodes are not on minimum version (${minMajor}.${minMinor}.0)  required: ${nodeList}`
      );
    }
  };

  /**
   * If the index is a ML index that will cause jobs to fail when set to readonly,
   * turn on 'upgrade mode' to pause all ML jobs.
   * @param reindexOp
   */
  const setMlUpgradeMode = async (reindexOp: ReindexSavedObject) => {
    if (!actions.isMlIndex(reindexOp.attributes.indexName)) {
      return actions.updateReindexOp(reindexOp, {
        lastCompletedStep: ReindexStep.mlUpgradeModeSet,
      });
    }

    await actions.incrementMlReindexes();
    await actions.runWhileMlLocked(async mlDoc => {
      await validateNodesMinimumVersion(6, 7);

      const res = await callCluster('transport.request', {
        path: '/_ml/set_upgrade_mode?enabled=true',
        method: 'POST',
      });

      if (!res.acknowledged) {
        throw new Error(`Could not stop ML jobs`);
      }

      return mlDoc;
    });

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.mlUpgradeModeSet,
    });
  };

  /**
   * Sets the original index as readonly so new data can be indexed until the reindex
   * is completed.
   * @param reindexOp
   */
  const setReadonly = async (reindexOp: ReindexSavedObject) => {
    const { indexName } = reindexOp.attributes;
    const putReadonly = await callCluster('indices.putSettings', {
      index: indexName,
      body: { 'index.blocks.write': true },
    });

    if (!putReadonly.acknowledged) {
      throw new Error(`Index could not be set to readonly.`);
    }

    return actions.updateReindexOp(reindexOp, { lastCompletedStep: ReindexStep.readonly });
  };

  /**
   * Creates a new index with the same mappings and settings as the original index.
   * @param reindexOp
   */
  const createNewIndex = async (reindexOp: ReindexSavedObject) => {
    const { indexName, newIndexName } = reindexOp.attributes;

    const flatSettings = await actions.getFlatSettings(indexName);
    if (!flatSettings) {
      throw Boom.notFound(`Index ${indexName} does not exist.`);
    }

    const { settings, mappings } = transformFlatSettings(flatSettings);
    const createIndex = await callCluster('indices.create', {
      index: newIndexName,
      body: {
        settings,
        mappings,
      },
    });

    if (!createIndex.acknowledged) {
      throw Boom.badImplementation(`Index could not be created: ${newIndexName}`);
    }

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.newIndexCreated,
    });
  };

  /**
   * Begins the reindex process via Elasticsearch's Reindex API.
   * @param reindexOp
   */
  const startReindexing = async (reindexOp: ReindexSavedObject) => {
    const { indexName } = reindexOp.attributes;
    const reindexBody = {
      source: { index: indexName },
      dest: { index: reindexOp.attributes.newIndexName },
    } as any;

    const booleanFieldPaths = await actions.getBooleanFieldPaths(indexName);
    if (booleanFieldPaths.length) {
      reindexBody.script = {
        lang: 'painless',
        source: `
          // Updates a single field in a Map
          void updateField(Map data, String fieldName) {
            if (
              data[fieldName] == 'yes' ||
              data[fieldName] == '1' ||
              (data[fieldName] instanceof Integer && data[fieldName] == 1) ||
              data[fieldName] == 'on'
            ) {
              data[fieldName] = true;
            } else if (
              data[fieldName] == 'no' ||
              data[fieldName] == '0' ||
              (data[fieldName] instanceof Integer && data[fieldName] == 0) ||
              data[fieldName] == 'off'
            ) {
              data[fieldName] = false;
            }
          }

          // Recursively walks the fieldPath list and calls
          void updateFieldPath(def data, List fieldPath) {
            String pathHead = fieldPath[0];

            if (fieldPath.getLength() == 1) {
              if (data.get(pathHead) !== null) {
                updateField(data, pathHead);
              }
            } else {
              List fieldPathTail = fieldPath.subList(1, fieldPath.getLength());

              if (data.get(pathHead) instanceof List) {
                for (item in data[pathHead]) {
                  updateFieldPath(item, fieldPathTail);
                }
              } else if (data.get(pathHead) instanceof Map) {
                updateFieldPath(data[pathHead], fieldPathTail);
              }
            }
          }

          for (fieldPath in params.booleanFieldPaths) {
            updateFieldPath(ctx._source, fieldPath)
          }
        `,
        params: { booleanFieldPaths },
      };
    }

    const startReindex = (await callCluster('reindex', {
      refresh: true,
      waitForCompletion: false,
      body: reindexBody,
    })) as { task: string };

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.reindexStarted,
      reindexTaskId: startReindex.task,
      reindexTaskPercComplete: 0,
    });
  };

  /**
   * Polls Elasticsearch's Tasks API to see if the reindex operation has been completed.
   * @param reindexOp
   */
  const updateReindexStatus = async (reindexOp: ReindexSavedObject) => {
    const taskId = reindexOp.attributes.reindexTaskId;

    // Check reindexing task progress
    const taskResponse = await callCluster('tasks.get', {
      taskId,
      waitForCompletion: false,
    });

    if (taskResponse.completed) {
      if (taskResponse.task.status.created < taskResponse.task.status.total) {
        const failureExample = JSON.stringify(taskResponse.response.failures[0]);
        throw Boom.badData(`Reindexing failed with failures like: ${failureExample}`);
      }

      // Delete the task from ES .tasks index
      const deleteTaskResp = await callCluster('delete', {
        index: '.tasks',
        type: 'task',
        id: taskId,
      });

      if (deleteTaskResp.result !== 'deleted') {
        throw Boom.badImplementation(`Could not delete reindexing task ${taskId}`);
      }

      // Update the status
      return actions.updateReindexOp(reindexOp, {
        lastCompletedStep: ReindexStep.reindexCompleted,
        reindexTaskPercComplete: 1,
      });
    } else {
      const perc = taskResponse.task.status.created / taskResponse.task.status.total;
      return actions.updateReindexOp(reindexOp, {
        reindexTaskPercComplete: perc,
      });
    }
  };

  /**
   * Creates an alias that points the old index to the new index, deletes the old index.
   * @param reindexOp
   */
  const switchAlias = async (reindexOp: ReindexSavedObject) => {
    const { indexName, newIndexName } = reindexOp.attributes;

    const existingAliases = (await callCluster('indices.getAlias', {
      index: indexName,
    }))[indexName].aliases;

    const extraAlises = Object.keys(existingAliases).map(aliasName => ({
      add: { index: newIndexName, alias: aliasName, ...existingAliases[aliasName] },
    }));

    const aliasResponse = await callCluster('indices.updateAliases', {
      body: {
        actions: [
          { add: { index: newIndexName, alias: indexName } },
          { remove_index: { index: indexName } },
          ...extraAlises,
        ],
      },
    });

    if (!aliasResponse.acknowledged) {
      throw Boom.badImplementation(`Index aliases could not be created.`);
    }

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.aliasCreated,
      // Only set to completed if this is not an ML index.
      status: actions.isMlIndex(indexName) ? ReindexStatus.inProgress : ReindexStatus.completed,
    });
  };

  /**
   * Turn off 'upgrade mode' to resume ML jobs if this reindex is the only running ML ReindexOp.
   * @param reindexOp
   */
  const unsetMlUpgradeMode = async (reindexOp: ReindexSavedObject) => {
    // In theory the reindexOp should never get passed through this function in this case
    // because it should already be marked as completed. However, let's be safe.
    if (!actions.isMlIndex(reindexOp.attributes.indexName)) {
      return actions.updateReindexOp(reindexOp, {
        lastCompletedStep: ReindexStep.mlUpgradeModeUnset,
        status: ReindexStatus.completed,
      });
    }

    await actions.decrementMlReindexes();
    await actions.runWhileMlLocked(async mlDoc => {
      if (mlDoc.attributes.mlReindexCount === 0) {
        const res = await callCluster('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=false',
          method: 'POST',
        });

        if (!res.acknowledged) {
          throw new Error(`Could not resume ML jobs`);
        }
      }

      return mlDoc;
    });

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.mlUpgradeModeUnset,
      status: ReindexStatus.completed,
    });
  };

  // ------ The service itself

  return {
    async detectReindexWarnings(indexName: string) {
      const flatSettings = await actions.getFlatSettings(indexName);
      if (!flatSettings) {
        return null;
      } else {
        return getReindexWarnings(flatSettings);
      }
    },

    async createReindexOperation(indexName: string) {
      const indexExists = await callCluster('indices.exists', { index: indexName });
      if (!indexExists) {
        throw Boom.notFound(`Index ${indexName} does not exist in this cluster.`);
      }

      const existingReindexOps = await actions.findReindexOperations(indexName);
      if (existingReindexOps.total !== 0) {
        const existingOp = existingReindexOps.saved_objects[0];
        if (existingOp.attributes.status === ReindexStatus.failed) {
          // Delete the existing one if it failed to give a chance to retry.
          await actions.deleteReindexOp(existingOp);
        } else {
          throw Boom.badImplementation(`A reindex operation already in-progress for ${indexName}`);
        }
      }

      return actions.createReindexOp(indexName);
    },

    async findReindexOperation(indexName: string) {
      const findResponse = await actions.findReindexOperations(indexName);

      // Bail early if it does not exist or there is more than one.
      if (findResponse.total === 0) {
        return null;
      } else if (findResponse.total > 1) {
        throw Boom.badImplementation(`More than one reindex operation found for ${indexName}`);
      }

      return findResponse.saved_objects[0];
    },

    findAllByStatus: actions.findAllByStatus,

    async processNextStep(reindexOp: ReindexSavedObject) {
      return actions.runWhileLocked(reindexOp, async lockedReindexOp => {
        try {
          switch (lockedReindexOp.attributes.lastCompletedStep) {
            case ReindexStep.created:
              lockedReindexOp = await setMlUpgradeMode(lockedReindexOp);
              break;
            case ReindexStep.mlUpgradeModeSet:
              lockedReindexOp = await setReadonly(lockedReindexOp);
              break;
            case ReindexStep.readonly:
              lockedReindexOp = await createNewIndex(lockedReindexOp);
              break;
            case ReindexStep.newIndexCreated:
              lockedReindexOp = await startReindexing(lockedReindexOp);
              break;
            case ReindexStep.reindexStarted:
              lockedReindexOp = await updateReindexStatus(lockedReindexOp);
              break;
            case ReindexStep.reindexCompleted:
              lockedReindexOp = await switchAlias(lockedReindexOp);
              break;
            case ReindexStep.aliasCreated:
              lockedReindexOp = await unsetMlUpgradeMode(lockedReindexOp);
              break;
            default:
              break;
          }
        } catch (e) {
          // Trap the exception and add the message to the object so the UI can display it.
          lockedReindexOp = await actions.updateReindexOp(lockedReindexOp, {
            status: ReindexStatus.failed,
            errorMessage: e instanceof Error ? e.stack : e.toString(),
          });

          await actions.cleanupChanges(lockedReindexOp.attributes.indexName);
        }

        return lockedReindexOp;
      });
    },

    async pauseReindexOperation(indexName: string) {
      const reindexOp = await this.findReindexOperation(indexName);

      if (!reindexOp) {
        throw new Error(`No reindex operation found for index ${indexName}`);
      }

      return actions.runWhileLocked(reindexOp, op => {
        if (op.attributes.status !== ReindexStatus.inProgress) {
          throw new Error(`Reindex operation must be inProgress in order to be paused.`);
        }

        return actions.updateReindexOp(op, { status: ReindexStatus.paused });
      });
    },

    async resumeReindexOperation(indexName: string) {
      const reindexOp = await this.findReindexOperation(indexName);

      if (!reindexOp) {
        throw new Error(`No reindex operation found for index ${indexName}`);
      }

      return actions.runWhileLocked(reindexOp, op => {
        if (op.attributes.status !== ReindexStatus.paused) {
          throw new Error(`Reindex operation must be paused in order to be resumed.`);
        }

        return actions.updateReindexOp(op, { status: ReindexStatus.inProgress });
      });
    },
  };
};
