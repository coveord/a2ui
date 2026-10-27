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

import {A2uiCatalogError} from '../errors.js';
import {testSchemaAdapter} from '../test/test_schemas.js';
import {requireSchemaAdapter} from './schema_adapter.js';

describe('requireSchemaAdapter', () => {
  it("returns the catalog's adapter when it implements the operation", () => {
    const schemaAdapter = testSchemaAdapter({serializeCatalog: () => ({})});

    assert.strictEqual(
      requireSchemaAdapter({id: 'c', schemaAdapter}, 'serializeCatalog'),
      schemaAdapter,
    );
  });

  it('names the catalog and the operation when the catalog has no adapter', () => {
    assert.throws(
      () => requireSchemaAdapter({id: 'c'}, 'serializeCatalog'),
      (err: unknown) =>
        err instanceof A2uiCatalogError &&
        err.message.includes("Catalog 'c'") &&
        err.message.includes("'serializeCatalog'"),
    );
  });

  it('rejects an adapter that lacks the operation', () => {
    assert.throws(
      () => requireSchemaAdapter({id: 'c', schemaAdapter: testSchemaAdapter()}, 'serializeCatalog'),
      A2uiCatalogError,
    );
  });
});
