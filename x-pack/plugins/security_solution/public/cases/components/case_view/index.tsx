/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import { isEmpty } from 'lodash/fp';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingContent,
  EuiLoadingSpinner,
  EuiHorizontalRule,
} from '@elastic/eui';

import { CaseStatuses, CaseAttributes, CaseType } from '../../../../../cases/common/api';
import { Case, CaseConnector } from '../../containers/types';
import { getCaseDetailsUrl, getCaseUrl, useFormatUrl } from '../../../common/components/link_to';
import { gutterTimeline } from '../../../common/lib/helpers';
import { HeaderPage } from '../../../common/components/header_page';
import { EditableTitle } from '../../../common/components/header_page/editable_title';
import { TagList } from '../tag_list';
import { useGetCase } from '../../containers/use_get_case';
import { UserActionTree } from '../user_action_tree';
import { UserList } from '../user_list';
import { useUpdateCase } from '../../containers/use_update_case';
import { getTypedPayload } from '../../containers/utils';
import { WhitePageWrapper, HeaderWrapper } from '../wrappers';
import { CaseActionBar } from '../case_action_bar';
import { SpyRoute } from '../../../common/utils/route/spy_routes';
import { useGetCaseUserActions } from '../../containers/use_get_case_user_actions';
import { usePushToService } from '../use_push_to_service';
import { EditConnector } from '../edit_connector';
import { useConnectors } from '../../containers/configure/use_connectors';
import { SecurityPageName } from '../../../app/types';
import {
  getConnectorById,
  normalizeActionConnector,
  getNoneConnector,
} from '../configure_cases/utils';
import { DetailsPanel } from '../../../timelines/components/side_panel';
import { useSourcererScope } from '../../../common/containers/sourcerer';
import { SourcererScopeName } from '../../../common/store/sourcerer/model';
import { TimelineId } from '../../../../common/types/timeline';
import { timelineActions } from '../../../timelines/store/timeline';
import { StatusActionButton } from '../status/button';

import * as i18n from './translations';

interface Props {
  caseId: string;
  subCaseId?: string;
  userCanCrud: boolean;
}

export interface OnUpdateFields {
  key: keyof Case;
  value: Case[keyof Case];
  onSuccess?: () => void;
  onError?: () => void;
}

const MyWrapper = styled.div`
  padding: ${({ theme }) =>
    `${theme.eui.paddingSizes.l} ${theme.eui.paddingSizes.l} ${gutterTimeline} ${theme.eui.paddingSizes.l}`};
`;

const MyEuiFlexGroup = styled(EuiFlexGroup)`
  height: 100%;
`;

const MyEuiHorizontalRule = styled(EuiHorizontalRule)`
  margin-left: 48px;
  &.euiHorizontalRule--full {
    width: calc(100% - 48px);
  }
`;

export interface CaseProps extends Props {
  fetchCase: () => void;
  caseData: Case;
  updateCase: (newCase: Case) => void;
}

