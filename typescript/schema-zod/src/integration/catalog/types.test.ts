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
import {ComponentApi, InferredComponentApiSchemaType} from '@a2ui/web_core_v1_0';

import {z} from '../../index.js';
import {ZodCatalog} from '../../test/zod_catalog.js';

describe('Catalog with Zod schemas', () => {
  it('safely computes componentRefMap with default fallback when refOptions is omitted', () => {
    const mockComponent = {
      name: 'Container',
      schema: z.object({
        child: z.string().describe('ComponentId'),
      }),
    } satisfies ComponentApi;

    const catalog = new ZodCatalog('guid-1234', '1.0', [mockComponent]);
    assert.doesNotThrow(() => {
      const refMap = catalog.componentRefMap;
      assert.ok(refMap.Container);
      assert.deepStrictEqual(Array.from(refMap.Container.singleRefs), ['child']);
      assert.deepStrictEqual(Array.from(refMap.Container.listRefs), []);
    });
  });

  it('serializes catalog to JSON schema via validationSchema', () => {
    const mockComponent = {
      name: 'CustomButton',
      schema: z.object({
        label: z.string().describe('REF:#/$defs/DynamicString'),
      }),
    } satisfies ComponentApi;

    const catalog = new ZodCatalog('https://example.com/custom-cat.json', '1.0', [mockComponent]);

    const schema = catalog.validationSchema;
    const defs = schema['$defs'] as Record<string, any>;
    assert.ok(defs);
    assert.ok(defs.DynamicString);
  });
});

describe('InferredComponentApiSchemaType', () => {
  it('infers the correct schema type from a ComponentApi', () => {
    const mockSchema = z.object({
      field1: z.string(),
      field2: z.number().optional(),
    });

    const mockApi = {
      name: 'MockComp',
      schema: mockSchema,
    } satisfies ComponentApi;

    // Type-level equivalence assertion using z.infer
    type ExpectedType = z.infer<typeof mockSchema>;
    type InferredType = InferredComponentApiSchemaType<typeof mockApi>;

    // Assert `InferredType` is not exactly `any`
    type IsAny<T> = 0 extends 1 & T ? true : false;
    // inferredIsAny only accepts "true" if `InferredType` is "any".
    // This happens when `mockApi: ComponentApi`, but doesn't when
    // `mockApi {} satisfies ComponentApi`!
    const inferredIsAny: IsAny<InferredType> = false;

    // When types are not "any", check that they're the same by checking if they
    // extend each other.
    type TypesAreEquivalent<Expected, Actual> = Actual extends Expected
      ? Expected extends Actual
        ? true
        : false
      : false;

    // typesMatchExact only accepts "true" if `TypesAreEquivalent`
    const typesMatchExact: TypesAreEquivalent<ExpectedType, InferredType> = true;

    // Appease linter by using the variables
    assert.ok(mockApi);
    assert.strictEqual(inferredIsAny, false);
    assert.strictEqual(typesMatchExact, true);
  });
});
