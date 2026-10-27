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
 * Core owns this contract so schema packages depend on core, never the
 * reverse. Core holds no adapter of its own: each catalog carries the adapter
 * its schemas were written for (`CatalogOptions.schemaAdapter`), and a
 * `MessageProcessor` receives the one that supplies its protocol schema.
 */
import {A2uiCatalogError} from '../errors.js';
import type {CatalogApi, CatalogInterface, ComponentApi, FunctionApi} from './types.js';
import type {CompleteComponentSchemaMetadata} from './schema_metadata.js';
import type {StandardSchema} from './standard_schema.js';
import type {StandardSchemaResult} from './standard_schema.js';

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
  /** Retains only definitions reachable from the catalog entries that remain. */
  readonly retainedDefs?: (
    defs: Readonly<Record<string, unknown>> | undefined,
    previousEntries: readonly (ComponentApi | FunctionApi)[],
    nextEntries: readonly (ComponentApi | FunctionApi)[],
    extensionFields: Readonly<Record<string, unknown>> | undefined,
  ) => Readonly<Record<string, unknown>> | undefined;
  /**
   * Reads a component schema's structure: its child references, the behavior
   * of its properties and the property names it declares. A catalog calls it
   * at most once per component that lacks complete `schemaMetadata`.
   */
  readonly describeComponent?: (schema: unknown) => CompleteComponentSchemaMetadata;
  /** Extracts statically declared object keys for strict function argument validation. */
  readonly getKnownSchemaKeys?: (schema: unknown) => Set<string> | null;
  /** Returns the validation schema for a supported protocol version. */
  readonly getProtocolSchema?: (version: string) => StandardSchema | undefined;
  /** Validates a generated component envelope field. */
  readonly validateComponentEnvelopeField?: (
    field: 'accessibility' | 'metadata',
    value: unknown,
  ) => StandardSchemaResult<unknown>;
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

/** The parts of a catalog that identify its schema adapter. */
interface SchemaAdapterHolder {
  readonly id: string;
  readonly schemaAdapter?: CatalogSchemaAdapter;
}

/**
 * Returns the catalog's schema adapter after checking it implements an
 * operation.
 *
 * @param catalog The catalog whose schemas the operation reads.
 * @param operation The adapter member the caller is about to use.
 * @returns The catalog's adapter.
 * @throws {A2uiCatalogError} If the catalog has no adapter, or its adapter
 *   lacks the operation.
 */
export function requireSchemaAdapter(
  catalog: SchemaAdapterHolder,
  operation: keyof CatalogSchemaAdapter,
): CatalogSchemaAdapter {
  const adapter = catalog.schemaAdapter;
  if (!adapter?.[operation]) {
    throw new A2uiCatalogError(
      `Catalog '${catalog.id}' needs a schema adapter that implements '${operation}'. ` +
        'Pass one in CatalogOptions.schemaAdapter, such as zodCatalogSchemaAdapter from @a2ui/schema-zod.',
    );
  }
  return adapter;
}
