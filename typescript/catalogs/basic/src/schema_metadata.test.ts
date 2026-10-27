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

import {zod4CatalogSchemaAdapter} from '@a2ui/schema-zod-v4';
import {isCompleteComponentMetadata, type ComponentSchemaMetadata} from '@a2ui/web_core_v1_0';

import {basicCatalog} from './catalog.js';

/** The child references metadata declares, comparable regardless of order. */
function childRefs(metadata: ComponentSchemaMetadata) {
  return {
    childRefs: new Set(metadata.childRefs ?? []),
    childLists: new Set(metadata.childLists ?? []),
    nestedChildRefs: Object.fromEntries(
      Object.entries(metadata.nestedChildRefs ?? {}).map(([key, keys]) => [key, new Set(keys)]),
    ),
  };
}

describe('basic catalog schema metadata', () => {
  for (const api of basicCatalog.components.values()) {
    it(`${api.name} ships complete metadata that matches its Zod schema`, () => {
      assert.ok(isCompleteComponentMetadata(api.schemaMetadata));
      const derived = zod4CatalogSchemaAdapter.describeComponent!(api.schema);

      assert.deepStrictEqual(childRefs(api.schemaMetadata), childRefs(derived));
      assert.deepStrictEqual(
        new Set(api.schemaMetadata.propertyKeys),
        new Set(derived.propertyKeys),
      );
    });
  }

  it('resolves metadata without asking the schema adapter', () => {
    for (const name of basicCatalog.components.keys()) {
      assert.strictEqual(
        basicCatalog.getComponentMetadata(name),
        basicCatalog.components.get(name)!.schemaMetadata,
      );
    }
  });
});
