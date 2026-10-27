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

import {zodToJsonSchema} from 'zod-to-json-schema';

import {
  Catalog,
  linkLoadedEntry,
  validateStandardSchema,
  type CatalogApi,
  type CatalogSchemaAdapter,
} from '@a2ui/web_core_v1_0';

import {exclusiveUnionOverride} from './catalog/exclusive_union.js';
import {reproduceZodDefinitions} from './catalog/reproduce_definitions.js';
import {parseCatalogSchema} from './catalog/schema_loader.js';
import {describeZodComponent} from './resolution/describe_component.js';
import {getZodKnownSchemaKeys} from './resolution/known_schema_keys.js';
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
 * Zod implementation of the catalog schema adapter.
 *
 * Pass it to the catalogs whose schemas are Zod schemas, through
 * `CatalogOptions.schemaAdapter`, and to `MessageProcessorOptions.schemaAdapter`
 * when no catalog supplies it. Importing this package registers nothing.
 */
export const zodCatalogSchemaAdapter: CatalogSchemaAdapter = {
  name: '@a2ui/schema-zod',
  parseCatalog: ({json, protocolVersion, catalogId}) => {
    const {
      id,
      protocolVersion: resolvedVersion,
      components,
      functions,
      ...options
    } = parseCatalogSchema(json, protocolVersion, catalogId);
    return new Catalog(id, resolvedVersion, components, functions, {
      ...options,
      schemaAdapter: zodCatalogSchemaAdapter,
    });
  },
  toJsonSchema: schema =>
    schema && typeof schema === 'object' && 'safeParse' in schema
      ? (zodToJsonSchema(schema as never, {
          target: 'jsonSchema2019-09',
          $refStrategy: 'none',
          override: exclusiveUnionOverride,
        }) as Record<string, unknown>)
      : {type: 'object', properties: {}},
  reproduceDefinitions: reproduceZodDefinitions,
  commonTypeRefDescriptions: COMMON_TYPE_REF_DESCRIPTIONS,
  linkEntry: linkLoadedEntry,
  describeComponent: describeZodComponent,
  getKnownSchemaKeys: getZodKnownSchemaKeys,
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

/**
 * Loads a catalog document whose definitions compile to Zod schemas.
 *
 * Shorthand for `Catalog.fromJson` with `zodCatalogSchemaAdapter`.
 *
 * @param json Raw catalog document or client capabilities inline catalog.
 * @param protocolVersion Protocol version that overrides the one the document declares.
 * @param catalogId Catalog ID that overrides the one the document declares.
 * @returns A schema-only catalog that carries `zodCatalogSchemaAdapter`.
 */
export function parseZodCatalog(
  json: Record<string, unknown>,
  protocolVersion?: string,
  catalogId?: string,
): CatalogApi {
  return Catalog.fromJson(json, {
    schemaAdapter: zodCatalogSchemaAdapter,
    protocolVersion,
    catalogId,
  });
}
