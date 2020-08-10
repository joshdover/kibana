/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { Plugin, Logger, CoreSetup, CoreStart, PluginInitializerContext } from 'src/core/server';

import { Service, IService, AlertingBuiltinsDeps } from './types';
import { getService as getServiceIndexThreshold } from './alert_types/index_threshold';
import { registerBuiltInAlertTypes } from './alert_types';
import { BUILT_IN_ALERTS_FEATURE } from './feature';

export class AlertingBuiltinsPlugin implements Plugin<IService, IService> {
  private readonly logger: Logger;
  private readonly service: Service;

  constructor(ctx: PluginInitializerContext) {
    this.logger = ctx.logger.get();
    this.service = {
      indexThreshold: getServiceIndexThreshold(),
      logger: this.logger,
    };
  }

  public setup(core: CoreSetup, { alerts, features }: AlertingBuiltinsDeps): IService {
    features.registerFeature(BUILT_IN_ALERTS_FEATURE);

    registerBuiltInAlertTypes({
      service: this.service,
      router: core.http.createRouter(),
      alerts,
      baseRoute: '/api/alerting_builtins',
    });
    return this.service;
  }

  public start(core: CoreStart): IService {
    return this.service;
  }

  public async stop(): Promise<void> {}
}
