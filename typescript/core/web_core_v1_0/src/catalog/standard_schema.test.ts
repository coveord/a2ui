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
import {z} from '@a2ui/schema-zod';

import {
  type StandardSchema,
  type StandardSchemaInput,
  type StandardSchemaOutput,
  validateStandardSchema,
} from './standard_schema.js';

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2
    ? true
    : false;
type Assert<Type extends true> = Type;

describe('Standard Schema interoperability', () => {
  it('preserves Zod 3 input and output types', () => {
    const schema = z.object({name: z.string()});
    assert.ok(schema);

    type Input = Assert<Equal<StandardSchemaInput<typeof schema>, {name: string}>>;
    type Output = Assert<Equal<StandardSchemaOutput<typeof schema>, {name: string}>>;
    const input: Input = true;
    const output: Output = true;
    assert.strictEqual(input, true);
    assert.strictEqual(output, true);
  });

  it('accepts Zod 3 schemas with optional failure values', () => {
    const schema: StandardSchema = z.object({name: z.string()});

    const result = validateStandardSchema(schema, {name: 42});
    assert.ok(result.issues);
    assert.strictEqual(result.value, undefined);
  });
});
