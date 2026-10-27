/*
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview A catalog's document, assembled from its model.
 *
 * Every entry is written from the definition it was loaded from, from the
 * definition its model reproduces (`CatalogSchemaAdapter.reproduceDefinitions`),
 * or from the JSON Schema its schema adapter converts its schema to
 * (`CatalogSchemaAdapter.toJsonSchema`). The rest is plain JSON.
 */

import {isAtLeastVersion, toCanonicalVersion} from '../common/semver.js';
import {loadedDefinition} from './entry_definitions.js';
import {deepCopyJson, deepFreeze} from './json.js';
import {DEFAULT_COMMON_TYPES_URI, schemaRequiresArgs} from './json_schema_rules.js';
import type {JsonSchemaObject} from './schema_annotations.js';
import {requireSchemaAdapter} from './schema_adapter.js';
import type {CatalogInterface, ComponentApi, FunctionApi} from './types.js';

/** Names of the union definitions a catalog computes from its entries. */
export const UNION_DEF_NAMES: ReadonlySet<string> = new Set(['anyComponent', 'anyFunction']);

/** Top-level keys under which a catalog document may declare its theme. */
export const THEME_DOCUMENT_KEYS = ['theme', 'themeSchema', 'styles'] as const;

/** A catalog, as the document model reads it. */
type SerializableCatalog = CatalogInterface<ComponentApi, FunctionApi>;

type JsonObject = Record<string, unknown>;

/**
 * The catalog document definitions a catalog's models reproduce exactly, as
 * `CatalogSchemaAdapter.reproduceDefinitions` returns them.
 */
export interface ReproducedDefinitions {
  /** The definition of each component whose model reproduces one, by name. */
  readonly components: ReadonlyMap<string, JsonSchemaObject>;
  /**
   * The named definitions the models compute, by name, such as the mixins
   * components compose. A definition the catalog's `defs` already declare is
   * kept as declared.
   */
  readonly defs: ReadonlyMap<string, JsonSchemaObject>;
  /** The theme definition, when the theme model reproduces one. */
  readonly theme?: JsonSchemaObject;
  /**
   * Returns the definition of a function whose model reproduces one, given
   * the document's definitions.
   */
  functionDefinition(
    name: string,
    fn: FunctionApi,
    defs: Readonly<JsonObject>,
  ): JsonSchemaObject | undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Adds to `found` the name of every definition a local `#/$defs/<name>`
 * reference in `node` reaches: the first segment of its pointer.
 */
function collectLocalDefNames(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectLocalDefNames(item, found);
    return;
  }
  if (!isObject(node)) return;
  const ref = node.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    found.add(ref.slice('#/$defs/'.length).split('/')[0].replace(/~1/g, '/').replace(/~0/g, '~'));
  }
  for (const value of Object.values(node)) collectLocalDefNames(value, found);
}

/**
 * Returns the names of the definitions `roots` reach through local
 * references, directly or through other definitions of `defs`. Names `defs`
 * does not define are included.
 */
function reachableDefs(roots: unknown[], defs: Readonly<JsonObject>): Set<string> {
  const reached = new Set<string>();
  const pending = new Set<string>();
  for (const root of roots) collectLocalDefNames(root, pending);
  while (pending.size > 0) {
    const [name] = pending;
    pending.delete(name);
    if (reached.has(name)) continue;
    reached.add(name);
    if (name in defs) collectLocalDefNames(defs[name], pending);
  }
  return reached;
}

/**
 * Returns the definition of an entry `Catalog.fromJson` loaded, if
 * `toJson` and `validationSchema` can use it in a catalog with `defs`, or
 * `undefined` when they should build the entry from its model instead.
 *
 * A definition is used when every local `#/$defs/<name>` reference it reaches
 * resolves against `defs` (or names a union the catalog computes). A loaded
 * entry reused in a catalog without the definitions it references falls back
 * to its schema.
 *
 * @param entry A component or function.
 * @param defs The definitions of the catalog that holds the entry.
 */
