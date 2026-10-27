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

/**
 * A schema-library adapter that augments the catalog model.
 *
 * Core owns this registration point so schema packages depend on core, never
 * the reverse. Later extraction steps add catalog parsing and serialization
 * operations to this contract as their Zod implementations move here.
 */
import type {CatalogApi, CatalogInterface, ComponentApi, FunctionApi} from './types.js';
import type {SchemaBehavior} from './schema_metadata.js';
import type {StandardSchema} from './standard_schema.js';
import type {
  ChildRefAnalysis,
  ChildRefAnalysisOptions,
  ComponentRefMap,
  RefFields,
} from './component_references.js';

/** Input accepted by a catalog schema adapter's parser. */
export interface CatalogParseRequest {
  /** Raw catalog document or inline catalog payload. */
  readonly json: Record<string, unknown>;
  /** Protocol version that overrides the document's declared version. */
  readonly protocolVersion?: string;
  /** Catalog ID that overrides the document's declared ID. */
  readonly catalogId?: string;
}

export interface CatalogSchemaAdapter {
  /** Stable package identifier used in diagnostics. */
  readonly name: string;
  /** Parses a catalog document into core catalog models when supported. */
  readonly parseCatalog?: (request: CatalogParseRequest) => CatalogApi;
  /** Serializes a catalog into its authored document form. */
  readonly serializeCatalog?: (
    catalog: CatalogInterface<ComponentApi, FunctionApi>,
  ) => Record<string, unknown>;
  /** Generates a self-contained JSON Schema used to validate catalog payloads. */
  readonly generateValidationSchema?: (
    catalog: CatalogInterface<ComponentApi, FunctionApi>,
  ) => Record<string, unknown>;
  /** Links an entry to peer catalog definitions. */
  readonly linkEntry?: <Entry extends ComponentApi | FunctionApi>(
    entry: Entry,
    peers: readonly CatalogInterface<ComponentApi, FunctionApi>[],
  ) => Entry;
  /** Detects whether a catalog document references an external catalog. */
  readonly hasCrossDocumentRefs?: (document: unknown) => boolean;
  /** Retains only definitions reachable from the catalog entries that remain. */
  readonly retainedDefs?: (
    defs: Readonly<Record<string, unknown>> | undefined,
    previousEntries: readonly (ComponentApi | FunctionApi)[],
    nextEntries: readonly (ComponentApi | FunctionApi)[],
    extensionFields: Readonly<Record<string, unknown>> | undefined,
  ) => Readonly<Record<string, unknown>> | undefined;
  /** Builds the topology reference map for a catalog. */
  readonly buildComponentRefMap?: (
    catalog: CatalogInterface<ComponentApi, FunctionApi>,
    options: ChildRefAnalysisOptions,
  ) => ComponentRefMap;
  /** Inspects a schema for child-reference behavior. */
  readonly analyzeChildRefSchema?: (
    schema: unknown,
    options: ChildRefAnalysisOptions,
  ) => ChildRefAnalysis;
  /** Decides whether a schema represents a single child reference. */
  readonly isChildSchema?: (schema: unknown, options: ChildRefAnalysisOptions) => boolean;
  /** Decides whether a schema represents a child list or dynamic template. */
  readonly isChildListSchema?: (schema: unknown, options: ChildRefAnalysisOptions) => boolean;
  /** Decides whether a schema represents any child reference form. */
  readonly isChildOrChildListSchema?: (
    schema: unknown,
    options: ChildRefAnalysisOptions,
  ) => boolean;
  /** Extracts component child-reference fields from a schema implementation. */
  readonly extractRefFields?: (schema: unknown) => RefFields;
  /** Extracts a referenced definition name from a schema-library marker. */
  readonly extractRefDefName?: (ref: string) => string;
  /** Classifies component-property runtime behavior from a schema implementation. */
  readonly getSchemaBehavior?: (schema: unknown) => SchemaBehavior;
  /** Extracts statically declared object keys for strict function argument validation. */
  readonly getKnownSchemaKeys?: (schema: unknown) => Set<string> | null;
  /** Returns the validation schema for a supported protocol version. */
  readonly getProtocolSchema?: (version: string) => StandardSchema | undefined;
  /** Converts a schema implementation to JSON Schema for legacy inline catalogs. */
  readonly schemaToJson?: (
    schema: unknown,
    options?: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>;
  /** Removes JSON Schema keywords unsupported by generated renderer capabilities. */
  readonly cleanSchemaNode?: (
    schema: unknown,
    visited?: Set<unknown>,
    options?: {readonly stripAdditionalProperties?: boolean},
  ) => unknown;
}

let registeredAdapter: CatalogSchemaAdapter | undefined;

/**
 * Registers the schema adapter available to this runtime.
 *
 * Registering the same adapter repeatedly is harmless. Registering a distinct
 * adapter fails explicitly because catalog schema operations must have one
 * deterministic implementation per runtime.
 */
export function registerCatalogSchemaAdapter(adapter: CatalogSchemaAdapter): void {
  if (registeredAdapter && registeredAdapter !== adapter) {
    throw new Error(`A catalog schema adapter is already registered: ${registeredAdapter.name}.`);
  }
  registeredAdapter = adapter;
}

/** Returns the schema adapter installed by an optional schema package, if any. */
export function getCatalogSchemaAdapter(): CatalogSchemaAdapter | undefined {
  return registeredAdapter;
}
