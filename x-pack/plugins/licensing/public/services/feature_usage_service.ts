/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

// Prefer importing entire lodash library, e.g. import { get } from "lodash"
// eslint-disable-next-line no-restricted-imports
import isDate from 'lodash/isDate';
import type { HttpStart } from 'src/core/public';
import type { LicenseType } from '../../common/types';

/** @public */
export interface FeatureUsageServiceSetup {
  /**
   * Register a feature to be able to notify of it's usages using the {@link FeatureUsageServiceStart | service start contract}.
   */
  register(featureName: string, licenseType: LicenseType): void;
}

/** @public */
export interface FeatureUsageServiceStart {
  /**
   * Notify of a registered feature usage at given time.
   *
   * @param featureName - the name of the feature to notify usage of
   * @param usedAt - Either a `Date` or an unix timestamp with ms. If not specified, it will be set to the current time.
   */
  notifyUsage(featureName: string, usedAt?: Date | number): Promise<void>;
}

interface StartDeps {
  http: HttpStart;
}

/**
 * @internal
 */
export class FeatureUsageService {
  private readonly featuresToRegister = new Set<{
    featureName: string;
    licenseType: LicenseType;
  }>();
  public setup(): FeatureUsageServiceSetup {
    return {
      register: (featureName, licenseType) => {
        this.featuresToRegister.add({ featureName, licenseType });
      },
    };
  }

  public start({ http }: StartDeps): FeatureUsageServiceStart {
    const registrationPromise = this.registerFeatures({ http });

    return {
      notifyUsage: async (featureName, usedAt = Date.now()) => {
        // Skip notification if on logged-out page
        if (http.anonymousPaths.isAnonymous(window.location.pathname)) return;

        // Wait for the registration to complete
        await registrationPromise;

        const lastUsed = isDate(usedAt) ? usedAt.getTime() : usedAt;
        await http.post('/internal/licensing/feature_usage/notify', {
          body: JSON.stringify({
            featureName,
            lastUsed,
          }),
        });
      },
    };
  }

  private async registerFeatures({ http }: StartDeps) {
    // Skip registration if on logged-out page
    // NOTE: this only works because the login page does a full-page refresh after logging in
    // If this is ever changed, this code will need to buffer registrations and call them after the user logs in.
    if (http.anonymousPaths.isAnonymous(window.location.pathname)) return;

    for (const { featureName, licenseType } of this.featuresToRegister) {
      await http.post('/internal/licensing/feature_usage/register', {
        body: JSON.stringify({
          featureName,
          licenseType,
        }),
      });
    }
  }
}
