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
import { BehaviorSubject } from 'rxjs';
import {
  ChromeBadge,
  ChromeBrand,
  ChromeBreadcrumb,
  ChromeService,
  InternalChromeStart,
  ChromeStart,
} from './chrome_service';

const createStartContractMock = () => {
  const startContract: DeeplyMockedKeys<ChromeStart> = {
    navLinks: {
      getNavLinks$: jest.fn(),
      has: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
      showOnly: jest.fn(),
      update: jest.fn(),
      enableForcedAppSwitcherNavigation: jest.fn(),
      getForceAppSwitcherNavigation$: jest.fn(),
    },
    recentlyAccessed: {
      add: jest.fn(),
      get: jest.fn(),
      get$: jest.fn(),
    },
    navControls: {
      registerLeft: jest.fn(),
      registerRight: jest.fn(),
      getLeft$: jest.fn(),
      getRight$: jest.fn(),
    },
    setAppTitle: jest.fn(),
    setBrand: jest.fn(),
    getBrand$: jest.fn(),
    setIsVisible: jest.fn(),
    getIsVisible$: jest.fn(),
    setIsCollapsed: jest.fn(),
    getIsCollapsed$: jest.fn(),
    addApplicationClass: jest.fn(),
    removeApplicationClass: jest.fn(),
    getApplicationClasses$: jest.fn(),
    getBadge$: jest.fn(),
    setBadge: jest.fn(),
    getBreadcrumbs$: jest.fn(),
    setBreadcrumbs: jest.fn(),
    getHelpExtension$: jest.fn(),
    setHelpExtension: jest.fn(),
  };
  startContract.getBrand$.mockReturnValue(new BehaviorSubject({} as ChromeBrand));
  startContract.getIsVisible$.mockReturnValue(new BehaviorSubject(false));
  startContract.getIsCollapsed$.mockReturnValue(new BehaviorSubject(false));
  startContract.getApplicationClasses$.mockReturnValue(new BehaviorSubject(['class-name']));
  startContract.getBadge$.mockReturnValue(new BehaviorSubject({} as ChromeBadge));
  startContract.getBreadcrumbs$.mockReturnValue(new BehaviorSubject([{} as ChromeBreadcrumb]));
  startContract.getHelpExtension$.mockReturnValue(new BehaviorSubject(undefined));
  return startContract;
};

const createInternalStartContractMock = (): DeeplyMockedKeys<InternalChromeStart> => {
  const startContract = createStartContractMock();
  const internalStartContract: DeeplyMockedKeys<InternalChromeStart> = {
    getComponent: jest.fn(),
    forPlugin: jest.fn(),
  };
  internalStartContract.forPlugin.mockReturnValue(startContract);
  return internalStartContract;
};

type ChromeServiceContract = PublicMethodsOf<ChromeService>;
const createMock = () => {
  const mocked: jest.Mocked<ChromeServiceContract> = {
    setup: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  };
  mocked.start.mockResolvedValue(createInternalStartContractMock());
  return mocked;
};

export const chromeServiceMock = {
  create: createMock,
  createInternalStartContract: createInternalStartContractMock,
  createStartContract: createStartContractMock,
};
