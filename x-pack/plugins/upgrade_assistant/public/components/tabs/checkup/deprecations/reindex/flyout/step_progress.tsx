/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import classNames from 'classnames';
import React, { Fragment, ReactNode } from 'react';

import { EuiIcon, EuiLoadingSpinner } from '@elastic/eui';

type STATUS = 'incomplete' | 'inProgress' | 'complete' | 'failed';

const StepStatus: React.StatelessComponent<{ status: STATUS; idx: number }> = ({ status, idx }) => {
  if (status === 'incomplete') {
    return <span className="stepProgress__status">{idx + 1}.</span>;
  } else if (status === 'inProgress') {
    return <EuiLoadingSpinner size="m" className="stepProgress__status" />;
  } else if (status === 'complete') {
    return (
      <span className="stepProgress__status stepStatus__circle stepStatus__circle--complete">
        <EuiIcon type="check" size="s" />
      </span>
    );
  } else if (status === 'failed') {
    return (
      <span className="stepProgress__status stepStatus__circle stepStatus__circle--failed">
        <EuiIcon type="cross" size="s" />
      </span>
    );
  }

  throw new Error(`Unsupported status: ${status}`);
};

const Step: React.StatelessComponent<StepProgressStep & { idx: number }> = ({
  title,
  status,
  children,
  idx,
}) => {
  const titleClassName = classNames('stepProgress__title', {
    'stepProgress__title--inProgress': status === 'inProgress',
  });

  return (
    <Fragment>
      <div className="stepProgress__step">
        <StepStatus status={status} idx={idx} />
        <p className={titleClassName}>{title}</p>
      </div>
      <div className="stepProgress__content">{children}</div>
    </Fragment>
  );
};

export interface StepProgressStep {
  title: string;
  status: STATUS;
  children?: ReactNode;
}

/**
 * A generic component that displays a series of automated steps and the system's progress.
 */
export const StepProgress: React.StatelessComponent<{
  steps: StepProgressStep[];
}> = ({ steps }) => {
  return (
    <div className="stepProgress__container">
      {steps.map((step, idx) => (
        <Step key={step.title} {...step} idx={idx} />
      ))}
    </div>
  );
};
