/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'node:assert';
import {describe, it} from 'node:test';

import {nestedCallRunsInCatalog} from './payload-validator.js';

describe('nestedCallRunsInCatalog', () => {
  const CATALOG = 'https://example.com/a';
  const OTHER = 'https://example.com/b';

  it('runs a catalogless call in the catalog only when it is the surface default', () => {
    assert.strictEqual(nestedCallRunsInCatalog(undefined, CATALOG, {catalogIsDefault: true}), true);
    assert.strictEqual(
      nestedCallRunsInCatalog(undefined, CATALOG, {catalogIsDefault: false}),
      false,
    );
  });

  it('runs a call naming a catalog only in that catalog', () => {
    for (const catalogIsDefault of [true, false]) {
      assert.strictEqual(nestedCallRunsInCatalog(CATALOG, CATALOG, {catalogIsDefault}), true);
      assert.strictEqual(nestedCallRunsInCatalog(OTHER, CATALOG, {catalogIsDefault}), false);
      assert.strictEqual(nestedCallRunsInCatalog('', CATALOG, {catalogIsDefault}), false);
    }
  });
});