export function entryDefinition(
  entry: ComponentApi | FunctionApi,
  defs: Readonly<JsonObject> | undefined,
): JsonSchemaObject | undefined {
  const definition = loadedDefinition(entry);
  if (!isObject(definition)) return undefined;
  const available = defs ?? {};
  for (const name of reachableDefs([definition], available)) {
    if (!(name in available) && !UNION_DEF_NAMES.has(name)) return undefined;
  }
  return definition;
}

/**
 * Whether a function definition is an item of a `functions` list (with its
 * `name` and `parameters`) rather than an entry of a `functions` map.
 */
export function isFunctionListItem(definition: JsonSchemaObject): boolean {
  return typeof definition['name'] === 'string' && !('properties' in definition);
}

/**
 * Returns the definitions of `defs` that a catalog with the entries `after`
 * keeps, given that it is derived from a catalog with the entries `before`.
 *
 * A definition that only entries of `before` missing from `after` reached is
 * dropped. One that no entry of `before` reached, such as a theme, is kept,
 * and so is everything it reaches.
 *
 * @param defs The `defs` of the catalog derived from.
 * @param before The entries of the catalog derived from.
 * @param after The entries of the derived catalog.
 * @param extensionFields The document's other top-level fields, whose
 *     references keep definitions too.
 * @returns `defs` itself when nothing is dropped.
 */
export function retainedDefs(
  defs: Readonly<JsonObject> | undefined,
  before: ReadonlyArray<ComponentApi | FunctionApi>,
  after: ReadonlyArray<ComponentApi | FunctionApi>,
  extensionFields?: Readonly<JsonObject>,
): Readonly<JsonObject> | undefined {
  if (!defs) return defs;
  const definitions = (entries: ReadonlyArray<ComponentApi | FunctionApi>) =>
    entries.map(entry => entryDefinition(entry, defs)).filter(d => d !== undefined);
  const reachedBefore = reachableDefs(definitions(before), defs);
  const unconditional = Object.keys(defs).filter(name => !reachedBefore.has(name));
  const reachedAfter = reachableDefs(
    [...definitions(after), extensionFields, ...unconditional.map(name => defs[name])],
    defs,
  );
  const kept: JsonObject = {};
  let dropped = false;
  for (const [name, def] of Object.entries(defs)) {
    if (!reachedBefore.has(name) || reachedAfter.has(name)) {
      kept[name] = def;
    } else {
      dropped = true;
    }
  }
  return dropped ? kept : defs;
}

/**
 * Rewrites `REF:<ref>|<description>` markers left by the loader and by
 * code-defined schemas into `$ref` nodes, keeping common types references
 * external (`<commonTypesUri>#/$defs/<name>`).
 *
 * @param node Schema node to rewrite in place.
 * @param localDefs Names of authored definitions that stay local references.
 * @param commonTypesUri The URI of the common types document.
 */
