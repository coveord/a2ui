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

import {normalizeSchema} from '../catalog/a2ui_schema.js';
import {componentSchemaOf} from '../catalog/entry_schema.js';
import {spec, specDef} from '../catalog/spec_annotations.js';
import {Catalog} from '../catalog/types.js';
import {A2uiCatalogError} from '../errors.js';
import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {ComponentIdSchema, DynamicStringSchema} from '../test/zod3-common-types.js';
import {PayloadValidator} from '../validation/payload-validator.js';
import {fromZod3} from './index.js';

const CardSchema = z
  .object({
    title: DynamicStringSchema,
    child: ComponentIdSchema.describe('The card body.'),
    elevation: z
      .number()
      .refine(value => value >= 0, 'elevation must not be negative')
      .optional(),
  })
  .strict();

describe('fromZod3', () => {
  it('writes the schema as JSON Schema, with child references', () => {
    const json = normalizeSchema(fromZod3(CardSchema));
    const properties = json['properties'] as Record<string, any>;
    assert.deepStrictEqual(properties['child'], {
      $ref: 'common_types.json#/$defs/ComponentId',
      description: 'The card body.',
    });
    assert.deepStrictEqual(properties['title'].$ref, 'common_types.json#/$defs/DynamicString');
    assert.deepStrictEqual(json['required'], ['title', 'child']);
  });

  it('validates with the Zod schema itself, refinements included', async () => {
    const schema = fromZod3(CardSchema);
    const ok = await schema['~standard'].validate({title: 'T', child: 'c', elevation: 1});
    const negative = await schema['~standard'].validate({title: 'T', child: 'c', elevation: -1});
    assert.strictEqual(ok.issues, undefined);
    assert.ok(negative.issues?.some(issue => issue.message === 'elevation must not be negative'));
  });

  it('makes a component that binds as the Zod component does', () => {
    const card = {name: 'Card', schema: fromZod3(CardSchema)};
    const catalog = new Catalog('card-catalog', '0.9', [card]);
    assert.deepStrictEqual(
      scrapeSchemaBehavior(componentSchemaOf(catalog, card)),
      scrapeSchemaBehavior(CardSchema),
    );
    assert.ok(catalog.componentRefMap['Card'].singleRefs.has('child'));
  });

  it('makes a component whose refinements still run', () => {
    const card = {name: 'Card', schema: fromZod3(CardSchema)};
    const validator = new PayloadValidator(new Catalog('card-catalog', '0.9', [card]), {
      allowUnknownElements: false,
    });
    validator.validateComponent({id: 'c', component: 'Card', title: 'T', child: 'b'});
    assert.throws(
      () =>
        validator.validateComponent({
          id: 'c',
          component: 'Card',
          title: 'T',
          child: 'b',
          elevation: -1,
        }),
      /elevation must not be negative/,
    );
  });

  it('makes a catalog of spec()-annotated schemas write and validate as the bare one', () => {
    const wrap = <E extends {schema: unknown}>(entry: E): E => ({
      ...entry,
      schema: fromZod3(entry.schema as never),
    });
    // A catalog written with Zod 3 and spec(), catalog mixins included.
    const commonDef = specDef(
      'CatalogComponentCommon',
      z.object({weight: z.number().describe('The weight.').optional()}),
    );
    const themeDef = specDef('theme', z.object({primaryColor: z.string().optional()}));
    const badge = {
      name: 'Badge',
      schema: spec(
        z
          .object({...commonDef.shape, label: DynamicStringSchema})
          .strict()
          .describe('A badge.'),
        {mixins: ['ComponentCommon', commonDef]},
      ),
    };
    const options = {
      themeSchema: themeDef,
      defModels: [themeDef],
      commonTypesUri: 'https://a2ui.org/specification/v0_9/common_types.json',
    };
    const source = new Catalog('https://example.com/badges', '0.9', [badge], [], options);
    const wrapped = new Catalog('https://example.com/badges', '0.9', [badge].map(wrap), [], {
      ...options,
      themeSchema: fromZod3(themeDef),
    });
    const document = source.toJson();
    assert.ok('CatalogComponentCommon' in (document.$defs as Record<string, unknown>));
    assert.deepStrictEqual(wrapped.toJson(), document);
    assert.deepStrictEqual(wrapped.validationSchema, source.validationSchema);
  });

  it('rejects a JSON Schema target other than draft 2020-12', () => {
    assert.throws(
      () => fromZod3(CardSchema)['~standard'].jsonSchema.input({target: 'draft-07'}),
      A2uiCatalogError,
    );
  });
});
