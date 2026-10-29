/*
 * Copyright 2026 Google LLC
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

import {basicCatalog} from '../catalogs/basic/v1/index.js';
import {basicCatalog as v09BasicCatalog} from '../v0_9/basic_catalog/catalog.js';
import {resolveDefinition, resolveJsonPointer} from './catalog_references.js';

describe('catalog references', () => {
  it('resolves escaped JSON Pointer segments', () => {
    const document = {$defs: {'a/b': {'~key': {type: 'string'}}}};
    assert.deepStrictEqual(resolveJsonPointer(document, '#/$defs/a~1b/~0key'), {type: 'string'});
    assert.strictEqual(resolveJsonPointer(document, '#/$defs/missing'), undefined);
  });

  it('resolves every basic catalog entry, bundling the definitions it references', () => {
    for (const catalog of [v09BasicCatalog, basicCatalog]) {
      const document = catalog.toJson() as Record<string, unknown>;
      const localDefs = document['$defs'] as Record<string, unknown>;
      for (const section of ['components', 'functions']) {
        const entries = document[section] as Record<string, Record<string, unknown>>;
        for (const [name, definition] of Object.entries(entries)) {
          const label = `${catalog.protocolVersion} ${section}/${name}`;
          const resolved = resolveDefinition(definition, document);
          assert.deepStrictEqual(resolved.schema, definition, label);
          for (const [defName, def] of Object.entries(resolved.defs)) {
            assert.deepStrictEqual(def, localDefs[defName], `${label} $defs/${defName}`);
          }
        }
      }
    }
  });

  it('names a bundled root component without reusing a root definition name', () => {
    const root = {
      catalogId: 'local',
      $defs: {component_Base: {type: 'string'}},
      components: {
        Base: {
          properties: {component: {const: 'Base'}, label: {type: 'string'}},
          required: ['component', 'label'],
        },
      },
    };

    const resolved = resolveDefinition({$ref: '#/components/Base'}, root);
    assert.deepStrictEqual(resolved.schema, {$ref: '#/$defs/component_Base_2'});
    assert.deepStrictEqual(resolved.defs, {
      component_Base_2: {properties: {label: {type: 'string'}}, required: ['label']},
    });
  });
});
