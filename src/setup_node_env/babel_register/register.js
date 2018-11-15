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

var resolve = require('path').resolve;

// this must happen before `require('babel-register')` and can't be changed
// once the module has been loaded
if (!process.env.BABEL_CACHE_PATH) {
  process.env.BABEL_CACHE_PATH = resolve(__dirname, '../../../optimize/.babelcache.json');
}

function ignore(filepath) {
  if (filepath.match(/\/bower_components\//) || filepath.match(/\/kbn-pm\/dist\//)) {
    return true;
  }

  // TODO: remove this and just transpile plugins at build time, but
  // has tricky edge cases that will probably require better eslint
  // restrictions to make sure that code destined for the server/browser
  // follows respects the limitations of each environment.
  //
  // https://github.com/elastic/kibana/issues/14800#issuecomment-366130268

  // ignore paths matching `/node_modules/{a}/{b}`, unless `a`
  // is `x-pack` and `b` is not `node_modules`
  if (filepath.match(/\/node_modules\/x-pack\/(?!node_modules)/)) {
    return false;
  }

  // Do not ignore subpackages that are not already built on their own
  if (filepath.match(/\/node_modules\/@kbn\/(test|dev-utils|datemath)/)) {
    return false;
  }

  // Ignore all other node module directories
  if (filepath.match(/node_modules/) !== null) {
    return true;
  }

  return false;
}

if (global.__BUILT_WITH_BABEL__) {
  // when building the Kibana source we replace the statement
  // `global.__BUILT_WITH_BABEL__` with the value `true` so that
  // when babel-register is required for the first time by users
  // it will exclude kibana's `src` directory.
  //
  // We still need babel-register for plugins though, we've been
  // building their server code at require-time since version 4.2
  // TODO: the plugin install process could transpile plugin server code...
  ignore.push(resolve(__dirname, '../../../src'));
}

// modifies all future calls to require() to automatically
// compile the required source with babel
require('babel-register')({
  ignore,
  babelrc: false,
  presets: [
    require.resolve('@kbn/babel-preset/node_preset')
  ],
});
