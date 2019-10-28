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

import LogFormat from './log_format';
import stringify from 'json-stringify-safe';

const stripColors = function (string) {
  return string.replace(/\u001b[^m]+m/g, '');
};

export default class KbnLoggerJsonFormat extends LogFormat {
  format(data) {
    data.message = stripColors(data.message);
    data['@timestamp'] = this.extractAndFormatTimestamp(data);
    data.tags = data.tags.map(tag => tag.__kibanaContext__ ? tag.value : tag);
    return stringify(data);
  }
}
