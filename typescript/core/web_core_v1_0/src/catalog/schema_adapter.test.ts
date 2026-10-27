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

import {getCatalogSchemaAdapter, registerCatalogSchemaAdapter} from './schema_adapter.js';

describe('catalog schema adapter registration', () => {
  it('keeps one deterministic adapter registration', () => {
    const adapter = getCatalogSchemaAdapter();
    assert.ok(adapter);
    registerCatalogSchemaAdapter(adapter);

    assert.strictEqual(getCatalogSchemaAdapter(), adapter);
    assert.throws(
      () => registerCatalogSchemaAdapter({name: 'another-schema-adapter'}),
      new RegExp(`already registered: ${adapter.name}`),
    );
  });
});
