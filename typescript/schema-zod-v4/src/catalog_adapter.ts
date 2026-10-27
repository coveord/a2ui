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

import {describeZod4Component, getZod4KnownSchemaKeys} from './resolution/describe_component.js';
import {AgentToRendererMessageSchema} from './schema/agent-to-renderer.js';
import {AccessibilityAttributesSchema, ComponentCommonSchema} from './types/common-types.js';

/** Name of the Zod 4 catalog schema adapter, as reported in diagnostics. */
export const ZOD4_SCHEMA_ADAPTER_NAME = '@a2ui/schema-zod-v4';

/**
 * Zod 4 implementation of the catalog schema adapter.
 *
 * Covers what rendering needs: describing components, the v1.0 protocol
 * schema, component envelope fields and function argument names. Loading
 * catalog documents (`Catalog.fromJson`) and producing JSON Schema
 * (`toJson`, `validationSchema`, inline catalogs) are not implemented yet.
 */
export const zod4CatalogSchemaAdapter: CatalogSchemaAdapter = {
  name: ZOD4_SCHEMA_ADAPTER_NAME,
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
