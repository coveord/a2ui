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

import {ChildListSchema, ComponentIdSchema} from '../types/common-types.js';
import {Catalog, type ComponentApi} from './types.js';

function writtenProperties(schema: z.ZodTypeAny): Record<string, unknown> {
  const component: ComponentApi = {name: 'Card', schema};
  const doc = new Catalog('override-catalog', '0.9', [component]).toJson();
  return (doc['components'] as any).Card.properties;
}

describe('entrySchemaOverride', () => {
  it('writes a described child reference as a reference to ComponentId', () => {
    const props = writtenProperties(
      z.object({child: ComponentIdSchema.describe('The child to show.')}),
    );
    assert.deepStrictEqual(props['child'], {
      $ref: 'common_types.json#/$defs/ComponentId',
      description: 'The child to show.',
    });
  });

  it('writes an optional described child list as a reference to ChildList', () => {
    const props = writtenProperties(
      z.object({children: ChildListSchema.describe('The children.').optional()}),
    );
    assert.deepStrictEqual(props['children'], {
      $ref: 'common_types.json#/$defs/ChildList',
      description: 'The children.',
    });
  });

  it('leaves a plain string as a string', () => {
    const props = writtenProperties(z.object({label: z.string().describe('A label.')}));
    assert.deepStrictEqual(props['label'], {type: 'string', description: 'A label.'});
  });
});
