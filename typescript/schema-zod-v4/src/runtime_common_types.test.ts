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

import {forSubsetConverters, V10_RUNTIME_COMMON_TYPE_DEFS} from '@a2ui/web_core_v1_0';
import {z} from 'zod';

import {CommonSchemas} from './types/common-types.js';

/** Values that tell the common types apart. */
const VALUES: unknown[] = [
  's',
  '',
  1,
  true,
  null,
  [],
  ['a', 'b'],
  [1],
  {},
  {a: 1},
  {'@x': 1},
  {'path': '/a'},
  {'@path': '/a'},
  {'@path': 1},
  {'@path': '/a', 'extra': 1},
  {'call': 'f'},
  {'@call': 'f'},
  {'@call': 'f', 'args': {a: 1}},
  {'@call': 'f', 'args': 1},
  {'@call': 'f', 'catalogId': 'c'},
  {'@call': 'f', 'bogus': 1},
  {'@call': '@index', 'args': {offset: 1}},
  {'@call': 'f', 'returnType': 'x'},
  {componentId: 'c', path: '/p'},
  {componentId: 'c'},
  {event: {name: 'e'}},
  {functionCall: {'@call': 'f'}},
  {condition: {'@path': '/a'}, message: 'm'},
  {condition: 1},
  {label: {'@path': '/a'}},
  {checks: [{condition: {'@call': 'f'}}]},
];

describe('V10_RUNTIME_COMMON_TYPE_DEFS', () => {
  for (const [name, mirror] of Object.entries(CommonSchemas)) {
    // A Unicode identifier check on key names has no form z.fromJSONSchema
    // reads, so the converted Extensions accepts more names.
    if (name === 'Extensions') continue;
    it(`${name} accepts what the Zod mirror accepts`, () => {
      const converted = z.fromJSONSchema(
        forSubsetConverters({
          $ref: `#/$defs/${name}`,
          $defs: V10_RUNTIME_COMMON_TYPE_DEFS,
        }) as Parameters<typeof z.fromJSONSchema>[0],
      );
      for (const value of VALUES) {
        assert.strictEqual(
          converted.safeParse(value).success,
          (mirror as z.ZodType).safeParse(value).success,
          JSON.stringify(value),
        );
      }
    });
  }
});
