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

import { InjectedMetadataStart } from '../injected_metadata';
import { ContextContainer, ContextContainerImplementation } from './context';

interface StartDeps {
  injectedMetadata: InjectedMetadataStart;
  pluginDependencies: ReadonlyMap<string, string[]>;
}

/** @internal */
export class ContextService {
  public start({ injectedMetadata, pluginDependencies }: StartDeps): ContextStart {
    return {
      createContextContainer: <T extends {}, U extends any[] = []>() =>
        new ContextContainerImplementation<T, U>(pluginDependencies),
    };
  }
}

/** @internal */
export interface ContextStart {
  /**
   * Creates a new {@link ContextContainer} for a service owner.
   */
  createContextContainer<
    TContext extends {},
    TProviderParameters extends any[] = []
  >(): ContextContainer<TContext, TProviderParameters>;
}
