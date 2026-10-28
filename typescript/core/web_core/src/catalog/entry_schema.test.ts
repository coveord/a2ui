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

import {validateA2uiSchema, type A2uiValidator} from './a2ui_schema.js';
import {componentSchemaOf, functionSchemaOf, validateEntry} from './entry_schema.js';
import {Catalog, type ComponentApi, type FunctionApi} from './types.js';

const PickerApi: ComponentApi = {
  name: 'Picker',
  schema: z.object({
    choice: z.string().refine(value => value !== 'forbidden', 'forbidden choice'),
  }),
};

const RoundApi: FunctionApi = {
  name: 'round',
  returnType: 'number',
  schema: z.object({value: z.number()}).strict(),
};

/** Whether a schema accepts a value, read as a Standard Schema validator. */
function accepts(schema: A2uiValidator, value: unknown): boolean {
  return validateA2uiSchema(schema, value).issues === undefined;
}

const catalog = new Catalog<ComponentApi, FunctionApi>(
  'test-catalog',
  '0.9',
  [PickerApi],
  [RoundApi],
);

describe('componentSchemaOf', () => {
  it('reads a component defined in code through its catalog document', () => {
    const schema = componentSchemaOf(catalog, PickerApi);
    assert.notStrictEqual(schema, PickerApi.schema);
    assert.strictEqual(componentSchemaOf(catalog, PickerApi), schema);
    // The document has no refinement, so the derived schema accepts it.
    assert.strictEqual(accepts(schema, {choice: 'forbidden'}), true);
  });

  it('returns the schema of a component loaded with Catalog.fromJson as is', () => {
    const loaded = Catalog.fromJson(catalog.toJson());
    const picker = loaded.components.get('Picker')!;
    assert.strictEqual(componentSchemaOf(loaded, picker), picker.schema);
  });

  it('returns the own schema without a catalog', () => {
    assert.strictEqual(componentSchemaOf(undefined, PickerApi), PickerApi.schema);
  });
});

describe('functionSchemaOf', () => {
  it('reads a function defined in code through its catalog document', () => {
    const schema = functionSchemaOf(catalog, RoundApi);
    assert.notStrictEqual(schema, RoundApi.schema);
    assert.strictEqual(accepts(schema, {value: 1}), true);
    assert.strictEqual(accepts(schema, {value: 1, extra: true}), false);
  });

  it('returns the own schema of a function the document does not define', () => {
    const other: FunctionApi = {name: 'other', returnType: 'any', schema: z.object({})};
    assert.strictEqual(functionSchemaOf(catalog, other), other.schema);
  });
});

describe('validateEntry', () => {
  it('runs the checks only the own schema expresses', () => {
    const schema = componentSchemaOf(catalog, PickerApi);
    const rejected = validateEntry(schema, PickerApi.schema, {choice: 'forbidden'});
    assert.deepStrictEqual(
      rejected.issues?.map(issue => issue.message),
      ['forbidden choice'],
    );
    assert.deepStrictEqual(validateEntry(schema, PickerApi.schema, {choice: 'ok'}), {
      value: {choice: 'ok'},
    });
  });

  it('reports the document schema failure first', () => {
    const result = validateEntry(
      z.object({value: z.number()}).strict(),
      z.object({value: z.number().refine(() => false, 'own check')}),
      {value: 1, extra: true},
    );
    assert.deepStrictEqual(
      result.issues?.map(issue => issue.message),
      ["Unrecognized key(s) in object: 'extra'"],
    );
  });

  it('returns the value the own schema outputs, with its defaults', () => {
    const document = z.object({size: z.number().optional()});
    const own = z.object({size: z.number().default(3)});
    assert.deepStrictEqual(validateEntry(document, own, {}), {value: {size: 3}});
  });

  it('validates with a library schema through Standard Schema', () => {
    const own: A2uiValidator = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: value =>
          (value as {size?: number}).size === 0
            ? {issues: [{message: 'Too small', path: [{key: 'size'}]}]}
            : {value},
      },
    };
    const document = z.object({size: z.number()});
    assert.deepStrictEqual(
      validateEntry(document, own as never, {size: 0}).issues?.map(issue => issue.message),
      ['Too small'],
    );
    assert.deepStrictEqual(validateEntry(document, own as never, {size: 1}), {value: {size: 1}});
  });

  it('adds nothing to the document check for a JSON Schema object', () => {
    const document = z.object({size: z.number()});
    assert.deepStrictEqual(validateEntry(document, {type: 'object'}, {size: 1}), {
      value: {size: 1},
    });
  });
});
