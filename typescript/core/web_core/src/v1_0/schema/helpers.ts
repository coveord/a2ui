/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {z} from 'zod/v4';
import {type RefSchemaOptions} from '../../types/child-ref-helpers.js';
import {
  ChildListSchema,
  ComponentCommonSchema,
  ComponentIdSchema,
  DynamicBooleanSchema,
  DynamicNumberSchema,
  DynamicStringListSchema,
  DynamicStringSchema,
  DynamicValueSchema,
} from './common-types.js';

export {type RefSchemaOptions};

export const TemplateChildListSchema = z
  .object({
    'componentId': z.lazy(() => ComponentIdSchema),
    'path': z
      .string()
      .describe('The path to the list of component property objects in the data model.'),
  })
  .strict()
  .meta({
    $ref: '#/$defs/TemplateChildList',
    description:
      'A template for generating a dynamic list of children from a data model list. The `componentId` is the component to use as a template.',
  });
export type TemplateChildList = z.infer<typeof TemplateChildListSchema>;

export function componentId(options: RefSchemaOptions = {}): typeof ComponentIdSchema {
  if (options.description === undefined) {
    return ComponentIdSchema;
  }
  return ComponentIdSchema.describe(options.description);
}

export function dynamicString(description?: string) {
  return description ? DynamicStringSchema.describe(description) : DynamicStringSchema;
}

export function dynamicNumber(description?: string) {
  return description ? DynamicNumberSchema.describe(description) : DynamicNumberSchema;
}

export function dynamicBoolean(description?: string) {
  return description ? DynamicBooleanSchema.describe(description) : DynamicBooleanSchema;
}

export function dynamicValue(description?: string) {
  return description ? DynamicValueSchema.describe(description) : DynamicValueSchema;
}

export function dynamicStringList(description?: string) {
  return description ? DynamicStringListSchema.describe(description) : DynamicStringListSchema;
}

export function childList(options: RefSchemaOptions = {}): typeof ChildListSchema {
  if (options.description === undefined) {
    return ChildListSchema;
  }
  return ChildListSchema.describe(options.description);
}

/** Zod schema validating any component payload in a v1.0 message (excluding Surface). */
export const AnyComponentSchema: z.ZodType<any> = z.lazy(() =>
  ComponentCommonSchema.extend({
    component: z.string(),
  })
    .passthrough()
    .refine(comp => comp.component !== 'Surface', {
      message:
        'Component type cannot be "Surface". "Surface" is a top-level protocol container defined in createSurface, not a child component.',
    }),
);
export type AnyComponent = z.infer<typeof AnyComponentSchema>;

/** Zod schema validating a non-empty array of UI component payloads. */
export const ComponentsListSchema = z.array(AnyComponentSchema).min(1);
export type ComponentsList = z.infer<typeof ComponentsListSchema>;

/** Zod schema validating multi-version renderer capabilities maps across protocol versions. */
export const RendererCapabilitiesSchema = z.record(z.string(), z.any());
export type RendererCapabilities = z.infer<typeof RendererCapabilitiesSchema>;
