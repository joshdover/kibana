/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { APICaller } from 'kibana/server';
import { IKibanaSearchRequest, IKibanaSearchResponse } from '../common';
import { TSearchStrategyProviderEnhanced } from './i_setup_contract';

export interface ISearchApi<
  TRequest extends IKibanaSearchRequest = IKibanaSearchRequest,
  TResponse extends IKibanaSearchResponse<any> = IKibanaSearchResponse<any>
> {
  search: (request: TRequest, name?: string) => TResponse;
}

export function createApi({
  caller,
  defaultSearchStrategyName,
  searchStrategies,
}: {
  searchStrategies: Map<string, TSearchStrategyProviderEnhanced<any, any>>;
  defaultSearchStrategyName: string;
  caller: APICaller;
}) {
  const api = {
    search: async (request: IKibanaSearchRequest, strategyName: string) => {
      const name = strategyName ? strategyName : defaultSearchStrategyName;
      const strategyProvider = searchStrategies.get(name);
      if (!strategyProvider) {
        throw new Error(`No strategy found for ${strategyName}`);
      }

      // Give providers access to other search stratgies by injecting this function
      const strategy = await strategyProvider(caller, api.search);
      if (!strategy) {
        throw new Error(`No strategy named ${name}`);
      }
      return strategy.search(request);
    },
  };

  return api;
}
