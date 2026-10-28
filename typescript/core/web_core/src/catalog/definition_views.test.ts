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

import {z} from 'zod/v3';

import {basicCatalog} from '../catalogs/basic/v1/index.js';
import {getKnownSchemaKeys} from '../resolution/data-context.js';
import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {extractRefFields} from '../resolution/ref-fields.js';
import {basicCatalog as v08BasicCatalog} from '../v0_8/basic_catalog/catalog.js';
import {basicCatalog as v09BasicCatalog} from '../v0_9/basic_catalog/catalog.js';
import {a2uiJsonSchemaOf, inspectionSchemaOf} from './a2ui_json_schema.js';
import {objectDefinitionView, type ResolvedObjectDefinition} from './catalog_definitions.js';
import {Catalog} from './types.js';

const COMMON_TYPES = new Set(['DataBinding', 'DynamicString', 'Checkable', 'CheckRule']);
const isCommonTypeName = (name: string) => COMMON_TYPES.has(name);

function model(overrides: Partial<ResolvedObjectDefinition>): ResolvedObjectDefinition {
  return {
    definition: {schema: {}, defs: {}, localDefinitionNames: new Set()},
    document: {$defs: {}},
    pieces: [],
    required: new Set(),
    omittedProperties: new Set(),
    open: false,
    ...overrides,
  };
}

describe('inspectionSchemaOf', () => {
  it('reads every loaded basic catalog entry through its definition, with the same views', () => {
    for (const code of [v08BasicCatalog, v09BasicCatalog, basicCatalog]) {
      const loaded = Catalog.fromJson(code.toJson(), code.protocolVersion, code.id);
      for (const entry of [...loaded.components.values(), ...loaded.functions.values()]) {
        const schema = entry.schema as z.ZodTypeAny;
        const label = `${code.protocolVersion} ${entry.name}`;
        assert.notStrictEqual(inspectionSchemaOf(schema), a2uiJsonSchemaOf(schema), label);
        // A copy of the compiled schema has no definition, so it is inspected
        // through its own JSON Schema view, as every schema was before.
        const copy = schema.describe(schema.description as string);
        assert.deepStrictEqual(scrapeSchemaBehavior(schema), scrapeSchemaBehavior(copy), label);
        assert.deepStrictEqual(extractRefFields(schema), extractRefFields(copy), label);
        assert.deepStrictEqual(getKnownSchemaKeys(schema), getKnownSchemaKeys(copy), label);
      }
    }
  });

  it('inspects a schema with no definition through its own JSON Schema view', () => {
    const schema = z.object({label: z.string()});
    assert.strictEqual(inspectionSchemaOf(schema), a2uiJsonSchemaOf(schema));
  });
});

describe('objectDefinitionView', () => {
  it('merges the pieces in order, without omitted properties', () => {
    const view = objectDefinitionView(
      model({
        pieces: [
          {kind: 'commonType', name: 'Checkable'},
          {kind: 'properties', properties: {size: {type: 'number'}, id: {type: 'string'}}},
          {kind: 'properties', properties: {size: {type: 'integer'}}},
        ],
        required: new Set(['size', 'id', 'missing']),
        omittedProperties: new Set(['id']),
      }),
      {Checkable: {properties: {checks: {type: 'array', items: {$ref: '#/$defs/CheckRule'}}}}},
      isCommonTypeName,
    );
    assert.deepStrictEqual(view, {
      type: 'object',
      properties: {
        checks: {type: 'array', items: {$ref: 'common_types.json#/$defs/CheckRule'}},
        size: {type: 'integer'},
      },
      required: ['size'],
      additionalProperties: false,
    });
  });

  it('reads references, unions and objects as the loader converts them', () => {
    const document = {
      $defs: {
        Node: {type: 'object', properties: {next: {$ref: '#/$defs/Node'}}},
        DynamicString: {type: 'string'},
      },
    };
    const view = objectDefinitionView(
      model({
        document,
        open: true,
        pieces: [
          {
            kind: 'properties',
            properties: {
              common: {$ref: '#/$defs/DynamicString', description: 'Kept.'},
              recursive: {$ref: '#/$defs/Node'},
              missing: {$ref: '#/$defs/Missing'},
              choice: {oneOf: [{enum: ['a', 'b']}, {$ref: 'common_types.json#/$defs/DataBinding'}]},
              narrowed: {allOf: [{$ref: '#/$defs/DynamicString'}, {if: {}, then: {}}]},
              open: {type: 'object', properties: {a: {type: 'boolean'}}},
            },
          },
        ],
      }),
      {},
      isCommonTypeName,
    );
    assert.deepStrictEqual(view['properties'], {
      common: {$ref: 'common_types.json#/$defs/DynamicString', description: 'Kept.'},
      recursive: {
        type: 'object',
        properties: {next: {}},
        additionalProperties: true,
      },
      missing: {},
      choice: {$ref: 'common_types.json#/$defs/DynamicString'},
      narrowed: {$ref: 'common_types.json#/$defs/DynamicString'},
      open: {type: 'object', properties: {a: {type: 'boolean'}}, additionalProperties: true},
    });
    assert.strictEqual(view['additionalProperties'], true);
  });
});
