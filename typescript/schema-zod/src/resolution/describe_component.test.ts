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

import {ChildListSchema, ChildSchema} from '../types/common-types.js';
import {describeZodComponent} from './describe_component.js';

describe('describeZodComponent', () => {
  it('reads child references by marker, and the declared property names', () => {
    const metadata = describeZodComponent(
      z.object({child: ChildSchema, items: ChildListSchema, label: z.string()}).strict(),
    );

    assert.deepStrictEqual(metadata.childRefs, ['child']);
    assert.deepStrictEqual(metadata.childLists, ['items']);
    assert.deepStrictEqual(metadata.propertyKeys, ['child', 'items', 'label']);
    assert.strictEqual(metadata.behavior.type, 'OBJECT');
  });

  it('reads a child reference named only by its definition, as the integrity checks do', () => {
    const metadata = describeZodComponent(
      z.object({slot: z.string().describe('ChildComponentId')}),
    );

    assert.deepStrictEqual(metadata.childRefs, ['slot']);
  });

  it('lists a property whose items hold child ids as both a list and nested', () => {
    const metadata = describeZodComponent(
      z.object({tabs: z.array(z.object({title: z.string(), child: ChildSchema}))}),
    );

    assert.deepStrictEqual(metadata.childLists, ['tabs']);
    assert.deepStrictEqual(metadata.nestedChildRefs, {tabs: ['child']});
  });

  it('reports no property names for a schema that accepts any', () => {
    assert.strictEqual(
      describeZodComponent(z.object({a: z.string()}).passthrough()).propertyKeys,
      null,
    );
  });
});
