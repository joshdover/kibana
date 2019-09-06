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

import {
  PluginInitializerContext,
  Plugin,
  CoreSetup,
  IContextContainer,
  PluginOpaqueId,
  APICaller,
} from '../../../core/server';
import { registerSearchRoute } from './routes';
import { ISearchSetup, TSearchStrategyProvider } from './i_setup_contract';
import { ISearchContext } from './i_search_context';
import { ISearchStrategy, IKibanaSearchRequest } from './types';
import { IKibanaSearchResponse } from '../common';
import { createApi } from './create_api';

const DEFAULT_SEARCH_STRATEGY_KEY = 'default';

declare module 'kibana/server' {
  interface RequestHandlerContext {
    search?: {
      search: <TRequest extends IKibanaSearchRequest, TResponse extends IKibanaSearchResponse<any>>(
        request: TRequest,
        name: string
      ) => Promise<TResponse>;
    };
  }
}

export class SearchServerPlugin implements Plugin<ISearchSetup, void> {
  private searchStrategies = new Map<
    string,
    (caller: APICaller) => Promise<ISearchStrategy<any, any>>
  >();
  private defaultSearchStrategyName: string = DEFAULT_SEARCH_STRATEGY_KEY;

  private contextContainer?: IContextContainer<
    ISearchContext,
    ISearchStrategy<any, any>,
    [APICaller]
  >;

  constructor(private initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup): ISearchSetup {
    const router = core.http.createRouter();
    registerSearchRoute(router);

    this.contextContainer = core.context.createContextContainer<
      ISearchContext,
      ISearchStrategy<any, any>,
      [APICaller]
    >();

    core.http.registerRouteHandlerContext<'search'>('search', context => {
      const searchAPI = createApi({
        caller: context.core!.elasticsearch.dataClient.callAsCurrentUser,
        defaultSearchStrategyName: this.defaultSearchStrategyName,
        searchStrategies: this.searchStrategies,
      });
      try {
        this.contextContainer!.registerContext(
          this.initializerContext.opaqueId,
          'search',
          () => searchAPI
        );
      } catch (e) {
        console.log('error: ' + e);
      }
      return searchAPI;
    });

    this.contextContainer!.registerContext(this.initializerContext.opaqueId, 'core', () => core);

    return {
      registerSearchStrategyContext: this.contextContainer!.registerContext,
      registerSearchStrategyProvider: (
        plugin: PluginOpaqueId,
        name: string,
        strategyProvider: TSearchStrategyProvider<any, any>
      ) => {
        this.searchStrategies.set(
          name,
          this.contextContainer!.createHandler(plugin, strategyProvider)
        );
      },
      __LEGACY: {
        search: (caller: APICaller, request: IKibanaSearchRequest, strategyName: string) => {
          const searchAPI = createApi({
            caller,
            defaultSearchStrategyName: this.defaultSearchStrategyName,
            searchStrategies: this.searchStrategies,
          });
          return searchAPI.search(request, strategyName);
        },
      },
    };
  }

  public start() {}
  public stop() {}
}
