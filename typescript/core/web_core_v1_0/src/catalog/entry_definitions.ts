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
 * @fileoverview The JSON Schema definitions catalog entries were loaded from.
 */

import type {JsonSchemaObject} from './schema_annotations.js';

/**
 * The JSON Schema definitions of the entries a schema adapter loaded from a
 * catalog document, by entry. Kept out of the entries' own properties, so
 * that a copy of an entry made with object spread, which may change its
 * `schema`, does not carry a definition that no longer describes it.
 */
const definitions = new WeakMap<object, JsonSchemaObject>();

/**
 * Returns the JSON Schema definition a catalog entry was loaded from, or
 * `undefined` for an entry defined in code.
 *
 * @param entry A component or function.
 */
export function loadedDefinition(entry: object): JsonSchemaObject | undefined {
  return definitions.get(entry);
}

/**
 * Records the JSON Schema definition a schema adapter loaded an entry from,
 * so that `toJson` and `validationSchema` write the entry as authored.
 *
 * @param entry The loaded component or function.
 * @param definition Its definition, as written in the catalog document.
 */
export function setLoadedDefinition(entry: object, definition: JsonSchemaObject): void {
  definitions.set(entry, definition);
}
