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
import type {CatalogApi} from './types.js';

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
