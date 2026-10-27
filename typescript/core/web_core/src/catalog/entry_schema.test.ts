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

import {componentSchemaOf, functionSchemaOf, safeParseEntry} from './entry_schema.js';
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
    assert.strictEqual(schema.safeParse({choice: 'forbidden'}).success, true);
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
    assert.strictEqual(schema.safeParse({value: 1}).success, true);
    assert.strictEqual(schema.safeParse({value: 1, extra: true}).success, false);
  });

  it('returns the own schema of a function the document does not define', () => {
    const other: FunctionApi = {name: 'other', returnType: 'any', schema: z.object({})};
    assert.strictEqual(functionSchemaOf(catalog, other), other.schema);
  });
});

describe('safeParseEntry', () => {
  it('runs the checks only the own schema expresses', () => {
    const schema = componentSchemaOf(catalog, PickerApi);
    assert.strictEqual(
      safeParseEntry(schema, PickerApi.schema, {choice: 'forbidden'}).success,
      false,
    );
    assert.strictEqual(safeParseEntry(schema, PickerApi.schema, {choice: 'ok'}).success, true);
  });

  it('reports the document schema failure first', () => {
    const result = safeParseEntry(
      z.object({value: z.number()}).strict(),
      z.object({value: z.number()}),
      {value: 1, extra: true},
    );
    assert.strictEqual(result.success, false);
  });
});
