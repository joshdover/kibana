/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { StatelessComponent } from 'react';

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  IconColor,
} from '@elastic/eui';

import {
  DeprecationInfo,
  MIGRATION_DEPRECATION_LEVEL as LEVEL,
} from 'src/core_plugins/elasticsearch';
import { UpgradeCheckupStatus } from '../../../../server/lib/es_migration_apis';

// TODO: use TS enum?
const LEVEL_MAP = {
  none: 0,
  info: 1,
  warning: 2,
  critical: 3,
};
const REVERSE_LEVEL_MAP: { [idx: number]: LEVEL } = _.invert(LEVEL_MAP);
const COLOR_MAP: { [level: string]: IconColor } = {
  none: 'success',
  info: 'primary',
  warning: 'warning',
  critical: 'danger',
};
const ACTION_MAP: { [level: string]: string } = {
  info: 'No action required, but it is advised to read about the change.',
  warning: '',
  critical: 'This issue must be resolved to upgrade.',
};

const sortByLevelDesc = (a: DeprecationInfo, b: DeprecationInfo) => {
  return -1 * (LEVEL_MAP[a.level] - LEVEL_MAP[b.level]);
};

const DeprecationAction: StatelessComponent<{ deprecation: DeprecationInfo }> = ({
  deprecation,
}) => {
  const action = ACTION_MAP[deprecation.level];
  if (action) {
    return (
      <div>
        <EuiSpacer size="m" />
        <EuiText>
          <h6>Action</h6>
          <p>{action}</p>
        </EuiText>
      </div>
    );
  } else {
    return null;
  }
};

interface DeprecationsProps {
  deprecations: DeprecationInfo[];
  emptyMessage?: string;
}

export const Deprecations: StatelessComponent<DeprecationsProps> = ({
  deprecations,
  emptyMessage,
}) => {
  if (deprecations.length === 0) {
    return (
      <EuiText color="subdued">
        <p>{emptyMessage}</p>
      </EuiText>
    );
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="none">
      {deprecations.sort(sortByLevelDesc).map(dep => (
        <EuiFlexItem className="upgrade-checkup__deprecation-cell" key={dep.message}>
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow>
              <EuiText>
                <h4>
                  <EuiIcon type="dot" color={COLOR_MAP[dep.level]} /> {dep.message}
                </h4>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size="s" href={dep.url} target="_blank">
                Read Documentation
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>

          <DeprecationAction deprecation={dep} />

          <EuiSpacer size="m" />

          <EuiText color="subdued">
            <h6>Details</h6>
            <p>{dep.details}</p>
          </EuiText>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

interface IndexDeprecationsProps {
  indices: UpgradeCheckupStatus['indices'];
}

export const IndexDeprecations: StatelessComponent<IndexDeprecationsProps> = ({ indices }) => {
  if (Object.keys(indices).length === 0) {
    return (
      <EuiText color="subdued">
        <p>No index deprecations.</p>
      </EuiText>
    );
  }

  return (
    <div>
      {Object.keys(indices).map(indexName => (
        <div key={indexName}>
          <EuiText className="upgrade-checkup__index-deprecation-header">
            <h3>{indexName}</h3>
          </EuiText>
          <EuiSpacer size="s" />
          <Deprecations deprecations={indices[indexName]!.deprecations} />
        </div>
      ))}
    </div>
  );
};

export const DeprecationSummary: StatelessComponent<{ deprecations: DeprecationInfo[] }> = ({
  deprecations,
}) => {
  if (deprecations.length === 0) {
    return <EuiHealth color="success">No problems</EuiHealth>;
  }

  const levels = deprecations.map(d => LEVEL_MAP[d.level]);
  const highest = Math.max(...levels);
  const highestLevel = REVERSE_LEVEL_MAP[highest];
  const numHighest = deprecations.filter(d => d.level === highestLevel).length;
  const color = COLOR_MAP[highestLevel];

  return <EuiHealth color={color}>{`${numHighest} ${highestLevel}`}</EuiHealth>;
};
