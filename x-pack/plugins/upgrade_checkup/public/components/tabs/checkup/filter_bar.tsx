/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import _ from 'lodash';
import React from 'react';

import {
  // @ts-ignore
  EuiFilterButton,
  // @ts-ignore
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  // @ts-ignore
  EuiNotificationBadge,
  EuiText,
} from '@elastic/eui';
import { DeprecationInfo } from 'src/core_plugins/elasticsearch';
import { LevelFilterOption } from './types';

interface LevelFilterBarProps {
  allDeprecations?: DeprecationInfo[];
  currentFilter: Set<LevelFilterOption>;
  onFilterChange(level: LevelFilterOption): void;
}

const allFilterOptions = Object.keys(LevelFilterOption) as LevelFilterOption[];

export class LevelFilterBar extends React.Component<LevelFilterBarProps> {
  public render() {
    const { allDeprecations = [], currentFilter } = this.props;

    const levelGroups = _.groupBy(allDeprecations, 'level');
    const levelCounts = Object.keys(levelGroups).reduce(
      (counts, level) => {
        counts[level] = levelGroups[level].length;
        return counts;
      },
      {} as { [level: string]: number }
    );

    return (
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem>
          <EuiText color="subdued">Level</EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFilterGroup>
            {allFilterOptions.map(option => (
              <EuiFilterButton
                key={option}
                onClick={this.filterClicked.bind(this, option)}
                hasActiveFilters={currentFilter.has(option)}
                numFilters={levelCounts[option] || undefined}
              >
                {option}
              </EuiFilterButton>
            ))}
          </EuiFilterGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  private filterClicked(level: LevelFilterOption) {
    this.props.onFilterChange(level);
  }
}
