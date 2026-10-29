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

import {z} from 'zod';

import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {PayloadValidator} from '../validation/payload-validator.js';
import {componentSchemaOf} from './entry_schema.js';
import {
  Catalog,
  createFunctionImplementation,
  type ComponentApi,
  type InferredComponentApiSchemaType,
  type ResolvedFunctionArgs,
} from './types.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<T extends true>(): T | void {}

/** A component written with Zod 4, which A2UI reads through Standard JSON Schema. */
const BadgeApi = {
  name: 'Badge',
  schema: z
    .object({
      label: z.string(),
      count: z.number().refine(value => value >= 0, 'count must not be negative'),
      tone: z.enum(['info', 'warning']).optional(),
    })
    .strict(),
} satisfies ComponentApi;

/** A component written as a JSON Schema object. */
const ChipApi = {
  name: 'Chip',
  schema: {
    type: 'object',
    properties: {
      text: {$ref: 'common_types.json#/$defs/DynamicString'},
      child: {$ref: 'common_types.json#/$defs/ComponentId'},
    },
    required: ['text'],
    additionalProperties: false,
  },
} satisfies ComponentApi;

const catalog = new Catalog<ComponentApi>('library-catalog', '1.0', [BadgeApi, ChipApi]);
const validator = new PayloadValidator(catalog, {allowUnknownElements: false});

describe('a component written with Zod 4', () => {
  it('infers its properties through Standard Schema', () => {
    assertType<
      Equal<
        InferredComponentApiSchemaType<typeof BadgeApi>,
        {label: string; count: number; tone?: 'info' | 'warning' | undefined}
      >
    >();
  });

  it('is written to the catalog document as JSON Schema', () => {
    const definition = (catalog.toJson()['components'] as Record<string, any>)['Badge'];
    assert.deepStrictEqual(definition.properties.component, {const: 'Badge'});
    assert.deepStrictEqual(definition.properties.label, {type: 'string'});
    assert.deepStrictEqual(definition.required, ['component', 'label', 'count']);
  });

  it('validates against its document and with Zod 4 itself', () => {
    validator.validateComponent({id: 'b', component: 'Badge', label: 'New', count: 1});
    assert.throws(() => validator.validateComponent({id: 'b', component: 'Badge', count: 1}));
    assert.throws(
      () => validator.validateComponent({id: 'b', component: 'Badge', label: 'x', count: -1}),
      /count must not be negative/,
    );
  });
});

describe('a component written as JSON Schema', () => {
  it('types its properties as a record', () => {
    assertType<Equal<InferredComponentApiSchemaType<typeof ChipApi>, Record<string, unknown>>>();
  });

  it('binds and finds child references through its document', () => {
    const behavior = scrapeSchemaBehavior(componentSchemaOf(catalog, ChipApi));
    assert.strictEqual(behavior.type === 'OBJECT' && behavior.shape['text'].type, 'DYNAMIC');
    assert.ok(catalog.componentRefMap['Chip'].singleRefs.has('child'));
  });

  it('validates against its document', () => {
    validator.validateComponent({id: 'c', component: 'Chip', text: {path: '/t'}, child: 'b'});
    assert.throws(() => validator.validateComponent({id: 'c', component: 'Chip', extra: 1}));
  });
});

describe('createFunctionImplementation', () => {
  it('types arguments from a Zod 4 schema', async () => {
    const shout = createFunctionImplementation(
      {name: 'shout', returnType: 'string', schema: z.object({value: z.string()})},
      args => args.value.toUpperCase(),
    );
    assertType<Equal<ResolvedFunctionArgs<z.ZodObject<{value: z.ZodString}>>, {value: string}>>();
    const fnCatalog = new Catalog('fn-catalog', '1.0', [], [shout]);
    new PayloadValidator(fnCatalog, {allowUnknownElements: false}).validateFunction('shout', {
      value: 'hi',
    });
    assert.strictEqual(shout.execute({value: 'hi'}, undefined as never), 'HI');
  });
});
