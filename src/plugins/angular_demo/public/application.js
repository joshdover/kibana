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

import angular from 'angular';
import 'angular-route/angular-route';

const chapterTemplate = `
controller: {{name}}<br />
Book Id: {{params.bookId}}<br />
Chapter Id: {{params.chapterId}}
`;

const bookTemplate = `
controller: {{name}}<br />
Book Id: {{params.bookId}}<br />
`;

const mainTemplate = (basePath) => `
<div ng-controller="MainController">
  <!-- This base tag is key to making this work -->
  <base href="${basePath}" />
  Choose:
  <a href="#Book/Moby">Moby</a> |
  <a href="#Book/Moby/ch/1">Moby: Ch1</a> |
  <a href="#Book/Gatsby">Gatsby</a> |
  <a href="#Book/Gatsby/ch/4?key=value">Gatsby: Ch4</a> |
  <a href="#Book/Scarlet">Scarlet Letter</a><br/>

  <div ng-view></div>

  <hr />

  <pre>$location.path() = {{$location.path()}}</pre>
  <pre>$route.current.templateUrl = {{$route.current.templateUrl}}</pre>
  <pre>$route.current.params = {{$route.current.params}}</pre>
  <pre>$route.current.scope.name = {{$route.current.scope.name}}</pre>
  <pre>$routeParams = {{$routeParams}}</pre>
</div>
`;

export const renderApp = (context, { element, appBasePath }) => {
  angular.module('ngRouteExample', ['ngRoute'])
    .controller('MainController', function ($scope, $route, $routeParams, $location) {
      $scope.$route = $route;
      $scope.$location = $location;
      $scope.$routeParams = $routeParams;
    })
    .controller('BookController', function ($scope, $routeParams) {
      $scope.name = 'BookController';
      $scope.params = $routeParams;
    })
    .controller('ChapterController', function ($scope, $routeParams) {
      $scope.name = 'ChapterController';
      $scope.params = $routeParams;
    })
    .config(function ($routeProvider, $locationProvider) {
      $routeProvider
        .when('/Book/:bookId', {
          template: bookTemplate,
          controller: 'BookController'
        })
        .when('/Book/:bookId/ch/:chapterId', {
          template: chapterTemplate,
          controller: 'ChapterController'
        });

      $locationProvider.html5Mode(false);
      $locationProvider.hashPrefix('');
    });

  // eslint-disable-next-line
  element.innerHTML = mainTemplate(appBasePath);
  const $injector = angular.bootstrap(element, ['ngRouteExample']);
  return () => $injector.get('$rootScope').$destroy();
};
