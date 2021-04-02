/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export default function ({ loadTestFile }) {
  describe('Setup', function () {
    // Setup mode is not supported in cloud
    this.tags(['skipCloud']);

    loadTestFile(require.resolve('./collection'));
  });
}
