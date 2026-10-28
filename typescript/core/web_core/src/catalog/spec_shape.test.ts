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

import {specAnnotationOf, specJsonSchemaOf} from './a2ui_json_schema.js';
import {spec} from './spec_annotations.js';
import {SpecShaper} from './spec_shape.js';

describe('specJsonSchemaOf', () => {
  it('holds the spec() annotations of the wrappers around a schema, the outer ones winning', () => {
    const inner = spec(z.string(), {keywords: {format: 'uri'}, required: ['a']});
    const outer = spec(inner.optional(), {required: ['b']});
    const view = specJsonSchemaOf(z.object({link: outer}));
    const link = (view['properties'] as Record<string, unknown>)['link'];
    assert.deepStrictEqual(specAnnotationOf(link), {keywords: {format: 'uri'}, required: ['b']});
    // The annotation is not written to JSON.
    assert.strictEqual(JSON.stringify(link), '{"type":"string","format":"uri"}');
  });

  it('leaves open an object that strips unknown keys', () => {
    const properties = {a: z.string()};
    const closure = (schema: z.ZodTypeAny) => specJsonSchemaOf(schema)['additionalProperties'];
    assert.strictEqual(closure(z.object(properties)), undefined);
    assert.strictEqual(closure(z.object(properties).strict()), false);
    assert.strictEqual(closure(z.object(properties).passthrough()), true);
  });

  it('keeps each branch of a union of literals', () => {
    assert.deepStrictEqual(specJsonSchemaOf(z.union([z.literal('a'), z.literal('b')])), {
      anyOf: [
        {type: 'string', const: 'a'},
        {type: 'string', const: 'b'},
      ],
    });
  });

  it('writes exclusive bounds as numbers', () => {
    assert.deepStrictEqual(specJsonSchemaOf(z.number().gt(0).lt(10)), {
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 10,
    });
  });
});

describe('SpecShaper', () => {
  it('shapes a schema that is not a Zod schema from its JSON Schema', () => {
    const shaper = new SpecShaper('1.0');
    const json = {
      type: 'object',
      properties: {
        label: {type: 'string', description: 'The label.'},
        tone: {anyOf: [{const: 'light'}, {const: 'dark'}]},
      },
      required: ['label'],
      additionalProperties: false,
    };
    assert.deepStrictEqual(shaper.toJson(json), {
      type: 'object',
      properties: {
        label: {type: 'string', description: 'The label.'},
        tone: {oneOf: [{const: 'light'}, {const: 'dark'}]},
      },
      required: ['label'],
      additionalProperties: false,
    });
  });
});