export const CaseComponent = React.memo<CaseProps>(
  ({ caseId, caseData, fetchCase, subCaseId, updateCase, userCanCrud }) => {
    const dispatch = useDispatch();
    const { formatUrl, search } = useFormatUrl(SecurityPageName.case);
    const allCasesLink = getCaseUrl(search);
    const caseDetailsLink = formatUrl(getCaseDetailsUrl({ id: caseId }), { absolute: true });
    const [initLoadingData, setInitLoadingData] = useState(true);
    const init = useRef(true);

    const {
      caseUserActions,
      fetchCaseUserActions,
      caseServices,
      hasDataToPush,
      isLoading: isLoadingUserActions,
      participants,
    } = useGetCaseUserActions(caseId, caseData.connector.id, subCaseId);

    const { isLoading, updateKey, updateCaseProperty } = useUpdateCase({
      caseId,
      subCaseId,
    });

    /**
     * For the future developer: useSourcererScope is security solution dependent.
     * You can use useSignalIndex as an alternative.
     */
    const { browserFields, docValueFields } = useSourcererScope(SourcererScopeName.detections);

    // Update Fields
    const onUpdateField = useCallback(
      ({ key, value, onSuccess, onError }: OnUpdateFields) => {
        const handleUpdateNewCase = (newCase: Case) =>
          updateCase({ ...newCase, comments: caseData.comments });
        switch (key) {
          case 'title':
            const titleUpdate = getTypedPayload<string>(value);
            if (titleUpdate.length > 0) {
              updateCaseProperty({
                fetchCaseUserActions,
                updateKey: 'title',
                updateValue: titleUpdate,
                updateCase: handleUpdateNewCase,
                caseData,
                onSuccess,
                onError,
              });
            }
            break;
          case 'connector':
            const connector = getTypedPayload<CaseConnector>(value);
            if (connector != null) {
              updateCaseProperty({
                fetchCaseUserActions,
                updateKey: 'connector',
                updateValue: connector,
                updateCase: handleUpdateNewCase,
                caseData,
                onSuccess,
                onError,
              });
            }
            break;
          case 'description':
            const descriptionUpdate = getTypedPayload<string>(value);
            if (descriptionUpdate.length > 0) {
              updateCaseProperty({
                fetchCaseUserActions,
                updateKey: 'description',
                updateValue: descriptionUpdate,
                updateCase: handleUpdateNewCase,
                caseData,
                onSuccess,
                onError,
              });
            }
            break;
          case 'tags':
            const tagsUpdate = getTypedPayload<string[]>(value);
            updateCaseProperty({
              fetchCaseUserActions,
              updateKey: 'tags',
              updateValue: tagsUpdate,
              updateCase: handleUpdateNewCase,
              caseData,
              onSuccess,
              onError,
            });
            break;
          case 'status':
            const statusUpdate = getTypedPayload<CaseStatuses>(value);
            if (caseData.status !== value) {
              updateCaseProperty({
                fetchCaseUserActions,
                updateKey: 'status',
                updateValue: statusUpdate,
                updateCase: handleUpdateNewCase,
                caseData,
                onSuccess,
                onError,
              });
            }
            break;
          case 'settings':
            const settingsUpdate = getTypedPayload<CaseAttributes['settings']>(value);
            if (caseData.settings !== value) {
              updateCaseProperty({
                fetchCaseUserActions,
                updateKey: 'settings',
                updateValue: settingsUpdate,
                updateCase: handleUpdateNewCase,
                caseData,
                onSuccess,
                onError,
              });
            }
            break;
          default:
            return null;
        }
      },
      [fetchCaseUserActions, updateCaseProperty, updateCase, caseData]
    );

    const handleUpdateCase = useCallback(
      (newCase: Case) => {
        updateCase(newCase);
        fetchCaseUserActions(caseId, newCase.connector.id, subCaseId);
      },
      [updateCase, fetchCaseUserActions, caseId, subCaseId]
    );

    const { loading: isLoadingConnectors, connectors } = useConnectors();

    const [connectorName, isValidConnector] = useMemo(() => {
      const connector = connectors.find((c) => c.id === caseData.connector.id);
      return [connector?.name ?? '', !!connector];
    }, [connectors, caseData.connector]);

    const currentExternalIncident = useMemo(
      () =>
        caseServices != null && caseServices[caseData.connector.id] != null
          ? caseServices[caseData.connector.id]
          : null,
      [caseServices, caseData.connector]
    );

    const { pushButton, pushCallouts } = usePushToService({
      connector: {
        ...caseData.connector,
        name: isEmpty(connectorName) ? caseData.connector.name : connectorName,
      },
      caseServices,
      caseId: caseData.id,
      caseStatus: caseData.status,
      connectors,
      updateCase: handleUpdateCase,
      userCanCrud,
      isValidConnector: isLoadingConnectors ? true : isValidConnector,
    });

    const onSubmitConnector = useCallback(
      (connectorId, connectorFields, onError, onSuccess) => {
        const connector = getConnectorById(connectorId, connectors);
        const connectorToUpdate = connector
          ? normalizeActionConnector(connector)
          : getNoneConnector();

        onUpdateField({
          key: 'connector',
          value: { ...connectorToUpdate, fields: connectorFields },
          onSuccess,
          onError,
        });
      },
      [onUpdateField, connectors]
    );

    const onSubmitTags = useCallback((newTags) => onUpdateField({ key: 'tags', value: newTags }), [
      onUpdateField,
    ]);

    const onSubmitTitle = useCallback(
      (newTitle) => onUpdateField({ key: 'title', value: newTitle }),
      [onUpdateField]
    );

    const changeStatus = useCallback(
      (status: CaseStatuses) =>
        onUpdateField({
          key: 'status',
          value: status,
        }),
      [onUpdateField]
    );

    const handleRefresh = useCallback(() => {
      fetchCaseUserActions(caseId, caseData.connector.id, subCaseId);
      fetchCase();
    }, [caseData.connector.id, caseId, fetchCase, fetchCaseUserActions, subCaseId]);

    const spyState = useMemo(() => ({ caseTitle: caseData.title }), [caseData.title]);

    const emailContent = useMemo(
      () => ({
        subject: i18n.EMAIL_SUBJECT(caseData.title),
        body: i18n.EMAIL_BODY(caseDetailsLink),
      }),
      [caseDetailsLink, caseData.title]
    );

    useEffect(() => {
      if (initLoadingData && !isLoadingUserActions) {
        setInitLoadingData(false);
      }
    }, [initLoadingData, isLoadingUserActions]);

    const backOptions = useMemo(
      () => ({
        href: allCasesLink,
        text: i18n.BACK_TO_ALL,
        dataTestSubj: 'backToCases',
        pageId: SecurityPageName.case,
      }),
      [allCasesLink]
    );

    const showAlert = useCallback(
      (alertId: string, index: string) => {
        dispatch(
          timelineActions.toggleDetailPanel({
            panelView: 'eventDetail',
            timelineId: TimelineId.casePage,
            params: {
              eventId: alertId,
              indexName: index,
            },
          })
        );
      },
      [dispatch]
    );

    // useEffect used for component's initialization
    useEffect(() => {
      if (init.current) {
        init.current = false;
        // We need to create a timeline to show the details view
        dispatch(
          timelineActions.createTimeline({
            id: TimelineId.casePage,
            columns: [],
            indexNames: [],
            expandedDetail: {},
            show: false,
          })
        );
      }
    }, [dispatch]);

    return (
      <>
        <HeaderWrapper>
          <HeaderPage
            backOptions={backOptions}
            data-test-subj="case-view-title"
            hideSourcerer={true}
            titleNode={
              <EditableTitle
                disabled={!userCanCrud}
                isLoading={isLoading && updateKey === 'title'}
                title={caseData.title}
                onSubmit={onSubmitTitle}
              />
            }
            title={caseData.title}
          >
            <CaseActionBar
              currentExternalIncident={currentExternalIncident}
              caseData={caseData}
              disabled={!userCanCrud}
              isLoading={isLoading && (updateKey === 'status' || updateKey === 'settings')}
              onRefresh={handleRefresh}
              onUpdateField={onUpdateField}
            />
          </HeaderPage>
        </HeaderWrapper>
        <WhitePageWrapper>
          <MyWrapper>
            {!initLoadingData && pushCallouts != null && pushCallouts}
            <EuiFlexGroup>
              <EuiFlexItem grow={6}>
                {initLoadingData && (
                  <EuiLoadingContent lines={8} data-test-subj="case-view-loading-content" />
                )}
                {!initLoadingData && (
                  <>
                    <UserActionTree
                      caseServices={caseServices}
                      caseUserActions={caseUserActions}
                      connectors={connectors}
                      data={caseData}
                      fetchUserActions={fetchCaseUserActions.bind(
                        null,
                        caseId,
                        caseData.connector.id,
                        subCaseId
                      )}
                      isLoadingDescription={isLoading && updateKey === 'description'}
                      isLoadingUserActions={isLoadingUserActions}
                      onShowAlertDetails={showAlert}
                      onUpdateField={onUpdateField}
                      updateCase={updateCase}
                      userCanCrud={userCanCrud}
                    />
                    {(caseData.type !== CaseType.collection || hasDataToPush) && (
                      <>
                        <MyEuiHorizontalRule
                          margin="s"
                          data-test-subj="case-view-bottom-actions-horizontal-rule"
                        />
                        <EuiFlexGroup alignItems="center" gutterSize="s" justifyContent="flexEnd">
                          {caseData.type !== CaseType.collection && (
                            <EuiFlexItem grow={false}>
                              <StatusActionButton
                                status={caseData.status}
                                onStatusChanged={changeStatus}
                                disabled={!userCanCrud}
                                isLoading={isLoading && updateKey === 'status'}
                              />
                            </EuiFlexItem>
                          )}
                          {hasDataToPush && (
                            <EuiFlexItem data-test-subj="has-data-to-push-button" grow={false}>
                              {pushButton}
                            </EuiFlexItem>
                          )}
                        </EuiFlexGroup>
                      </>
                    )}
                  </>
                )}
              </EuiFlexItem>
              <EuiFlexItem grow={2}>
                <UserList
                  data-test-subj="case-view-user-list-reporter"
                  email={emailContent}
                  headline={i18n.REPORTER}
                  users={[caseData.createdBy]}
                />
                <UserList
                  data-test-subj="case-view-user-list-participants"
                  email={emailContent}
                  headline={i18n.PARTICIPANTS}
                  loading={isLoadingUserActions}
                  users={participants}
                />
                <TagList
                  data-test-subj="case-view-tag-list"
                  disabled={!userCanCrud}
                  tags={caseData.tags}
                  onSubmit={onSubmitTags}
                  isLoading={isLoading && updateKey === 'tags'}
                />
                <EditConnector
                  caseFields={caseData.connector.fields}
                  connectors={connectors}
                  disabled={!userCanCrud}
                  hideConnectorServiceNowSir={
                    subCaseId != null || caseData.type === CaseType.collection
                  }
                  isLoading={isLoadingConnectors || (isLoading && updateKey === 'connector')}
                  onSubmit={onSubmitConnector}
                  selectedConnector={caseData.connector.id}
                  userActions={caseUserActions}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </MyWrapper>
        </WhitePageWrapper>
        <DetailsPanel
          browserFields={browserFields}
          docValueFields={docValueFields}
          isFlyoutView
          timelineId={TimelineId.casePage}
        />
        <SpyRoute state={spyState} pageName={SecurityPageName.case} />
      </>
    );
  }
);

export const CaseView = React.memo(({ caseId, subCaseId, userCanCrud }: Props) => {
  const { data, isLoading, isError, fetchCase, updateCase } = useGetCase(caseId, subCaseId);
  if (isError) {
    return null;
  }

  if (isLoading) {
    return (
      <MyEuiFlexGroup gutterSize="none" justifyContent="center" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner data-test-subj="case-view-loading" size="xl" />
        </EuiFlexItem>
      </MyEuiFlexGroup>
    );
  }

  return (
    data && (
      <CaseComponent
        caseId={caseId}
        subCaseId={subCaseId}
        fetchCase={fetchCase}
        caseData={data}
        updateCase={updateCase}
        userCanCrud={userCanCrud}
      />
    )
  );
});

CaseComponent.displayName = 'CaseComponent';
CaseView.displayName = 'CaseView';
