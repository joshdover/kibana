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

import { RequestHandlerContext } from 'kibana/server';
import { TSearchStrategyProvider } from './i_setup_contract';

export interface IKibanaSearchRequest {
  id?: string;
  debug?: boolean;
}

export interface IKibanaSearchResponse<THits> {
  percentComplete: number;

  hits: THits[];
}

export interface ISearchStrategy<TRequest, TResponse> {
  search: (request: TRequest) => Promise<TResponse>;
}

export interface ISearchApi {
  getSearchStrategy: <TRequest, TResponse extends IKibanaSearchResponse<any>>(
    name?: string
  ) => ISearchStrategy<TRequest, TResponse>;

  search: <TRequest, TResponse extends IKibanaSearchResponse<any>>(
    request: TRequest,
    name?: string
  ) => Promise<TResponse>;
}

export interface ISearchDependenciesInternal {
  searchStrategies: Map<string, () => Promise<ISearchStrategy<any, any>>>;
  defaultSearchStrategy: string;
  context: Partial<RequestHandlerContext>;
}

export interface ISearchDependencies extends ISearchDependenciesInternal {
  api: Readonly<ISearchApi>;
}
