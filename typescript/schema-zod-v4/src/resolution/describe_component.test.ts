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

import {z} from 'zod';

import {
  ChildListSchema,
  ChildSchema,
  DynamicStringSchema,
  ActionSchema,
  CheckRuleSchema,
} from '../types/common-types.js';
import {describeZod4Component, getZod4KnownSchemaKeys} from './describe_component.js';

describe('describeZod4Component', () => {
  it('reads child references by marker, and the declared property names', () => {
    const metadata = describeZod4Component(
      z.object({child: ChildSchema, items: ChildListSchema, label: z.string()}).strict(),
    );

    assert.deepStrictEqual(metadata.childRefs, ['child']);
    assert.deepStrictEqual(metadata.childLists, ['items']);
    assert.deepStrictEqual(metadata.propertyKeys, ['child', 'items', 'label']);
  });

  it('keeps the marker through describe and optional', () => {
    const metadata = describeZod4Component(
      z.object({
        header: ChildSchema.describe('The header component.').optional(),
        body: ChildListSchema.describe('REF:#/$defs/ChildList|The body.'),
      }),
    );

    assert.deepStrictEqual(metadata.childRefs, ['header']);
    assert.deepStrictEqual(metadata.childLists, ['body']);
  });

  it('reads a child reference named only by its definition', () => {
    const metadata = describeZod4Component(
      z.object({slot: z.string().describe('ChildComponentId')}),
    );

    assert.deepStrictEqual(metadata.childRefs, ['slot']);
  });

  it('lists a property whose items hold child ids as both a list and nested', () => {
    const metadata = describeZod4Component(
      z.object({tabs: z.array(z.object({title: z.string(), child: ChildSchema}))}),
    );

    assert.deepStrictEqual(metadata.childLists, ['tabs']);
    assert.deepStrictEqual(metadata.nestedChildRefs, {tabs: ['child']});
  });

  it('classifies property behavior from the common types', () => {
    const {behavior} = describeZod4Component(
      z.object({
        text: DynamicStringSchema,
        action: ActionSchema.optional(),
        checks: z.array(CheckRuleSchema).optional(),
        children: ChildListSchema,
        size: z.number(),
      }),
    );

    assert.strictEqual(behavior.type, 'OBJECT');
    const shape = behavior.type === 'OBJECT' ? behavior.shape : {};
    assert.deepStrictEqual(
      Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.type])),
      {
        text: 'DYNAMIC',
        action: 'ACTION',
        checks: 'CHECKABLE',
        children: 'STRUCTURAL',
        size: 'STATIC',
        accessibility: 'OBJECT',
      },
    );
  });

  it('returns the same metadata for the same schema', () => {
    const schema = z.object({a: z.string()});

    assert.strictEqual(describeZod4Component(schema), describeZod4Component(schema));
  });
});

describe('getZod4KnownSchemaKeys', () => {
  it('reports no names for a schema that accepts any property', () => {
    assert.strictEqual(getZod4KnownSchemaKeys(z.object({a: z.string()}).passthrough()), null);
    assert.strictEqual(getZod4KnownSchemaKeys(z.looseObject({a: z.string()})), null);
  });

  it('reads through refinements, intersections and unions', () => {
    assert.deepStrictEqual(
      getZod4KnownSchemaKeys(z.object({a: z.string()}).refine(() => true)),
      new Set(['a']),
    );
    assert.deepStrictEqual(
      getZod4KnownSchemaKeys(z.intersection(z.object({a: z.string()}), z.object({b: z.number()}))),
      new Set(['a', 'b']),
    );
    assert.deepStrictEqual(
      getZod4KnownSchemaKeys(z.union([z.object({x: z.string()}), z.object({y: z.string()})])),
      new Set(['x', 'y']),
    );
  });
});
