/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { Observable } from 'rxjs';
import { CoreSetup, SharedGlobalConfig } from 'kibana/server';
import { registerValueSuggestionsRoute } from './value_suggestions_route';
import { DataRequestHandlerContext } from '../types';

export function registerRoutes({ http }: CoreSetup, config$: Observable<SharedGlobalConfig>): void {
  const router = http.createRouter<DataRequestHandlerContext>();

  registerValueSuggestionsRoute(router, config$);
}