function rewriteRefMarkers(
  node: unknown,
  localDefs: ReadonlySet<string>,
  commonTypesUri: string = DEFAULT_COMMON_TYPES_URI,
): void {
  if (Array.isArray(node)) {
    for (const item of node) rewriteRefMarkers(item, localDefs, commonTypesUri);
    return;
  }
  if (!isObject(node)) return;

  if (typeof node.description === 'string' && node.description.startsWith('REF:')) {
    const content = node.description.substring(4);
    const pipeIndex = content.indexOf('|');
    const ref = pipeIndex === -1 ? content : content.substring(0, pipeIndex);
    const desc = pipeIndex === -1 ? '' : content.substring(pipeIndex + 1);
    const savedDefault = node.default;
    for (const key of Object.keys(node)) delete node[key];
    // The first segment names the definition; a deeper pointer into it, such as
    // `/oneOf/0`, is kept whole.
    const pointer = ref.split(/#\/(?:\$defs|definitions)\//)[1];
    const defName = pointer?.split('/')[0];
    node.$ref =
      defName === undefined
        ? ref
        : ref.startsWith('#') && localDefs.has(defName)
          ? ref
          : `${commonTypesUri}#/$defs/${pointer}`;
    if (savedDefault !== undefined) node.default = savedDefault;
    if (desc) node.description = desc;
    return;
  }

  for (const key of ['additionalProperties', 'unevaluatedProperties']) {
    const value = node[key];
    if (isObject(value) && Object.keys(value).length === 0) node[key] = true;
  }
  delete node.$schema;
  for (const value of Object.values(node)) rewriteRefMarkers(value, localDefs, commonTypesUri);
}

/**
 * Converts a schema into an unbundled JSON Schema object with the catalog's
 * schema adapter.
 */
function toUnbundledJson(
  catalog: SerializableCatalog,
  schema: unknown,
  localDefs: ReadonlySet<string>,
  commonTypesUri: string = DEFAULT_COMMON_TYPES_URI,
): JsonObject {
  const json = requireSchemaAdapter(catalog, 'toJsonSchema').toJsonSchema!(schema);
  delete json.definitions;
  delete json.$defs;
  rewriteRefMarkers(json, localDefs, commonTypesUri);
  return json;
}

/**
 * Moves an object schema's `additionalProperties` to `unevaluatedProperties`,
 * defaulting to `false`.
 */
function closeObjectSchema(json: JsonObject): void {
  if (json.type !== 'object') return;
  const extra = json.unevaluatedProperties ?? json.additionalProperties;
  delete json.additionalProperties;
  json.unevaluatedProperties =
    typeof extra === 'boolean' || isObject(extra) ? extra : (false as unknown);
}

/**
 * Serializes a component from its model, as an authored catalog entry.
 */
function serializeComponentModel(
  catalog: SerializableCatalog,
  name: string,
  comp: ComponentApi,
  localDefs: ReadonlySet<string>,
  commonTypesUri: string = DEFAULT_COMMON_TYPES_URI,
): JsonObject {
  const json = toUnbundledJson(catalog, comp.schema, localDefs, commonTypesUri);
  const {
    component: _component,
    id: _id,
    ...props
  } = (isObject(json.properties) ? json.properties : {}) as JsonObject;
  const required = Array.isArray(json.required)
    ? (json.required as string[]).filter(r => r !== 'component' && r !== 'id')
    : [];
  const extra = json.unevaluatedProperties ?? json.additionalProperties;
  const result: JsonObject = {
    type: 'object',
    properties: {component: {const: name}, ...props},
    required: ['component', ...required],
    unevaluatedProperties: typeof extra === 'boolean' || isObject(extra) ? extra : false,
  };
  if (comp.allowedParents && comp.allowedParents.length > 0) {
    result.allowedParents = [...comp.allowedParents];
  }
  if (comp.allowedChildren && comp.allowedChildren.length > 0) {
    result.allowedChildren = [...comp.allowedChildren];
  }
  return result;
}

/**
 * Serializes a function from its model, in the call shape of the catalog's
 * protocol version (`@call` from v1.0, `call` before), or as a list item.
 */
function serializeFunctionModel(
  catalog: SerializableCatalog,
  name: string,
  fn: FunctionApi,
  localDefs: ReadonlySet<string>,
  isAtLeastV10: boolean,
  asListItem: boolean,
  commonTypesUri: string = DEFAULT_COMMON_TYPES_URI,
  defs?: Readonly<JsonObject>,
): JsonObject {
  const args = toUnbundledJson(catalog, fn.schema, localDefs, commonTypesUri);
  if (asListItem) {
    return {
      name,
      ...(fn.description ? {description: fn.description} : {}),
      returnType: fn.returnType,
      parameters: args,
      ...(fn.allowedCallers ? {allowedCallers: fn.allowedCallers} : {}),
      ...(fn.requiresUserActivation !== undefined
        ? {requiresUserActivation: fn.requiresUserActivation}
        : {}),
    };
  }
  closeObjectSchema(args);
  // A call to a function without required parameters may omit `args`, as in
  // the validation schema.
  const argsRequired = schemaRequiresArgs(args, defs);
  const result: JsonObject = {type: 'object'};
  if (fn.description) result.description = fn.description;
  if (isAtLeastV10) {
    result.returnType = fn.returnType;
    if (fn.allowedCallers) result.allowedCallers = fn.allowedCallers;
    if (fn.requiresUserActivation !== undefined) {
      result.requiresUserActivation = fn.requiresUserActivation;
    }
    result.properties = {'@call': {const: name}, args};
    result.required = argsRequired ? ['@call', 'args'] : ['@call'];
    return result;
  }
  if (fn.allowedCallers) result.allowedCallers = fn.allowedCallers;
  if (fn.requiresUserActivation !== undefined) {
    result.requiresUserActivation = fn.requiresUserActivation;
  }
  result.properties = {call: {const: name}, args, returnType: {const: fn.returnType}};
  result.required = argsRequired ? ['call', 'args'] : ['call'];
  result.unevaluatedProperties = false;
  return result;
}

/**
 * Serializes a theme schema into a `$defs.theme` object schema.
 */
function serializeThemeModel(
  catalog: SerializableCatalog,
  theme: unknown,
  localDefs: ReadonlySet<string>,
  commonTypesUri: string = DEFAULT_COMMON_TYPES_URI,
): JsonObject {
  const json = toUnbundledJson(catalog, theme, localDefs, commonTypesUri);
  return {
    type: 'object',
    properties: isObject(json.properties) ? json.properties : {},
    ...(Array.isArray(json.required) && json.required.length > 0 ? {required: json.required} : {}),
    additionalProperties:
      json.additionalProperties !== undefined ? json.additionalProperties : true,
  };
}

/**
 * A union that no value matches. JSON Schema requires `oneOf` to list at least
 * one schema, so an empty union cannot be written as `{oneOf: []}`.
 */
const EMPTY_UNION: Readonly<JsonObject> = {not: {}};

export function buildComponentUnion(names: Iterable<string>): JsonObject {
  const oneOf = [...names].map(name => ({$ref: `#/components/${escapePointer(name)}`}));
  if (oneOf.length === 0) return {...EMPTY_UNION};
  return {oneOf, discriminator: {propertyName: 'component'}};
}

export function buildFunctionUnion(names: Iterable<string>): JsonObject {
  const oneOf = [...names].map(name => ({$ref: `#/functions/${escapePointer(name)}`}));
  return oneOf.length === 0 ? {...EMPTY_UNION} : {oneOf};
}

function escapePointer(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * A catalog's document in model form: the definition of each entry, where it
 * has one, and the document's definitions and other top-level fields.
 */
export interface CatalogDocumentModel {
  /**
   * The definition of each component: the one `fromJson` loaded, or the one
   * computed from a specification model. `undefined` for a component that
   * `toJson` and `validationSchema` generate from its schema.
   */
  readonly components: ReadonlyMap<string, JsonSchemaObject | undefined>;
  /** The definition of each function, as for `components`. */
  readonly functions: ReadonlyMap<string, JsonSchemaObject | undefined>;
  /**
   * The document's named definitions, without the computed unions: the
   * catalog's `defs`, and the definitions computed from its models (the
   * mixins of its components and its `defModels`).
   */
  readonly defs: Readonly<JsonObject>;
  /**
   * The document's other top-level fields: the catalog's `extensionFields`
   * and a theme written under `styles`.
   */
  readonly extensionFields: Readonly<JsonObject>;
}

const documentModels = new WeakMap<object, CatalogDocumentModel>();

/**
 * Returns the document model of a catalog, computed from the catalog's
 * entries, fields and models, and memoized per catalog. It is deeply frozen.
 *
 * @param catalog The catalog.
 */
export function catalogDocumentModel(catalog: SerializableCatalog): CatalogDocumentModel {
  let model = documentModels.get(catalog);
  if (!model) {
    model = buildDocumentModel(catalog);
    documentModels.set(catalog, model);
  }
  return model;
}

function buildDocumentModel(catalog: SerializableCatalog): CatalogDocumentModel {
  if (catalog.document) return documentModelOf(catalog, catalog.document);

  const reproduced = catalog.schemaAdapter?.reproduceDefinitions?.(catalog);
  const defs: JsonObject = {...catalog.defs};
  for (const [defName, definition] of reproduced?.defs ?? []) {
    if (!(defName in defs)) defs[defName] = definition;
  }
  const extensionFields: JsonObject = {...catalog.extensionFields};
  if (catalog.themeLocation === 'styles' && reproduced?.theme && !hasAuthoredTheme(catalog)) {
    const theme = reproduced.theme;
    extensionFields['styles'] = isObject(theme['properties']) ? theme['properties'] : {};
  }

  const components = new Map<string, JsonSchemaObject | undefined>();
  for (const [name, comp] of catalog.components) {
    const shaped = loadedDefinition(comp) ? undefined : reproduced?.components.get(name);
    components.set(name, shaped ? deepFreeze(shaped) : entryDefinition(comp, defs));
  }
  const functions = new Map<string, JsonSchemaObject | undefined>();
  for (const [name, fn] of catalog.functions) {
    const loaded = entryDefinition(fn, defs);
    const shaped =
      loaded || loadedDefinition(fn) ? undefined : reproduced?.functionDefinition(name, fn, defs);
    functions.set(name, loaded ?? (shaped ? deepFreeze(shaped) : undefined));
  }
  return {
    components,
    functions,
    defs: deepFreeze(defs),
    extensionFields: deepFreeze(extensionFields),
  };
}

/**
 * Returns the document model of a catalog that carries its published
 * document: each entry's definition, the definitions and the theme, as the
 * document writes them.
 */
function documentModelOf(
  catalog: SerializableCatalog,
  document: Readonly<JsonObject>,
): CatalogDocumentModel {
  const defs: JsonObject = {...(isObject(document['$defs']) ? document['$defs'] : {})};
  for (const name of UNION_DEF_NAMES) delete defs[name];
  const extensionFields: JsonObject = {};
  for (const key of THEME_DOCUMENT_KEYS) {
    if (document[key] !== undefined) extensionFields[key] = document[key];
  }
  const written = isObject(document['components']) ? document['components'] : {};
  const components = new Map<string, JsonSchemaObject | undefined>();
  for (const name of catalog.components.keys()) {
    components.set(name, isObject(written[name]) ? written[name] : undefined);
  }
  const functionsWritten = document['functions'];
  const functionDefs = new Map<string, JsonObject>();
  if (Array.isArray(functionsWritten)) {
    for (const item of functionsWritten) {
      if (isObject(item) && typeof item['name'] === 'string') functionDefs.set(item['name'], item);
    }
  } else if (isObject(functionsWritten)) {
    for (const [name, definition] of Object.entries(functionsWritten)) {
      if (isObject(definition)) functionDefs.set(name, definition);
    }
  }
  const functions = new Map<string, JsonSchemaObject | undefined>();
  for (const name of catalog.functions.keys()) functions.set(name, functionDefs.get(name));
  return {
    components,
    functions,
    defs: deepFreeze(defs),
    extensionFields: deepFreeze(extensionFields),
  };
}

/** Whether the catalog's `defs` or top-level fields declare a theme. */
function hasAuthoredTheme(catalog: {
  readonly defs?: Readonly<JsonObject>;
  readonly extensionFields?: Readonly<JsonObject>;
}): boolean {
  return (
    isObject(catalog.defs?.['theme']) ||
    THEME_DOCUMENT_KEYS.some(key => catalog.extensionFields?.[key] !== undefined)
  );
}

/**
 * Serializes a catalog into an unbundled catalog document, assembled from the
 * catalog's model. See `Catalog.toJson` for the full contract.
 *
 * @param catalog The catalog to serialize.
 * @returns A fresh catalog document that shares no objects with the catalog.
 */
export function serializeCatalogDocument(catalog: SerializableCatalog): JsonObject {
  const isAtLeastV10 = isAtLeastVersion(catalog.protocolVersion, '1.0');
  const model = catalogDocumentModel(catalog);
  const localDefs = new Set(Object.keys(model.defs));

  const doc: JsonObject = {};
  if (catalog.schemaUri !== undefined) doc.$schema = catalog.schemaUri;
  if (catalog.schemaId !== undefined) doc.$id = catalog.schemaId;
  if (typeof catalog.declaredProtocolVersion === 'string') {
    doc.protocolVersion = catalog.declaredProtocolVersion;
  } else if (catalog.declaredProtocolVersion === undefined) {
    doc.protocolVersion = toCanonicalVersion(catalog.protocolVersion) ?? catalog.protocolVersion;
  }
  if (catalog.title !== undefined) doc.title = catalog.title;
  if (catalog.description !== undefined) doc.description = catalog.description;
  if (catalog.declaresCatalogId !== false) doc.catalogId = catalog.id;
  if (catalog.instructions !== undefined) doc.instructions = catalog.instructions;

  // Components, unless the document has no `components` key and the catalog
  // has none.
  const commonTypesUri = catalog.commonTypesUri ?? DEFAULT_COMMON_TYPES_URI;
  if (catalog.declaresComponents !== false || catalog.components.size > 0) {
    const components: JsonObject = {};
    for (const [name, comp] of catalog.components) {
      const definition = model.components.get(name);
      components[name] = definition
        ? deepCopyJson(definition)
        : serializeComponentModel(catalog, name, comp, localDefs, commonTypesUri);
    }
    doc.components = components;
  }

  // Functions, in the document's layout. System functions such as `@index`
  // belong to the protocol rather than the catalog, so a code-defined one that
  // a catalog registers for evaluation is not part of the document.
  const functionEntries = [...catalog.functions].filter(
    ([name, fn]) => loadedDefinition(fn) !== undefined || !name.startsWith('@'),
  );
  const functionNames = functionEntries.map(([name]) => name);
  if (catalog.functionsLayout === 'list') {
    doc.functions = functionEntries.map(([name, fn]) => {
      const definition = model.functions.get(name);
      return definition && isFunctionListItem(definition)
        ? deepCopyJson(definition)
        : serializeFunctionModel(
            catalog,
            name,
            fn,
            localDefs,
            isAtLeastV10,
            true,
            commonTypesUri,
            model.defs,
          );
    });
  } else if (catalog.functionsLayout === 'map' || functionEntries.length > 0) {
    const functions: JsonObject = {};
    for (const [name, fn] of functionEntries) {
      const definition = model.functions.get(name);
      functions[name] =
        definition && !isFunctionListItem(definition)
          ? deepCopyJson(definition)
          : serializeFunctionModel(
              catalog,
              name,
              fn,
              localDefs,
              isAtLeastV10,
              false,
              commonTypesUri,
              model.defs,
            );
    }
    doc.functions = functions;
  }

  // Any other top-level keys of the document, such as a v0.8 `styles` theme.
  for (const [key, value] of Object.entries(model.extensionFields)) {
    if (!(key in doc)) doc[key] = deepCopyJson(value);
  }

  // Definitions: the catalog's own and those computed from its models, a
  // theme generated from its schema for a catalog defined in code, and the computed
  // unions.
  const defs: JsonObject = deepCopyJson({...model.defs});
  const themeLocation = catalog.themeLocation ?? (isAtLeastV10 ? undefined : 'defs');
  if (themeLocation === 'defs' && catalog.themeSchema && !hasAuthoredTheme(model)) {
    defs.theme =
      catalog.schemaAdapter?.reproduceDefinitions?.(catalog).theme ??
      serializeThemeModel(catalog, catalog.themeSchema, localDefs, commonTypesUri);
  }
  const unions = catalog.unions ?? {
    anyComponent: isAtLeastV10 || catalog.components.size > 0,
    anyFunction: isAtLeastV10 || functionNames.length > 0,
  };
  if (unions.anyComponent && !('anyComponent' in defs)) {
    const savedAnyFunction = defs.anyFunction;
    if (savedAnyFunction !== undefined) delete defs.anyFunction;
    defs.anyComponent = buildComponentUnion(catalog.components.keys());
    if (savedAnyFunction !== undefined) defs.anyFunction = savedAnyFunction;
  }
  if (unions.anyFunction && !('anyFunction' in defs)) {
    defs.anyFunction = buildFunctionUnion(functionNames);
  }
  if (catalog.defs !== undefined || Object.keys(defs).length > 0) {
    doc.$defs = defs;
  }
  return doc;
}
