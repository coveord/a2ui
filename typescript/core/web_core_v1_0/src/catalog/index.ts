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
/**
 * Catalog interfaces and component/function registration utilities.
 */

export * from './types.js';
export * from './function_invoker.js';
export * from './standard_schema.js';
export * from './schema_metadata.js';
export {type CatalogParseRequest, type CatalogSchemaAdapter} from './schema_adapter.js';
export {
  buildComponentUnion,
  buildFunctionUnion,
  THEME_DOCUMENT_KEYS,
  UNION_DEF_NAMES,
  type ReproducedDefinitions,
} from './catalog_document.js';
export {
  documentKey,
  inlinePeerAndLocalRefs,
  isComponentEnvelopeField,
  isShorthandParameterMap,
  PeerScope,
  resolveJsonPointer,
  resolvePeerTarget,
  resolveRefDocument,
  splitRef,
  throwUnresolvableRef,
  type PeerCatalogSource,
  type RefTarget,
} from './catalog_refs.js';
export {
  DEFAULT_PROTOCOL_VERSION,
  functionArgsSchema,
  JsonComponentApi,
  JsonFunctionApi,
  linkLoadedEntry,
  loadCatalogDocument,
  runtimeComponentSchema,
  runtimeFunctionArgsSchema,
  runtimeThemeSchema,
  type CatalogEntryConverters,
  type CatalogLoadContext,
  type LoadedCatalogDocument,
  type RuntimeComponentSchema,
} from './catalog_loading.js';
export {loadedDefinition, setLoadedDefinition} from './entry_definitions.js';
export {
  forSubsetConverters,
  withoutConditionals,
  withoutFormatAssertions,
  withoutNegations,
  withoutUnevaluatedProperties,
  withoutUnicodePropertyPatterns,
  withRequiredBranchesExpanded,
  withRefsUnderDefs,
} from './json_schema_compat.js';
export {
  behaviorForJsonSchema,
  componentMetadataFromJson,
  refDefinitionName,
} from './json_component_metadata.js';
export {canonicalJsonStringify, deepCopyJson, deepFreeze, frozenJson} from './json.js';
export {
  DEFAULT_COMMON_TYPES_URI,
  schemaRequiresArgs,
  standardDefsForVersion,
} from './json_schema_rules.js';
export {cleanSchemaNode, type GenerateValidationSchemaOptions} from './validation_schema.js';
export {
  type ChildRefAnalysis,
  type ChildRefAnalysisOptions,
  type ComponentChildRefs,
  type ComponentRefMap,
} from './component_references.js';
export {
  getSchemaAnnotation,
  setSchemaAnnotation,
  type JsonSchemaObject,
  type SpecAnnotation,
  type SpecMixin,
} from './schema_annotations.js';
