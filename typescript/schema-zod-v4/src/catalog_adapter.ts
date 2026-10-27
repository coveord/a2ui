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

import {validateStandardSchema, type CatalogSchemaAdapter} from '@a2ui/web_core_v1_0';
import {z} from 'zod';

import {describeZod4Component, getZod4KnownSchemaKeys} from './resolution/describe_component.js';
import {AgentToRendererMessageSchema} from './schema/agent-to-renderer.js';
import {
  AccessibilityAttributesSchema,
  CommonSchemas,
  ComponentCommonSchema,
} from './types/common-types.js';

/**
 * The descriptions the common type mirrors carry on their `REF:` pointers, by
 * definition name.
 */
const COMMON_TYPE_REF_DESCRIPTIONS: ReadonlyMap<string, string> = new Map(
  Object.values(CommonSchemas).flatMap(mirror => {
    const description = (mirror as {description?: unknown}).description;
    if (typeof description !== 'string' || !description.startsWith('REF:')) return [];
    const content = description.substring(4);
    const pipeIndex = content.indexOf('|');
    if (pipeIndex === -1) return [];
    const name = content.substring(0, pipeIndex).split('/').pop()!;
    return [[name, content.substring(pipeIndex + 1)] as [string, string]];
  }),
);

/**
 * Converts a Zod 4 schema to JSON Schema with `z.toJSONSchema`, describing the
 * values a payload may carry (`io: 'input'`). Nested schemas are inlined, and
 * descriptions such as the `REF:` pointers of the common types are kept for
 * core to turn into references.
 */
function zod4ToJsonSchema(schema: unknown): Record<string, unknown> {
  if (!(schema instanceof z.ZodType)) return {type: 'object', properties: {}};
  return z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    reused: 'inline',
    cycles: 'ref',
  }) as Record<string, unknown>;
}

/** Name of the Zod 4 catalog schema adapter, as reported in diagnostics. */
export const ZOD4_SCHEMA_ADAPTER_NAME = '@a2ui/schema-zod-v4';

/**
 * Zod 4 implementation of the catalog schema adapter.
 *
 * Describes components, converts schemas to JSON Schema for `toJson`,
 * `validationSchema` and inline catalogs, and supplies the v1.0 protocol
 * schema, component envelope validation and function argument names.
 * Loading catalog documents (`Catalog.fromJson`) is not implemented yet.
 */
export const zod4CatalogSchemaAdapter: CatalogSchemaAdapter = {
  name: ZOD4_SCHEMA_ADAPTER_NAME,
  toJsonSchema: zod4ToJsonSchema,
  commonTypeRefDescriptions: COMMON_TYPE_REF_DESCRIPTIONS,
  describeComponent: describeZod4Component,
  getKnownSchemaKeys: getZod4KnownSchemaKeys,
  getProtocolSchema: version =>
    version === 'v1.0' || version === '1.0' ? AgentToRendererMessageSchema : undefined,
  validateComponentEnvelopeField: (field, value) =>
    validateStandardSchema(
      field === 'accessibility'
        ? AccessibilityAttributesSchema.optional()
        : ComponentCommonSchema.shape.metadata,
      value,
    ),
};
