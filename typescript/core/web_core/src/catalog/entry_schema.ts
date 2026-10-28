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

import {z} from 'zod/v3';

import {
  validateA2uiSchema,
  zod3SchemaOf,
  type A2uiSchemaResult,
  type A2uiValidator,
  type EntrySchema,
} from './a2ui_schema.js';
import {loadedDefinition} from './json_entries.js';
import {DEFAULT_PROTOCOL_VERSION, parseCatalogSchema} from './schema_loader.js';
import {serializeCatalogDocument} from './schema_serializer.js';
import type {CatalogInterface, ComponentApi, FunctionApi} from './types.js';

/** The entries and theme of a catalog reloaded from its own document. */
interface ReloadedEntries {
  readonly components: ReadonlyMap<string, ComponentApi>;
  readonly functions: ReadonlyMap<string, FunctionApi>;
  readonly themeSchema?: z.ZodTypeAny;
}

const reloaded = new WeakMap<object, ReloadedEntries>();

/**
 * Whether the core reads `entry`'s schema from `catalog`'s document: the
 * catalog can write one, and the entry was not itself loaded from one.
 */
function readsThroughDocument(
  catalog: CatalogInterface<ComponentApi, FunctionApi> | undefined,
  entry: ComponentApi | FunctionApi,
): catalog is CatalogInterface<ComponentApi, FunctionApi> {
  return typeof catalog?.toJson === 'function' && !loadedDefinition(entry);
}

/**
 * Returns the entries and theme of `catalog` as `Catalog.fromJson` loads them
 * from the catalog's own `toJson()` document. Computed once per catalog.
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
      themeSchema: parsed.themeSchema,
    };
    reloaded.set(catalog, entries);
  }
  return entries;
}

/** The schemas derived from schemas read without a catalog, by schema and kind. */
const standalone = {
  component: new WeakMap<object, z.ZodTypeAny>(),
  function: new WeakMap<object, z.ZodTypeAny>(),
};

/**
 * Returns the Zod schema the core reads an entry with when no catalog document
 * is at hand. See {@link zodSchemaFor}.
 */
function standaloneSchemaOf(
  entry: ComponentApi | FunctionApi,
  kind: 'component' | 'function',
): A2uiValidator {
  return zodSchemaFor(entry.schema, kind);
}

/**
 * Returns the Zod schema the core reads an `EntrySchema` with when no catalog
 * document is at hand: a Zod 3 schema as is, or the one derived from a
 * document that holds an entry with that schema alone, at the default
 * protocol version.
 *
 * @param schema A component's or function's schema.
 * @param kind Whether the schema is a component's properties or a function's
 *   arguments.
 */
export function zodSchemaFor(
  schema: EntrySchema,
  kind: 'component' | 'function' = 'component',
): z.ZodTypeAny {
  const zod3 = zod3SchemaOf(schema);
  if (zod3) return zod3;
  let derivedSchema = standalone[kind].get(schema);
  if (!derivedSchema) {
    const id = 'urn:a2ui:standalone';
    const entry = {name: 'Entry', returnType: 'any', schema};
    const components = new Map<string, ComponentApi>();
    const functions = new Map<string, FunctionApi>();
    if (kind === 'component') components.set(entry.name, entry);
    else functions.set(entry.name, entry);
    const document = serializeCatalogDocument({
      id,
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      components,
      functions,
    });
    const parsed = parseCatalogSchema(document, DEFAULT_PROTOCOL_VERSION, id);
    const derived = kind === 'component' ? parsed.components[0] : parsed.functions[0];
    derivedSchema = derived.schema as z.ZodTypeAny;
    standalone[kind].set(schema, derivedSchema);
  }
  return derivedSchema;
}

/**
 * Returns the schema that the core binds and validates a component against:
 * the one compiled from the component's definition in its catalog's
 * document, so that a catalog defined in code behaves as the document it
 * publishes, whatever library wrote the component's schema. The core reads it
 * only as a Standard Schema validator, and inspects it through its
 * definition (see `inspectionSchemaOf`).
 *
 * An entry `Catalog.fromJson` loaded already derives its schema from its
 * definition, and is returned as is. Without a catalog that writes a
 * document, a Zod 3 schema is returned as is, and any other schema is read
 * from a document that holds the component alone.
 *
 * @param catalog The catalog the component resolves against.
 * @param component The component.
 */
export function componentSchemaOf(
  catalog: CatalogInterface<ComponentApi, FunctionApi> | undefined,
  component: ComponentApi,
): A2uiValidator {
  if (loadedDefinition(component)) return component.schema as A2uiValidator;
  if (!readsThroughDocument(catalog, component)) return standaloneSchemaOf(component, 'component');
  return (
    (reloadedEntries(catalog).components.get(component.name)?.schema as A2uiValidator) ??
    standaloneSchemaOf(component, 'component')
  );
}

/**
 * Returns the schema that the core validates a function's arguments against,
 * compiled from the function's definition in its catalog's document.
 * See {@link componentSchemaOf}.
 *
 * @param catalog The catalog the function resolves against.
 * @param fn The function.
 */
export function functionSchemaOf(
  catalog: CatalogInterface<ComponentApi, FunctionApi> | undefined,
  fn: FunctionApi,
): A2uiValidator {
  if (loadedDefinition(fn)) return fn.schema as A2uiValidator;
  if (!readsThroughDocument(catalog, fn)) return standaloneSchemaOf(fn, 'function');
  return (
    (reloadedEntries(catalog).functions.get(fn.name)?.schema as A2uiValidator) ??
    standaloneSchemaOf(fn, 'function')
  );
}

/**
 * Returns the schema that the core validates a catalog's theme against: the
 * catalog's own Zod 3 theme schema, or the one compiled from the theme its
 * document writes, for a theme written with another library or as JSON
 * Schema.
 *
 * @param catalog The catalog.
 */
export function themeSchemaOf(
  catalog: CatalogInterface<ComponentApi, FunctionApi>,
): A2uiValidator | undefined {
  if (!catalog.themeSchema) return undefined;
  const zod3 = zod3SchemaOf(catalog.themeSchema);
  if (zod3) return zod3;
  return typeof catalog.toJson === 'function' ? reloadedEntries(catalog).themeSchema : undefined;
}

/**
 * Validates `value` with the schema compiled from an entry's document, then
 * with the entry's own schema, so that the checks only the entry's library
 * expresses, such as a `refine`, still run. Both are read as synchronous
 * Standard Schema validators.
 *
 * A Zod 3 or library own schema validates `value` itself, and a JSON Schema
 * object adds nothing to the document's check.
 *
 * @param documentSchema The schema from `componentSchemaOf`,
 *   `functionSchemaOf` or `themeSchemaOf`.
 * @param ownSchema The entry's own schema.
 * @param value The value to validate.
 * @returns The first failure's issues, or the own schema's value, which
 *   carries the defaults the entry's implementation is typed for.
 * @throws {A2uiCatalogError} If either schema validates asynchronously.
 */
export function validateEntry(
  documentSchema: A2uiValidator,
  ownSchema: EntrySchema,
  value: unknown,
): A2uiSchemaResult<unknown> {
  const own: A2uiValidator | undefined =
    zod3SchemaOf(ownSchema) ??
    ('~standard' in ownSchema ? (ownSchema as A2uiValidator) : undefined);
  if (documentSchema !== own) {
    const result = validateA2uiSchema(documentSchema, value);
    if (result.issues || !own) return result;
  }
  return validateA2uiSchema(own!, value);
}
