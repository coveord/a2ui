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

import {
  forSubsetConverters,
  withoutConditionals,
  withoutFormatAssertions,
  withoutNegations,
  withoutUnevaluatedProperties,
  withoutUnicodePropertyPatterns,
  withRefsUnderDefs,
  withRequiredBranchesExpanded,
} from './json_schema_compat.js';

describe('withoutUnevaluatedProperties', () => {
  it('closes a schema over the names it and its allOf members evaluate', () => {
    const schema: Record<string, unknown> = withoutUnevaluatedProperties({
      allOf: [{$ref: '#/$defs/Base'}],
      properties: {b: {type: 'number'}},
      unevaluatedProperties: false,
      $defs: {Base: {properties: {a: {type: 'string'}}}},
    });

    assert.deepStrictEqual(schema['properties'], {b: {type: 'number'}, a: {}});
    assert.strictEqual(schema['additionalProperties'], false);
    assert.ok(!('unevaluatedProperties' in schema));
  });

  it('closes each union branch over its own names', () => {
    const schema: Record<string, unknown> = withoutUnevaluatedProperties({
      properties: {catalogId: {type: 'string'}},
      oneOf: [{properties: {x: {}}}, {properties: {y: {}}}],
      unevaluatedProperties: false,
    });

    assert.deepStrictEqual(schema['allOf'], [
      {
        anyOf: [
          {properties: {catalogId: {}, x: {}}, additionalProperties: false},
          {properties: {catalogId: {}, y: {}}, additionalProperties: false},
        ],
      },
    ]);
  });

  it('leaves an open schema open', () => {
    assert.deepStrictEqual(withoutUnevaluatedProperties({unevaluatedProperties: true}), {});
  });
});

describe('withoutNegations', () => {
  it('turns required names, patterns and types into positive constraints', () => {
    assert.deepStrictEqual(
      withoutNegations({type: 'object', not: {anyOf: [{required: ['a']}, {required: ['b']}]}}),
      {type: 'object', properties: {a: false, b: false}},
    );
    assert.deepStrictEqual(withoutNegations({propertyNames: {not: {pattern: '^@'}}}), {
      propertyNames: {pattern: '^(?!(?:^@))'},
    });
    assert.deepStrictEqual(withoutNegations({not: {type: 'string'}}), {
      allOf: [{type: ['number', 'integer', 'boolean', 'null', 'array', 'object']}],
    });
  });

  it('keeps {not: {}} and leaves a property named "not" alone', () => {
    assert.deepStrictEqual(withoutNegations({not: {}}), {not: {}});
    const schema = {properties: {not: {type: 'boolean'}}};
    assert.deepStrictEqual(withoutNegations(schema), schema);
  });
});

describe('withoutConditionals', () => {
  it('turns if/then into (if and then) or (not if)', () => {
    assert.deepStrictEqual(withoutConditionals({if: {type: 'string'}, then: {minLength: 1}}), {
      allOf: [
        {
          anyOf: [
            {allOf: [{type: 'string'}, {minLength: 1}]},
            {allOf: [{not: {type: 'string'}}, {}]},
          ],
        },
      ],
    });
  });
});

describe('withRefsUnderDefs', () => {
  it('moves the components and functions sections under $defs', () => {
    assert.deepStrictEqual(
      withRefsUnderDefs({
        $ref: '#/functions/a~1b',
        functions: {'a/b': {type: 'object'}},
        properties: {x: {const: {$ref: '#/functions/kept'}}},
      }),
      {
        $ref: '#/$defs/__function__a~1b',
        $defs: {'__function__a/b': {type: 'object'}},
        properties: {x: {const: {$ref: '#/functions/kept'}}},
      },
    );
  });
});

describe('withRequiredBranchesExpanded', () => {
  it('repeats the object in each required-name branch and keeps $defs in place', () => {
    assert.deepStrictEqual(
      withRequiredBranchesExpanded({
        type: 'object',
        properties: {min: {type: 'number'}},
        anyOf: [{required: ['min']}, {required: ['max']}],
        $defs: {X: {}},
      }),
      {
        $defs: {X: {}},
        anyOf: [
          {type: 'object', properties: {min: {type: 'number'}}, required: ['min']},
          {type: 'object', properties: {min: {type: 'number'}}, required: ['max']},
        ],
      },
    );
  });
});

describe('withoutFormatAssertions', () => {
  it('drops format keywords but not properties named format', () => {
    assert.deepStrictEqual(
      withoutFormatAssertions({
        properties: {format: {type: 'string', format: 'uri'}},
        oneOf: [{format: 'date'}, {format: 'time'}],
      }),
      {properties: {format: {type: 'string'}}, oneOf: [{}]},
    );
  });
});

describe('withoutUnicodePropertyPatterns', () => {
  it('opens objects whose names a Unicode pattern checks', () => {
    assert.deepStrictEqual(
      withoutUnicodePropertyPatterns({
        type: 'object',
        patternProperties: {'^\\p{XID_Start}': {}},
        additionalProperties: false,
      }),
      {type: 'object'},
    );
  });
});

describe('forSubsetConverters', () => {
  it('applies every rewrite', () => {
    const schema = forSubsetConverters({
      properties: {value: {$ref: '#/functions/f'}},
      unevaluatedProperties: false,
      functions: {f: {if: {type: 'string'}, then: {format: 'date'}}},
    });
    const text = JSON.stringify(schema);

    for (const keyword of ['unevaluatedProperties', '"if"', '"not"', '"format"', '#/functions']) {
      assert.ok(!text.includes(keyword), keyword);
    }
  });
});
