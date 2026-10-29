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

import {
  resolveComponentDefinition,
  resolveFunctionArgumentsDefinition,
  resolveThemeDefinition,
} from './catalog_definitions.js';

const COMMON_TYPES = new Set(['ComponentCommon', 'Checkable', 'DynamicString']);
const isCommonTypeName = (name: string) => COMMON_TYPES.has(name);

describe('resolveComponentDefinition', () => {
  it('orders mixins, referenced definitions, inline members and own properties', () => {
    const document = {
      catalogId: 'local',
      $defs: {Sized: {properties: {size: {type: 'number'}}, required: ['size']}},
    };
    const schema = {
      allOf: [
        {$ref: 'common_types.json#/$defs/ComponentCommon'},
        {$ref: 'common_types.json#/$defs/Checkable'},
        {$ref: '#/$defs/Sized'},
        {properties: {size: {type: 'integer'}, label: {type: 'string'}}, required: ['label']},
      ],
      properties: {component: {const: 'Field'}, value: {type: 'string'}},
      required: ['component'],
    };

    const resolved = resolveComponentDefinition(schema, document, {
      isCommonTypeName,
      isAtLeastV10: false,
    });
    assert.deepStrictEqual(resolved.pieces, [
      {kind: 'commonType', name: 'ComponentCommon', properties: ['accessibility']},
      {kind: 'commonType', name: 'Checkable'},
      {kind: 'properties', properties: {size: {type: 'number'}}},
      {kind: 'properties', properties: {size: {type: 'integer'}, label: {type: 'string'}}},
      {kind: 'properties', properties: {component: {const: 'Field'}, value: {type: 'string'}}},
    ]);
    assert.deepStrictEqual(resolved.required, new Set(['size', 'label', 'component']));
    assert.deepStrictEqual(resolved.omittedProperties, new Set(['id', 'component', 'catalogId']));
    assert.strictEqual(resolved.open, false);
  });

  it('includes the component metadata of ComponentCommon from v1.0', () => {
    const schema = {allOf: [{$ref: 'common_types.json#/$defs/ComponentCommon'}]};
    const resolved = resolveComponentDefinition(
      schema,
      {catalogId: 'local'},
      {
        isCommonTypeName,
        isAtLeastV10: true,
      },
    );
    assert.deepStrictEqual(resolved.pieces, [
      {kind: 'commonType', name: 'ComponentCommon', properties: ['accessibility', 'metadata']},
    ]);
  });

  it('is open only when the definition allows unevaluated or additional properties', () => {
    for (const [closure, open] of [
      [{}, false],
      [{unevaluatedProperties: false}, false],
      [{unevaluatedProperties: true}, true],
      [{additionalProperties: {type: 'string'}}, true],
    ] as const) {
      const resolved = resolveComponentDefinition(
        {properties: {}, ...closure},
        {catalogId: 'local'},
        {isCommonTypeName, isAtLeastV10: false},
      );
      assert.strictEqual(resolved.open, open, JSON.stringify(closure));
    }
  });

  it('keeps the envelope of a component mixin from the same catalog', () => {
    const document = {
      catalogId: 'local',
      components: {Base: {properties: {component: {const: 'Base'}, tone: {type: 'string'}}}},
    };
    const resolved = resolveComponentDefinition({allOf: [{$ref: '#/components/Base'}]}, document, {
      isCommonTypeName,
      isAtLeastV10: false,
    });
    assert.deepStrictEqual(resolved.pieces, [
      {kind: 'properties', properties: {component: {const: 'Base'}, tone: {type: 'string'}}},
    ]);
  });

  it('ignores a mixin from an unknown document', () => {
    const resolved = resolveComponentDefinition(
      {allOf: [{$ref: 'missing.json#/components/Base'}], properties: {tone: {type: 'string'}}},
      {catalogId: 'local'},
      {isCommonTypeName, isAtLeastV10: false},
    );
    assert.deepStrictEqual(resolved.pieces, [
      {kind: 'properties', properties: {tone: {type: 'string'}}},
    ]);
  });
});

describe('resolveThemeDefinition', () => {
  it('keeps every property and is open unless closed', () => {
    const open = resolveThemeDefinition(
      {type: 'object', properties: {id: {type: 'string'}}},
      {catalogId: 'local'},
      {isCommonTypeName},
    );
    assert.deepStrictEqual(open.omittedProperties, new Set());
    assert.strictEqual(open.open, true);

    const closed = resolveThemeDefinition(
      {type: 'object', properties: {}, additionalProperties: false},
      {catalogId: 'local'},
      {isCommonTypeName},
    );
    assert.strictEqual(closed.open, false);
  });
});

describe('resolveFunctionArgumentsDefinition', () => {
  it('gathers referenced, allOf and shorthand argument schemas', () => {
    const document = {
      catalogId: 'local',
      $defs: {Base: {properties: {value: {type: 'string'}}, required: ['value']}},
    };
    const schema = {
      allOf: [{$ref: '#/$defs/Base'}, {type: 'object', required: ['extra']}],
      properties: {extra: {type: 'number'}},
      additionalProperties: false,
    };

    const resolved = resolveFunctionArgumentsDefinition(schema, document, {isCommonTypeName});
    assert.deepStrictEqual(resolved.pieces, [
      {kind: 'properties', properties: {value: {type: 'string'}}},
      {kind: 'properties', properties: {extra: {type: 'number'}}},
    ]);
    assert.deepStrictEqual(resolved.required, new Set(['value', 'extra']));
    assert.strictEqual(resolved.open, false);

    const shorthand = resolveFunctionArgumentsDefinition({value: {type: 'string'}}, document, {
      isCommonTypeName,
    });
    assert.deepStrictEqual(shorthand.pieces, [
      {kind: 'properties', properties: {value: {type: 'string'}}},
    ]);
  });

  it('leaves the arguments open when part of their schema cannot be gathered', () => {
    for (const schema of [
      {oneOf: [{properties: {a: {type: 'string'}}}, {properties: {b: {type: 'string'}}}]},
      {$ref: 'common_types.json#/$defs/DynamicString'},
      {$ref: '#/$defs/Missing'},
    ]) {
      const resolved = resolveFunctionArgumentsDefinition(
        schema,
        {catalogId: 'local'},
        {
          isCommonTypeName,
        },
      );
      assert.strictEqual(resolved.open, true, JSON.stringify(schema));
    }
  });
});
