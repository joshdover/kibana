/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { CallCluster } from 'src/legacy/core_plugins/elasticsearch';
import {
  ReindexOperation,
  ReindexSavedObject,
  ReindexStatus,
  ReindexStep,
  ReindexWarning,
} from '../../../common/types';
import { ReindexService, reindexServiceFactory } from './reindex_service';

describe('reindexService', () => {
  let actions: jest.Mocked<any>;
  let callCluster: jest.Mock<CallCluster>;
  let service: ReindexService;

  const updateMockImpl = (reindexOp: ReindexSavedObject, attrs: Partial<ReindexOperation> = {}) =>
    Promise.resolve({
      ...reindexOp,
      attributes: { ...reindexOp.attributes, ...attrs },
    } as ReindexSavedObject);

  const unimplemented = (name: string) => () =>
    Promise.reject(`Mock function ${name} was not implemented!`);

  beforeEach(() => {
    actions = {
      createReindexOp: jest.fn(unimplemented('createReindexOp')),
      deleteReindexOp: jest.fn(unimplemented('deleteReindexOp')),
      updateReindexOp: jest.fn(updateMockImpl),
      acquireLock: jest.fn((reindexOp: ReindexSavedObject) => reindexOp),
      releaseLock: jest.fn((reindexOp: ReindexSavedObject) => reindexOp),
      releaseLocks: jest.fn(unimplemented('releaseLocks')),
      findReindexOperations: jest.fn(unimplemented('findReindexOperations')),
      findAllInProgressOperations: jest.fn(unimplemented('findAllInProgressOperations')),
      getBooleanFieldPaths: jest.fn(unimplemented('getBooleanFieldPaths')),
      getFlatSettings: jest.fn(unimplemented('getFlatSettings')),
      cleanupChanges: jest.fn(),
      isMlIndex: jest.fn(() => false),
      incrementMlReindexes: jest.fn(unimplemented('incrementMlReindexes')),
      decrementMlReindexes: jest.fn(unimplemented('incrementMlReindexes')),
      runWhileMlLocked: jest.fn(unimplemented('runWhileMlLocked')),
    };
    callCluster = jest.fn();
    service = reindexServiceFactory(callCluster, actions);
  });

  describe('detectReindexWarnings', () => {
    it('fetches reindex warnings from flat settings', async () => {
      actions.getFlatSettings.mockResolvedValueOnce({
        settings: {},
        mappings: {
          _doc: {
            properties: { https: { type: 'boolean' } },
            _all: { enabled: true },
          },
        },
      });

      const reindexWarnings = await service.detectReindexWarnings('myIndex');
      expect(reindexWarnings).toEqual([ReindexWarning.allField, ReindexWarning.booleanFields]);
    });

    it('returns null if index does not exist', async () => {
      actions.getFlatSettings.mockResolvedValueOnce(null);
      const reindexWarnings = await service.detectReindexWarnings('myIndex');
      expect(reindexWarnings).toBeNull();
    });
  });

  describe('createReindexOperation', () => {
    it('creates new reindex operation', async () => {
      callCluster.mockResolvedValueOnce(true); // indices.exist
      actions.findReindexOperations.mockResolvedValueOnce({ total: 0 });
      actions.createReindexOp.mockResolvedValueOnce();

      await service.createReindexOperation('myIndex');

      expect(actions.createReindexOp).toHaveBeenCalledWith('myIndex');
    });

    it('fails if index does not exist', async () => {
      callCluster.mockResolvedValueOnce(false); // indices.exist
      await expect(service.createReindexOperation('myIndex')).rejects.toThrow();
      expect(actions.createReindexOp).not.toHaveBeenCalled();
    });

    it('deletes existing operation if it failed', async () => {
      callCluster.mockResolvedValueOnce(true); // indices.exist
      actions.findReindexOperations.mockResolvedValueOnce({
        saved_objects: [{ id: 1, attributes: { status: ReindexStatus.failed } }],
        total: 1,
      });
      actions.deleteReindexOp.mockResolvedValueOnce();
      actions.createReindexOp.mockResolvedValueOnce();

      await service.createReindexOperation('myIndex');
      expect(actions.deleteReindexOp).toHaveBeenCalledWith({
        id: 1,
        attributes: { status: ReindexStatus.failed },
      });
    });

    it('fails if existing operation did not fail', async () => {
      callCluster.mockResolvedValueOnce(true); // indices.exist
      actions.findReindexOperations.mockResolvedValueOnce({
        saved_objects: [{ id: 1, attributes: { status: ReindexStatus.inProgress } }],
        total: 1,
      });

      await expect(service.createReindexOperation('myIndex')).rejects.toThrow();
      expect(actions.deleteReindexOp).not.toHaveBeenCalled();
      expect(actions.createReindexOp).not.toHaveBeenCalled();
    });
  });

  describe('findReindexOperation', () => {
    it('returns the only result', async () => {
      actions.findReindexOperations.mockResolvedValue({ total: 1, saved_objects: ['fake object'] });
      await expect(service.findReindexOperation('myIndex')).resolves.toEqual('fake object');
    });

    it('returns null if there are no results', async () => {
      actions.findReindexOperations.mockResolvedValue({ total: 0 });
      await expect(service.findReindexOperation('myIndex')).resolves.toBeNull();
    });

    it('fails if there is more than 1 result', async () => {
      actions.findReindexOperations.mockResolvedValue({ total: 2 });
      await expect(service.findReindexOperation('myIndex')).rejects.toThrow();
    });
  });

  describe('processNextStep', () => {
    describe('locking', () => {
      // These tests depend on an implementation detail that if no status is set, the state machine
      // is not activated, just the locking mechanism.

      it('locks and unlocks if object is unlocked', async () => {
        const reindexOp = { id: '1', attributes: { locked: null } } as ReindexSavedObject;
        await service.processNextStep(reindexOp);

        expect(actions.acquireLock).toHaveBeenCalled();
        expect(actions.releaseLock).toHaveBeenCalled();
      });
    });
  });

  describe('state machine, lastCompletedStep ===', () => {
    const defaultAttributes = {
      indexName: 'myIndex',
      newIndexName: 'myIndex-reindex-0',
    };
    const settingsMappings = {
      settings: { 'index.number_of_replicas': 7, 'index.blocks.write': true },
      mappings: { _doc: { properties: { timestampl: { type: 'date' } } } },
    };

    describe('created', () => {
      const reindexOp = {
        id: '1',
        attributes: { ...defaultAttributes, lastCompletedStep: ReindexStep.created },
      } as ReindexSavedObject;
      const mlReindexOp = {
        id: '2',
        attributes: { ...reindexOp.attributes, indexName: '.ml-anomalies' },
      } as ReindexSavedObject;

      it('does nothing if index is not an ML index', async () => {
        actions.isMlIndex.mockReturnValueOnce(false);
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.mlUpgradeModeSet);
        expect(actions.incrementMlReindexes).not.toHaveBeenCalled();
        expect(actions.runWhileMlLocked).not.toHaveBeenCalled();
        expect(callCluster).not.toHaveBeenCalled();
      });

      it('increments ML reindexes and calls ML stop endpoint', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.incrementMlReindexes.mockResolvedValueOnce();
        actions.runWhileMlLocked.mockImplementationOnce(async (f: any) => f());
        // Mock call to /_ml/set_upgrade_mode?enabled=true
        callCluster.mockResolvedValueOnce({ acknowledged: true });

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.mlUpgradeModeSet);
        expect(actions.incrementMlReindexes).toHaveBeenCalled();
        expect(actions.runWhileMlLocked).toHaveBeenCalled();
        expect(callCluster).toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=true',
          method: 'POST',
        });
      });

      it('fails if ML reindexes cannot be incremented', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.incrementMlReindexes.mockRejectedValueOnce(new Error(`Can't lock!`));

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.created);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage!.includes(`Can't lock!`)).toBeTruthy();
        expect(callCluster).not.toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=true',
          method: 'POST',
        });
      });

      it('fails if ML doc cannot be locked', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.incrementMlReindexes.mockResolvedValueOnce();
        actions.runWhileMlLocked.mockRejectedValueOnce(new Error(`Can't lock!`));

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.created);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage!.includes(`Can't lock!`)).toBeTruthy();
        expect(callCluster).not.toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=true',
          method: 'POST',
        });
      });

      it('fails if ML endpoint fails', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.incrementMlReindexes.mockResolvedValueOnce();
        actions.runWhileMlLocked.mockImplementationOnce(async (f: any) => f());
        // Mock call to /_ml/set_upgrade_mode?enabled=true
        callCluster.mockResolvedValueOnce({ acknowledged: false });

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.created);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage!.includes('Could not stop ML jobs')).toBeTruthy();
        expect(callCluster).toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=true',
          method: 'POST',
        });
      });
    });

    describe('mlJobsStopped', () => {
      const reindexOp = {
        id: '1',
        attributes: { ...defaultAttributes, lastCompletedStep: ReindexStep.mlUpgradeModeSet },
      } as ReindexSavedObject;

      it('blocks writes and updates lastCompletedStep', async () => {
        callCluster.mockResolvedValueOnce({ acknowledged: true });
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.readonly);
        expect(callCluster).toHaveBeenCalledWith('indices.putSettings', {
          index: 'myIndex',
          body: { 'index.blocks.write': true },
        });
      });

      it('fails if setting updates are not acknowledged', async () => {
        callCluster.mockResolvedValueOnce({ acknowledged: false });
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.mlUpgradeModeSet);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage).not.toBeNull();
      });

      it('fails if setting updates fail', async () => {
        callCluster.mockRejectedValueOnce(new Error('blah!'));
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.mlUpgradeModeSet);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage).not.toBeNull();
      });
    });

    describe('readonly', () => {
      const reindexOp = {
        id: '1',
        attributes: { ...defaultAttributes, lastCompletedStep: ReindexStep.readonly },
      } as ReindexSavedObject;

      // The more intricate details of how the settings are chosen are test separately.
      it('creates new index with settings and mappings and updates lastCompletedStep', async () => {
        actions.getFlatSettings.mockResolvedValueOnce(settingsMappings);
        callCluster.mockResolvedValueOnce({ acknowledged: true }); // indices.create

        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.newIndexCreated);
        expect(callCluster).toHaveBeenCalledWith('indices.create', {
          index: 'myIndex-reindex-0',
          body: {
            // index.blocks.write should be removed from the settings for the new index.
            settings: { 'index.number_of_replicas': 7 },
            mappings: settingsMappings.mappings,
          },
        });
      });

      it('fails if create index is not acknowledged', async () => {
        callCluster
          .mockResolvedValueOnce({ myIndex: settingsMappings })
          .mockResolvedValueOnce({ acknowledged: false });
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.readonly);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage).not.toBeNull();
      });

      it('fails if create index fails', async () => {
        callCluster
          .mockResolvedValueOnce({ myIndex: settingsMappings })
          .mockRejectedValueOnce(new Error(`blah!`))
          .mockResolvedValueOnce({ acknowledged: true });
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.readonly);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage).not.toBeNull();

        // Original index should have been set back to allow reads.
        expect(actions.cleanupChanges).toHaveBeenCalledWith('myIndex');
      });
    });

    describe('newIndexCreated', () => {
      const reindexOp = {
        id: '1',
        attributes: { ...defaultAttributes, lastCompletedStep: ReindexStep.newIndexCreated },
      } as ReindexSavedObject;

      it('starts reindex, saves taskId, and updates lastCompletedStep', async () => {
        actions.getBooleanFieldPaths.mockResolvedValue([]);
        callCluster.mockResolvedValueOnce({ task: 'xyz' }); // reindex
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.reindexStarted);
        expect(updatedOp.attributes.reindexTaskId).toEqual('xyz');
        expect(updatedOp.attributes.reindexTaskPercComplete).toEqual(0);
        expect(callCluster).toHaveBeenLastCalledWith('reindex', {
          refresh: true,
          waitForCompletion: false,
          body: {
            source: { index: 'myIndex' },
            dest: { index: 'myIndex-reindex-0' },
          },
        });
      });

      it('adds painless script if there are boolean fields', async () => {
        actions.getBooleanFieldPaths.mockResolvedValue([['field1'], ['nested', 'field2']]);
        callCluster.mockResolvedValueOnce({ task: 'xyz' }); // reindex
        await service.processNextStep(reindexOp);
        const reindexBody = callCluster.mock.calls[0][1].body;
        expect(reindexBody.script.lang).toEqual('painless');
        expect(typeof reindexBody.script.source).toEqual('string');
        expect(reindexBody.script.params.booleanFieldPaths).toEqual([
          ['field1'],
          ['nested', 'field2'],
        ]);
      });

      it('fails if starting reindex fails', async () => {
        callCluster.mockRejectedValueOnce(new Error('blah!'));
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.newIndexCreated);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage).not.toBeNull();
      });
    });

    describe('reindexStarted', () => {
      const reindexOp = {
        id: '1',
        attributes: {
          ...defaultAttributes,
          lastCompletedStep: ReindexStep.reindexStarted,
          reindexTaskId: 'xyz',
        },
      } as ReindexSavedObject;

      describe('reindex task is not complete', () => {
        it('updates reindexTaskPercComplete', async () => {
          callCluster.mockResolvedValueOnce({
            completed: false,
            task: { status: { created: 10, total: 100 } },
          });
          const updatedOp = await service.processNextStep(reindexOp);
          expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.reindexStarted);
          expect(updatedOp.attributes.reindexTaskPercComplete).toEqual(0.1); // 10 / 100 = 0.1
        });
      });

      describe('reindex task is complete', () => {
        it('deletes task, updates reindexTaskPercComplete, updates lastCompletedStep', async () => {
          callCluster
            .mockResolvedValueOnce({
              completed: true,
              task: { status: { created: 100, total: 100 } },
            })
            .mockResolvedValueOnce({ result: 'deleted' });

          const updatedOp = await service.processNextStep(reindexOp);
          expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.reindexCompleted);
          expect(updatedOp.attributes.reindexTaskPercComplete).toEqual(1);
          expect(callCluster).toHaveBeenCalledWith('delete', {
            index: '.tasks',
            type: 'task',
            id: 'xyz',
          });
        });

        it('fails if docs created is less than total docs', async () => {
          callCluster.mockResolvedValueOnce({
            completed: true,
            task: { status: { created: 95, total: 100 } },
          });
          const updatedOp = await service.processNextStep(reindexOp);
          expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.reindexStarted);
          expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
          expect(updatedOp.attributes.errorMessage).not.toBeNull();
        });
      });
    });

    describe('reindexCompleted', () => {
      const reindexOp = {
        id: '1',
        attributes: { ...defaultAttributes, lastCompletedStep: ReindexStep.reindexCompleted },
      } as ReindexSavedObject;

      it('switches aliases, sets as complete, and updates lastCompletedStep', async () => {
        callCluster
          .mockResolvedValueOnce({ myIndex: { aliases: {} } })
          .mockResolvedValueOnce({ acknowledged: true });
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.completed);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.aliasCreated);
        expect(callCluster).toHaveBeenCalledWith('indices.updateAliases', {
          body: {
            actions: [
              { add: { index: 'myIndex-reindex-0', alias: 'myIndex' } },
              { remove_index: { index: 'myIndex' } },
            ],
          },
        });
      });

      it('moves existing aliases over to new index', async () => {
        callCluster
          .mockResolvedValueOnce({
            myIndex: {
              aliases: {
                myAlias: {},
                myFilteredAlias: { filter: { term: { https: true } } },
              },
            },
          })
          .mockResolvedValueOnce({ acknowledged: true });
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.completed);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.aliasCreated);
        expect(callCluster).toHaveBeenCalledWith('indices.updateAliases', {
          body: {
            actions: [
              { add: { index: 'myIndex-reindex-0', alias: 'myIndex' } },
              { remove_index: { index: 'myIndex' } },
              { add: { index: 'myIndex-reindex-0', alias: 'myAlias' } },
              {
                add: {
                  index: 'myIndex-reindex-0',
                  alias: 'myFilteredAlias',
                  filter: { term: { https: true } },
                },
              },
            ],
          },
        });
      });

      it('fails if switching aliases is not acknowledged', async () => {
        callCluster.mockResolvedValueOnce({ acknowledged: false });
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.reindexCompleted);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage).not.toBeNull();
      });

      it('fails if switching aliases fails', async () => {
        callCluster.mockRejectedValueOnce(new Error('blah!'));
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.reindexCompleted);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage).not.toBeNull();
      });
    });

    describe('aliasCreated', () => {
      const reindexOp = {
        id: '1',
        attributes: { ...defaultAttributes, lastCompletedStep: ReindexStep.aliasCreated },
      } as ReindexSavedObject;
      const mlReindexOp = {
        id: '2',
        attributes: { ...reindexOp.attributes, indexName: '.ml-anomalies' },
      } as ReindexSavedObject;

      it('does nothing if index is not an ML index', async () => {
        actions.isMlIndex.mockReturnValueOnce(false);
        const updatedOp = await service.processNextStep(reindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.mlUpgradeModeUnset);
        expect(callCluster).not.toHaveBeenCalled();
      });

      it('decrements ML reindexes and calls ML start endpoint if no remaining ML jobs', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.decrementMlReindexes.mockResolvedValueOnce();
        actions.runWhileMlLocked.mockImplementationOnce(async (f: any) =>
          f({ attributes: { mlReindexCount: 0 } })
        );
        // Mock call to /_ml/set_upgrade_mode?enabled=false
        callCluster.mockResolvedValueOnce({ acknowledged: true });

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.mlUpgradeModeUnset);
        expect(callCluster).toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=false',
          method: 'POST',
        });
      });

      it('does not call ML start endpoint if there are remaining ML jobs', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.decrementMlReindexes.mockResolvedValueOnce();
        actions.runWhileMlLocked.mockImplementationOnce(async (f: any) =>
          f({ attributes: { mlReindexCount: 2 } })
        );
        // Mock call to /_ml/set_upgrade_mode?enabled=false
        callCluster.mockResolvedValueOnce({ acknowledged: true });
        actions.releaseLocks.mockResolvedValueOnce();

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.mlUpgradeModeUnset);
        expect(callCluster).not.toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=false',
          method: 'POST',
        });
      });

      it('fails if ML reindexes cannot be decremented', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        // Mock unable to lock ml doc
        actions.decrementMlReindexes.mockRejectedValueOnce(new Error(`Can't lock!`));

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.aliasCreated);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage!.includes(`Can't lock!`)).toBeTruthy();
        expect(callCluster).not.toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=false',
          method: 'POST',
        });
      });

      it('fails if ML doc cannot be locked', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.decrementMlReindexes.mockResolvedValueOnce();
        // Mock unable to lock ml doc
        actions.runWhileMlLocked.mockRejectedValueOnce(new Error(`Can't lock!`));

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.aliasCreated);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(updatedOp.attributes.errorMessage!.includes(`Can't lock!`)).toBeTruthy();
        expect(callCluster).not.toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=false',
          method: 'POST',
        });
      });

      it('fails if ML endpoint fails', async () => {
        actions.isMlIndex.mockReturnValueOnce(true);
        actions.decrementMlReindexes.mockResolvedValueOnce();
        actions.runWhileMlLocked.mockImplementationOnce(async (f: any) =>
          f({ attributes: { mlReindexCount: 0 } })
        );
        // Mock call to /_ml/set_upgrade_mode?enabled=true
        callCluster.mockResolvedValueOnce({ acknowledged: false });

        const updatedOp = await service.processNextStep(mlReindexOp);
        expect(updatedOp.attributes.lastCompletedStep).toEqual(ReindexStep.aliasCreated);
        expect(updatedOp.attributes.status).toEqual(ReindexStatus.failed);
        expect(
          updatedOp.attributes.errorMessage!.includes('Could not resume ML jobs')
        ).toBeTruthy();
        expect(callCluster).toHaveBeenCalledWith('transport.request', {
          path: '/_ml/set_upgrade_mode?enabled=false',
          method: 'POST',
        });
      });
    });
  });
});
