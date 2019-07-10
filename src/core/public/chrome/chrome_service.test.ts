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

import * as Rx from 'rxjs';
import { toArray } from 'rxjs/operators';
import { shallow } from 'enzyme';
import React from 'react';

import { applicationServiceMock } from '../application/application_service.mock';
import { httpServiceMock } from '../http/http_service.mock';
import { injectedMetadataServiceMock } from '../injected_metadata/injected_metadata_service.mock';
import { notificationServiceMock } from '../notifications/notifications_service.mock';
import { ChromeService } from './chrome_service';
import { docLinksServiceMock } from '../doc_links/doc_links_service.mock';

const store = new Map();
(window as any).localStorage = {
  setItem: (key: string, value: string) => store.set(String(key), String(value)),
  getItem: (key: string) => store.get(String(key)),
  removeItem: (key: string) => store.delete(String(key)),
};

function defaultStartDeps() {
  return {
    application: applicationServiceMock.createInternalStartContract(),
    docLinks: docLinksServiceMock.createStartContract(),
    http: httpServiceMock.createStartContract(),
    injectedMetadata: injectedMetadataServiceMock.createStartContract(),
    notifications: notificationServiceMock.createStartContract(),
  };
}

beforeEach(() => {
  store.clear();
});

describe('start', () => {
  it('adds legacy browser warning if browserSupportsCsp is disabled and warnLegacyBrowsers is enabled', async () => {
    const service = new ChromeService({ browserSupportsCsp: false });
    const startDeps = defaultStartDeps();
    startDeps.injectedMetadata.getCspConfig.mockReturnValue({ warnLegacyBrowsers: true });
    await service.start(startDeps);
    expect(startDeps.notifications.toasts.addWarning.mock.calls).toMatchInlineSnapshot(`
Array [
  Array [
    "Your browser does not meet the security requirements for Kibana.",
  ],
]
`);
  });

  it('does not add legacy browser warning if browser supports CSP', async () => {
    const service = new ChromeService({ browserSupportsCsp: true });
    const startDeps = defaultStartDeps();
    startDeps.injectedMetadata.getCspConfig.mockReturnValue({ warnLegacyBrowsers: true });
    await service.start(startDeps);
    expect(startDeps.notifications.toasts.addWarning).not.toBeCalled();
  });

  it('does not add legacy browser warning if warnLegacyBrowsers is disabled', async () => {
    const service = new ChromeService({ browserSupportsCsp: false });
    const startDeps = defaultStartDeps();
    startDeps.injectedMetadata.getCspConfig.mockReturnValue({ warnLegacyBrowsers: false });
    await service.start(startDeps);
    expect(startDeps.notifications.toasts.addWarning).not.toBeCalled();
  });

  describe('getComponent', () => {
    it('returns a renderable React component', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = await service.start(defaultStartDeps());
      // Have to do some fanagling to get the type system and enzyme to accept this.
      // Don't capture the snapshot because it's 600+ lines long.
      expect(shallow(React.createElement(() => start.getComponent()))).toBeDefined();
    });
  });

  describe('brand', () => {
    it('updates/emits the brand as it changes', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getBrand$()
        .pipe(toArray())
        .toPromise();

      start.setBrand({
        logo: 'big logo',
        smallLogo: 'not so big logo',
      });
      start.setBrand({
        logo: 'big logo without small logo',
      });
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  Object {},
  Object {
    "logo": "big logo",
    "smallLogo": "not so big logo",
  },
  Object {
    "logo": "big logo without small logo",
    "smallLogo": undefined,
  },
]
`);
    });
  });

  describe('visibility', () => {
    it('updates/emits the visibility', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getIsVisible$()
        .pipe(toArray())
        .toPromise();

      start.setIsVisible(true);
      start.setIsVisible(false);
      start.setIsVisible(true);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  true,
  true,
  false,
  true,
]
`);
    });

    it('always emits false if embed query string is in hash when set up', async () => {
      window.history.pushState(undefined, '', '#/home?a=b&embed=true');

      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getIsVisible$()
        .pipe(toArray())
        .toPromise();

      start.setIsVisible(true);
      start.setIsVisible(false);
      start.setIsVisible(true);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  false,
  false,
  false,
  false,
]
`);
    });
  });

  describe('is collapsed', () => {
    it('updates/emits isCollapsed', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getIsCollapsed$()
        .pipe(toArray())
        .toPromise();

      start.setIsCollapsed(true);
      start.setIsCollapsed(false);
      start.setIsCollapsed(true);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  false,
  true,
  false,
  true,
]
`);
    });

    it('only stores true in localStorage', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();

      start.setIsCollapsed(true);
      expect(store.size).toBe(1);

      start.setIsCollapsed(false);
      expect(store.size).toBe(0);
    });
  });

  describe('application classes', () => {
    it('updates/emits the application classes', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getApplicationClasses$()
        .pipe(toArray())
        .toPromise();

      start.addApplicationClass('foo');
      start.addApplicationClass('foo');
      start.addApplicationClass('bar');
      start.addApplicationClass('bar');
      start.addApplicationClass('baz');
      start.removeApplicationClass('bar');
      start.removeApplicationClass('foo');
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  Array [],
  Array [
    "foo",
  ],
  Array [
    "foo",
  ],
  Array [
    "foo",
    "bar",
  ],
  Array [
    "foo",
    "bar",
  ],
  Array [
    "foo",
    "bar",
    "baz",
  ],
  Array [
    "foo",
    "baz",
  ],
  Array [
    "baz",
  ],
]
`);
    });
  });

  describe('badge', () => {
    it('updates/emits the current badge', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getBadge$()
        .pipe(toArray())
        .toPromise();

      start.setBadge({ text: 'foo', tooltip: `foo's tooltip` });
      start.setBadge({ text: 'bar', tooltip: `bar's tooltip` });
      start.setBadge(undefined);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  undefined,
  Object {
    "text": "foo",
    "tooltip": "foo's tooltip",
  },
  Object {
    "text": "bar",
    "tooltip": "bar's tooltip",
  },
  undefined,
]
`);
    });
  });

  describe('breadcrumbs', () => {
    it('updates/emits the current set of breadcrumbs', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getBreadcrumbs$()
        .pipe(toArray())
        .toPromise();

      start.setBreadcrumbs([{ text: 'foo' }, { text: 'bar' }]);
      start.setBreadcrumbs([{ text: 'foo' }]);
      start.setBreadcrumbs([{ text: 'bar' }]);
      start.setBreadcrumbs([]);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  Array [],
  Array [
    Object {
      "text": "foo",
    },
    Object {
      "text": "bar",
    },
  ],
  Array [
    Object {
      "text": "foo",
    },
  ],
  Array [
    Object {
      "text": "bar",
    },
  ],
  Array [],
]
`);
    });
  });

  describe('help extension', () => {
    it('updates/emits the current help extension', async () => {
      const service = new ChromeService({ browserSupportsCsp: true });
      const start = (await service.start(defaultStartDeps())).forPlugin();
      const promise = start
        .getHelpExtension$()
        .pipe(toArray())
        .toPromise();

      start.setHelpExtension(() => () => undefined);
      start.setHelpExtension(undefined);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
Array [
  undefined,
  [Function],
  undefined,
]
`);
    });
  });
});

describe('stop', () => {
  it('completes applicationClass$, isCollapsed$, breadcrumbs$, isVisible$, and brand$ observables', async () => {
    const service = new ChromeService({ browserSupportsCsp: true });
    const start = (await service.start(defaultStartDeps())).forPlugin();
    const promise = Rx.combineLatest(
      start.getBrand$(),
      start.getApplicationClasses$(),
      start.getIsCollapsed$(),
      start.getBreadcrumbs$(),
      start.getIsVisible$(),
      start.getHelpExtension$()
    ).toPromise();

    service.stop();
    await promise;
  });

  it('completes immediately if service already stopped', async () => {
    const service = new ChromeService({ browserSupportsCsp: true });
    const start = (await service.start(defaultStartDeps())).forPlugin();
    service.stop();

    await expect(
      Rx.combineLatest(
        start.getBrand$(),
        start.getApplicationClasses$(),
        start.getIsCollapsed$(),
        start.getBreadcrumbs$(),
        start.getIsVisible$(),
        start.getHelpExtension$()
      ).toPromise()
    ).resolves.toBe(undefined);
  });
});
