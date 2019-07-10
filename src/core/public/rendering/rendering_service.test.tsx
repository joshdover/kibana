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

import React from 'react';

import { chromeServiceMock } from '../chrome/chrome_service.mock';
import { RenderingService } from './rendering_service';

describe('RenderingService#start', () => {
  const getService = () => {
    const rendering = new RenderingService();
    const chrome = chromeServiceMock.createInternalStartContract();
    chrome.getComponent.mockReturnValue(<div>Hello chrome!</div>);
    const targetDomElement = document.createElement('div');
    const start = rendering.start({ chrome, targetDomElement });
    return { start, targetDomElement };
  };

  it('renders into provided DOM element', () => {
    const { targetDomElement } = getService();
    expect(targetDomElement).toMatchInlineSnapshot(`
<div>
  <div
    class="content"
    data-test-subj="kibanaChrome"
  >
    <div>
      Hello chrome!
    </div>
    <div />
  </div>
</div>
`);
  });

  it('returns a div for the legacy service to render into', () => {
    const {
      start: { legacyTargetDomElement },
      targetDomElement,
    } = getService();
    legacyTargetDomElement.innerHTML = '<span id="legacy">Hello legacy!</span>';
    expect(targetDomElement.querySelector('#legacy')).toMatchInlineSnapshot(`
<span
  id="legacy"
>
  Hello legacy!
</span>
`);
  });
});
