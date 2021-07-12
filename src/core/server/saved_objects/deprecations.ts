/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { estypes } from '@elastic/elasticsearch';
import { schema } from '@kbn/config-schema';
import { string } from 'joi';
import { DeprecationsDetails, DeprecationsServiceSetup } from '../deprecations';
import { IRouter } from '../http';
import { SavedObjectTypeRegistry } from './saved_objects_type_registry';

interface Deps {
  deprecations: DeprecationsServiceSetup;
  router: IRouter;
  typeRegistry: SavedObjectTypeRegistry;
}

const registerDeprecations = ({ deprecations, router, typeRegistry }: Deps) => {
  deprecations.registerDeprecations({
    getDeprecations: async ({ esClient }) => {
      const unknownTypesQuery: estypes.QueryDslQueryContainer = {
        bool: {
          must_not: typeRegistry.getAllTypes().map(({ name }) => ({
            term: { type: name },
          })),
        },
      };

      const response = await esClient.asInternalUser.search({
        index: '.kibana', // todo
        body: {
          query: unknownTypesQuery,
          aggregations: {
            types: {
              terms: {
                field: 'type',
                size: 100,
                order: { _count: 'desc' },
              },
            },
          },
        },
      });

      const { sum_other_doc_count: otherUnknownTypeCount, buckets: unknownTypeBuckets } = response
        .body.aggregations?.types as estypes.AggregationsTermsAggregate<{
        key: string;
        doc_count: number;
      }>;

      const unknownWarnings: DeprecationsDetails[] = unknownTypeBuckets.map(
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ({ key, doc_count }) => ({
          message: `${doc_count} Saved Objects of disabled type detected: ${key}`,
          level: `critical`,
          deprecationType: `feature`,
          correctiveActions: {
            api: {
              path: `/internal/saved_objects/delete_unknown_types`,
              method: `POST`,
              body: {
                type: key,
              },
            },
          },
          manualSteps: [
            `Re-enable any disabled plugins OR`,
            `Delete the documents with type ${key} from the ${'.kibana'} index using curl:`,
            `curl -XPOST "{elasticsearch}/${'.kibana'}/_delete_by_query" -H 'Content-Type: application/json' -d'{"query":{"bool":{"must":[{"term":{"type":"${key}"}}]}}}'`,
          ],
        })
      );

      if (otherUnknownTypeCount === 0) {
        return unknownWarnings;
      }

      return [
        ...unknownWarnings,
        {
          message: `${otherUnknownTypeCount} additional documents of unknown Saved Object types detected`,
          level: `critical`,
          deprecationType: `feature`,
          correctiveActions: {
            manualSteps: [
              `Delete the other unknown types to be able to see the remaining unknown types.`,
            ],
          },
        },
      ];
    },
  });

  router.post(
    {
      path: `/internal/saved_objects/delete_unknown_types`,
      validate: {
        body: schema.object({
          type: schema.string(),
        }),
      },
    },
    async (context, req, res) => {
      const { type: typeToDelete } = req.body;
      const typeRegistered = typeRegistry.getAllTypes().find(({ name }) => name === typeToDelete);
      if (typeRegistered) {
        return res.badRequest({ body: `Deleting known types [${typeToDelete}] is not allowed.` });
      }

      const results = await context.core.elasticsearch.client.asInternalUser.deleteByQuery({
        index: '.kibana', // todo
        body: {
          query: {
            bool: {
              must: [{ term: { type: typeToDelete } }],
            },
          },
        },
      });

      return res.ok();
    }
  );
};
