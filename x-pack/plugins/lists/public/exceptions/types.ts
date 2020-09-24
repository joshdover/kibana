/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import {
  CreateExceptionListItemSchema,
  CreateExceptionListSchema,
  ExceptionListItemSchema,
  ExceptionListSchema,
  ExceptionListType,
  NamespaceType,
  Page,
  PerPage,
  TotalOrUndefined,
  UpdateExceptionListItemSchema,
  UpdateExceptionListSchema,
} from '../../common/schemas';
import { HttpClient } from '../../../../../src/core/public';

export interface FilterExceptionsOptions {
  filter: string;
  tags: string[];
}

export interface Pagination {
  page: Page;
  perPage: PerPage;
  total: TotalOrUndefined;
}

export type AddExceptionList = UpdateExceptionListSchema | CreateExceptionListSchema;

export type AddExceptionListItem = CreateExceptionListItemSchema | UpdateExceptionListItemSchema;

export interface PersistHookProps {
  http: HttpClient;
  onError: (arg: Error) => void;
}

export interface ExceptionList extends ExceptionListSchema {
  totalItems: number;
}

export interface UseExceptionListSuccess {
  exceptions: ExceptionListItemSchema[];
  pagination: Pagination;
}

export interface UseExceptionListProps {
  http: HttpClient;
  lists: ExceptionIdentifiers[];
  onError?: (arg: string[]) => void;
  filterOptions: FilterExceptionsOptions[];
  pagination?: Pagination;
  showDetectionsListsOnly: boolean;
  showEndpointListsOnly: boolean;
  matchFilters: boolean;
  onSuccess?: (arg: UseExceptionListSuccess) => void;
}

export interface ExceptionIdentifiers {
  id: string;
  listId: string;
  namespaceType: NamespaceType;
  type: ExceptionListType;
}

export interface ApiCallByListIdProps {
  http: HttpClient;
  listIds: string[];
  namespaceTypes: NamespaceType[];
  filterOptions: FilterExceptionsOptions[];
  pagination: Partial<Pagination>;
  signal: AbortSignal;
}

export interface ApiCallByIdProps {
  http: HttpClient;
  id: string;
  namespaceType: NamespaceType;
  signal: AbortSignal;
}

export interface ApiCallMemoProps {
  id: string;
  namespaceType: NamespaceType;
  onError: (arg: string[]) => void;
  onSuccess: () => void;
}

export interface ApiCallFindListsItemsMemoProps {
  lists: ExceptionIdentifiers[];
  filterOptions: FilterExceptionsOptions[];
  pagination: Partial<Pagination>;
  showDetectionsListsOnly: boolean;
  showEndpointListsOnly: boolean;
  onError: (arg: string[]) => void;
  onSuccess: (arg: UseExceptionListSuccess) => void;
}

export interface AddExceptionListProps {
  http: HttpClient;
  list: CreateExceptionListSchema;
  signal: AbortSignal;
}

export interface AddExceptionListItemProps {
  http: HttpClient;
  listItem: CreateExceptionListItemSchema;
  signal: AbortSignal;
}

export interface UpdateExceptionListProps {
  http: HttpClient;
  list: UpdateExceptionListSchema;
  signal: AbortSignal;
}

export interface UpdateExceptionListItemProps {
  http: HttpClient;
  listItem: UpdateExceptionListItemSchema;
  signal: AbortSignal;
}

export interface AddEndpointExceptionListProps {
  http: HttpClient;
  signal: AbortSignal;
}
