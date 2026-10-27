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

import {z as z4} from 'zod/v4';

import {A2uiCatalogError} from '../errors.js';
import {normalizeSchema, type A2uiStandardSchema} from './a2ui_schema.js';

/**
 * A schema as a library implementing Standard Schema and Standard JSON Schema
 * exposes it, recording the targets it was asked for.
 */
function librarySchema(json: Record<string, unknown>, targets: string[] = []): A2uiStandardSchema {
  const write = ({target}: {target: string}) => {
    targets.push(target);
    return json;
  };
  return {
    '~standard': {
      version: 1,
      vendor: 'example',
      validate: value => ({value}),
      jsonSchema: {input: write, output: write},
    },
  };
}

describe('normalizeSchema', () => {
  it('reads a library schema as JSON Schema draft 2020-12, without $schema', () => {
    const targets: string[] = [];
    const json = normalizeSchema(
      librarySchema(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {label: {type: 'string'}},
        },
        targets,
      ),
    );
    assert.deepStrictEqual(json, {type: 'object', properties: {label: {type: 'string'}}});
    assert.deepStrictEqual(targets, ['draft-2020-12']);
  });

  it('copies a JSON Schema object, without $id', () => {
    const schema = {$id: 'urn:x', type: 'object', properties: {}};
    const json = normalizeSchema(schema);
    assert.deepStrictEqual(json, {type: 'object', properties: {}});
    assert.notStrictEqual(json, schema);
  });

  it('reads a Zod 4 schema through its Standard JSON Schema', () => {
    const json = normalizeSchema(z4.object({label: z4.string(), size: z4.number().optional()}));
    assert.strictEqual(json['$schema'], undefined);
    assert.strictEqual(json['type'], 'object');
    assert.deepStrictEqual(json['required'], ['label']);
    assert.deepStrictEqual((json['properties'] as Record<string, unknown>)['label'], {
      type: 'string',
    });
  });

  it('rejects a Standard Schema that cannot write JSON Schema', () => {
    const validateOnly = {
      '~standard': {version: 1, vendor: 'example', validate: (value: unknown) => ({value})},
    };
    assert.throws(
      () => normalizeSchema(validateOnly as never),
      (err: unknown) => err instanceof A2uiCatalogError && /Standard JSON Schema/.test(err.message),
    );
  });

  it('rejects a value that is not an object', () => {
    assert.throws(() => normalizeSchema('string' as never), A2uiCatalogError);
  });
});
