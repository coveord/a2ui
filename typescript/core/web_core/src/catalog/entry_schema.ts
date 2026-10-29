/*
 * Copyright 2026 Google LLC
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

import type {z} from 'zod/v3';

import {loadedDefinition} from './json_entries.js';
import {parseCatalogSchema} from './schema_loader.js';
import type {CatalogInterface, ComponentApi, FunctionApi} from './types.js';

/** The entries of a catalog reloaded from its own document, by name. */
interface ReloadedEntries {
  readonly components: ReadonlyMap<string, ComponentApi>;
  readonly functions: ReadonlyMap<string, FunctionApi>;
}

const reloaded = new WeakMap<object, ReloadedEntries>();

/**
 * Whether the core reads `entry`'s schema from `catalog`'s document: the
 * catalog can write one, and the entry has a Zod schema of its own rather than
 * one loaded from a document or a plain JSON Schema.
 */
function readsThroughDocument(
  catalog: CatalogInterface<ComponentApi, FunctionApi> | undefined,
  entry: ComponentApi | FunctionApi,
): catalog is CatalogInterface<ComponentApi, FunctionApi> {
  return (
    typeof catalog?.toJson === 'function' &&
    typeof (entry.schema as {safeParse?: unknown} | undefined)?.safeParse === 'function' &&
    !loadedDefinition(entry)
  );
}

/**
 * Returns the entries of `catalog` as `Catalog.fromJson` loads them from the
 * catalog's own `toJson()` document. Computed once per catalog.
 */
function reloadedEntries(catalog: CatalogInterface<ComponentApi, FunctionApi>): ReloadedEntries {
  let entries = reloaded.get(catalog);
  if (!entries) {
    const parsed = parseCatalogSchema(catalog.toJson(), catalog.protocolVersion, catalog.id);
    const byName = <E extends ComponentApi | FunctionApi>(entry: E): [string, E] => [
      entry.name,
      entry,
    ];
    entries = {
      components: new Map(parsed.components.map(byName)),
      functions: new Map(parsed.functions.map(byName)),
    };
    reloaded.set(catalog, entries);
  }
  return entries;
}

/**
 * Returns the Zod schema that the core binds and validates a component
 * against: the one derived from the component's definition in its catalog's
 * document, so that a catalog defined in code behaves as the document it
 * publishes.
 *
 * An entry `Catalog.fromJson` loaded already derives its schema from its
 * definition, and is returned as is. Without a catalog that writes a
 * document, or for a component the document does not define, the component's
 * own schema is returned.
 *
 * @param catalog The catalog the component resolves against.
 * @param component The component.
 */
export function componentSchemaOf(
  catalog: CatalogInterface<ComponentApi, FunctionApi> | undefined,
  component: ComponentApi,
): z.ZodTypeAny {
  if (!readsThroughDocument(catalog, component)) return component.schema;
  return reloadedEntries(catalog).components.get(component.name)?.schema ?? component.schema;
}

/**
 * Parses `value` with the schema derived from an entry's document, then, when
 * it is a different schema, with the entry's own, so that the checks only
 * code expresses, such as a `refine`, still run.
 *
 * @param documentSchema The schema from `componentSchemaOf` or `functionSchemaOf`.
 * @param ownSchema The entry's own schema.
 * @param value The value to parse.
 * @returns The first failure, or the entry's own parse result, whose data
 *   carries the defaults its implementation is typed for.
 */
export function safeParseEntry(
  documentSchema: z.ZodTypeAny,
  ownSchema: z.ZodTypeAny,
  value: unknown,
): z.SafeParseReturnType<unknown, unknown> {
  if (documentSchema !== ownSchema) {
    const result = documentSchema.safeParse(value);
    if (!result.success) return result;
  }
  return ownSchema.safeParse(value);
}

/**
 * Returns the Zod schema that the core validates a function's arguments
 * against, derived from the function's definition in its catalog's document.
 * See {@link componentSchemaOf}.
 *
 * @param catalog The catalog the function resolves against.
 * @param fn The function.
 */
export function functionSchemaOf(
  catalog: CatalogInterface<ComponentApi, FunctionApi> | undefined,
  fn: FunctionApi,
): z.ZodTypeAny {
  if (!readsThroughDocument(catalog, fn)) return fn.schema;
  return reloadedEntries(catalog).functions.get(fn.name)?.schema ?? fn.schema;
}
