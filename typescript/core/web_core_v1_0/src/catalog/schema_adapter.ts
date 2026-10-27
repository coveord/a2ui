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
import type {ReproducedDefinitions} from './catalog_document.js';
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
  /**
   * Converts one schema to JSON Schema, inlining nested definitions. A
   * description `REF:<ref>|<text>` marks a node that stands for the definition
   * `<ref>`, such as `common_types.json#/$defs/DynamicString`; core turns it
   * into a `$ref`. `toJson`, `validationSchema` and inline catalogs use it for
   * entries defined in code.
   */
  readonly toJsonSchema?: (schema: unknown) => Record<string, unknown>;
  /**
   * Returns the catalog document definitions that the catalog's models
   * reproduce exactly, such as Zod 3 models annotated with `spec()`. Core
   * writes them as they are instead of converting the models.
   */
  readonly reproduceDefinitions?: (
    catalog: CatalogInterface<ComponentApi, FunctionApi>,
  ) => ReproducedDefinitions;
  /**
   * The descriptions the adapter's own common type schemas carry on their
   * `REF:` pointers, by definition name. A reference that carries exactly
   * this text took it from the shared schema rather than from its author, so
   * the validation schema gives it the definition's own description.
   */
  readonly commonTypeRefDescriptions?: ReadonlyMap<string, string>;
  /** Links an entry to peer catalog definitions. */
  readonly linkEntry?: <Entry extends ComponentApi | FunctionApi>(
    entry: Entry,
    peers: readonly CatalogInterface<ComponentApi, FunctionApi>[],
  ) => Entry;
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
