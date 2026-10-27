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
  AgentToRendererMessageSchema,
  registerCatalogSchemaAdapter,
  type CatalogSchemaAdapter,
} from '@a2ui/web_core_v1_0';

import {
  hasCrossDocumentRefs,
  inlinePeerAndLocalRefs,
  linkEntry,
  parseCatalogSchema,
} from './catalog/schema_loader.js';
import {cleanSchemaNode, generateValidationSchema} from './catalog/schema_generator.js';
import {exclusiveUnionOverride} from './catalog/exclusive_union.js';
import {retainedDefs, serializeCatalogDocument} from './catalog/schema_serializer.js';
import {
  analyzeChildRefSchema,
  buildComponentRefMap,
  extractRefDefName,
  isChildListSchema,
  isChildOrChildListSchema,
  isChildSchema,
} from './catalog/reference-map.js';
import {getZodKnownSchemaKeys} from './resolution/known_schema_keys.js';
import {extractRefFields} from './resolution/ref-fields.js';
import {getZodSchemaBehavior} from './resolution/schema_behavior.js';

/** Zod implementation of the optional catalog compiler adapter. */
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
    return new Catalog(id, resolvedVersion, components, functions, options);
  },
  serializeCatalog: catalog => serializeCatalogDocument(catalog as never),
  generateValidationSchema: catalog => generateValidationSchema(catalog as never),
  schemaToJson: (schema, options) =>
    zodToJsonSchema(schema as never, {
      target: 'jsonSchema2019-09',
      override: exclusiveUnionOverride,
      ...options,
    }) as Record<string, unknown>,
  linkEntry,
  hasCrossDocumentRefs,
  retainedDefs,
  buildComponentRefMap: (catalog, options) =>
    buildComponentRefMap(catalog as Catalog<any, any>, options),
  analyzeChildRefSchema,
  isChildSchema,
  isChildListSchema,
  isChildOrChildListSchema,
  extractRefFields: schema => extractRefFields(schema as never),
  extractRefDefName,
  getSchemaBehavior: getZodSchemaBehavior,
  getKnownSchemaKeys: getZodKnownSchemaKeys,
  getProtocolSchema: version =>
    version === 'v1.0' || version === '1.0' ? AgentToRendererMessageSchema : undefined,
  cleanSchemaNode,
};

/** Installs the Zod catalog compiler for the current runtime. */
export function installZodCatalogSchemaAdapter(): void {
  registerCatalogSchemaAdapter(zodCatalogSchemaAdapter);
}

/** Links JSON Schema references in catalog entries for Zod-backed catalogs. */
export {inlinePeerAndLocalRefs};

// Catalog packages import schema-zod for Zod models, so install its compiler
// alongside those models without requiring a core-to-adapter dependency.
installZodCatalogSchemaAdapter();
