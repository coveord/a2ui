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

import {z} from 'zod/v3';

import {markChildRef} from '../types/child-ref-helpers.js';

/**
 * Zod 3 stand-ins for common types, for tests of Zod 3 support: the common
 * types themselves are written with Zod 4. Each names its definition with a
 * `REF:` description, as Zod 3 catalogs do.
 */

export const DynamicStringSchema = z
  .union([
    z.string(),
    z.object({path: z.string()}).strict(),
    z.object({call: z.string(), args: z.record(z.unknown()).optional()}).strict(),
  ])
  .describe('REF:common_types.json#/$defs/DynamicString|Represents a string');

export const ComponentIdSchema = markChildRef(
  z.string().describe('REF:common_types.json#/$defs/ComponentId'),
  'component-id',
);

export const ChildListSchema = markChildRef(
  z
    .union([
      z.array(ComponentIdSchema),
      z.object({componentId: ComponentIdSchema, path: z.string()}),
    ])
    .describe('REF:common_types.json#/$defs/ChildList'),
  'child-list',
);
