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
 * @fileoverview Loading a catalog document into catalog entries.
 *
 * Reading a catalog document is plain JSON: its ID and version, the entries
 * its unions permit, each function's arguments and metadata, its theme, and
 * its document-level fields. A schema adapter supplies only the conversion of
 * each definition to a schema of its library (`CatalogEntryConverters`).
 */

import {isAtLeastVersion} from '../common/semver.js';
import {assertUax31Identifier} from '../common/uax31.js';
import {V10_RUNTIME_COMMON_TYPE_DEFS} from '../runtime_common_types.js';
import {buildComponentUnion, buildFunctionUnion} from './catalog_document.js';
import {
  isComponentEnvelopeField,
  isShorthandParameterMap,
  resolveJsonPointer,
  type PeerCatalogSource,
} from './catalog_refs.js';
import {loadedDefinition, setLoadedDefinition} from './entry_definitions.js';
import {canonicalJsonStringify, deepCopyJson, deepFreeze} from './json.js';
import {componentMetadataFromJson} from './json_component_metadata.js';
import type {JsonSchemaObject} from './schema_annotations.js';
import type {CompleteComponentSchemaMetadata, ComponentSchemaMetadata} from './schema_metadata.js';
import type {StandardSchema} from './standard_schema.js';
import type {CatalogDocumentOptions, CatalogInterface, ComponentApi, FunctionApi} from './types.js';
import {generateValidationSchema} from './validation_schema.js';

type JsonObject = Record<string, unknown>;

/**
 * Protocol version assumed for a catalog document that does not declare one.
 *
 * Catalog documents only began carrying `protocolVersion` at v1.0, so a
 * document that omits it predates that field.
 */
export const DEFAULT_PROTOCOL_VERSION = '1.0';

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The document an entry is converted from, and the peers its references reach. */
export interface CatalogLoadContext {
  /** The frozen catalog document. */
  readonly document: Readonly<JsonObject>;
  /** The catalog's ID. */
  readonly catalogId: string;
  /** The protocol version the catalog is loaded for. */
  readonly protocolVersion: string;
  /** The peer catalogs cross-catalog references resolve against. */
  readonly peers: readonly PeerCatalogSource[];
  /** The entries loaded from the document. */
  readonly components: readonly ComponentApi[];
  /** The functions loaded from the document. */
  readonly functions: readonly FunctionApi[];
}

/**
 * Converts the definitions of a catalog document to schemas of one schema
 * library. Each conversion runs on first use of the entry's `schema`.
 */
export interface CatalogEntryConverters {
  /** Converts a component's definition to the schema of its properties. */
  component(
    name: string,
    definition: JsonSchemaObject,
    context: CatalogLoadContext,
  ): StandardSchema;
  /**
   * Converts a function's argument schema, or `undefined` when its definition
   * declares none, to the schema of its arguments.
   */
  functionArgs(
    name: string,
    args: JsonSchemaObject | undefined,
    context: CatalogLoadContext,
  ): StandardSchema;
  /** Converts a theme schema; `closed` tells whether its author closed it. */
  theme(schema: JsonSchemaObject, closed: boolean, context: CatalogLoadContext): StandardSchema;
  /**
   * Returns the runtime metadata of a component, or `undefined` to let the
   * catalog's adapter describe the converted schema.
   */
  componentMetadata?(
    name: string,
    definition: JsonSchemaObject,
    context: CatalogLoadContext,
  ): ComponentSchemaMetadata | undefined;
}

/** A catalog document loaded into the fields of a `Catalog`. */
export interface LoadedCatalogDocument extends CatalogDocumentOptions {
  readonly id: string;
  readonly protocolVersion: string;
  readonly components: ComponentApi[];
  readonly functions: FunctionApi[];
  readonly themeSchema?: StandardSchema;
}

/**
 * Defines lazily computed, enumerable getters on `target`, so that an object
 * spread of it copies their values.
 */
function defineViews(target: object, views: Record<string, () => unknown>): void {
  for (const [key, compute] of Object.entries(views)) {
    let computed = false;
    let value: unknown;
    Object.defineProperty(target, key, {
      enumerable: true,
      get() {
        if (!computed) {
          value = compute();
          computed = true;
        }
        return value;
      },
    });
  }
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item: unknown): item is string => typeof item === 'string')
    : undefined;
}

/**
 * A component loaded from a catalog document.
 *
 * Its model is its JSON Schema definition as the document writes it
 * (`jsonSchema`), deeply frozen. Every other field is a view of it: the
 * `schema` is converted from it on first use and cached, `allowedParents` and
 * `allowedChildren` are read from it, and so may `schemaMetadata` be.
 * `Catalog.toJson` writes the definition, so a loaded catalog serializes as
 * written.
 *
 * A copy made with object spread is an ordinary component defined in code: it
 * keeps the views' values but not the definition, and is serialized from its
 * `schema`.
 */
export class JsonComponentApi {
  /** Name of the component as it appears in A2UI JSON. */
  readonly name: string;
  /** Schema of the component's properties, converted from `jsonSchema`. */
  declare readonly schema: StandardSchema<any, any>;
  /** Runtime metadata read from `jsonSchema`, when the loader reads it. */
  declare readonly schemaMetadata?: ComponentSchemaMetadata;
  /** Allowed parent component types, as the definition declares them. */
  declare readonly allowedParents?: string[];
  /** Allowed child component types, as the definition declares them. */
  declare readonly allowedChildren?: string[];

  /**
   * @param name The component's name.
   * @param jsonSchema The component's definition, deeply frozen.
   * @param deriveSchema Converts the definition to the component's schema.
   * @param deriveMetadata Reads the component's runtime metadata.
   */
  constructor(
    name: string,
    jsonSchema: JsonSchemaObject,
    deriveSchema: (jsonSchema: JsonSchemaObject) => StandardSchema<any, any>,
    deriveMetadata?: (jsonSchema: JsonSchemaObject) => ComponentSchemaMetadata | undefined,
  ) {
    this.name = name;
    setLoadedDefinition(this, jsonSchema);
    defineViews(this, {
      schema: () => deriveSchema(jsonSchema),
      ...(deriveMetadata ? {schemaMetadata: () => deriveMetadata(jsonSchema)} : {}),
      allowedParents: () => stringList(jsonSchema['allowedParents']),
      allowedChildren: () => stringList(jsonSchema['allowedChildren']),
    });
    Object.freeze(this);
  }

  /** The component's JSON Schema definition, as its catalog document writes it. */
  get jsonSchema(): JsonSchemaObject {
    return loadedDefinition(this)!;
  }
}

/**
 * A function loaded from a catalog document.
 *
 * Its model is its JSON Schema definition as the document writes it
 * (`jsonSchema`): an entry of a `functions` map (the schema of a call to the
 * function) or an item of a `functions` list (with its `name` and
 * `parameters`), deeply frozen. Every other field is a view of it: the
 * `schema` of its arguments is converted from it on first use and cached, and
 * `returnType`, `description`, `allowedCallers` and `requiresUserActivation`
 * are read from it.
 *
 * A copy made with object spread is an ordinary function defined in code: it
 * keeps the views' values but not the definition.
 */
export class JsonFunctionApi {
  /** Name of the function as it appears in A2UI JSON payloads. */
  readonly name: string;
  /** Schema of the function's arguments, converted from `jsonSchema`. */
  declare readonly schema: StandardSchema<any, any>;
  /** Return type identifier, as the definition declares it, or `'any'`. */
  declare readonly returnType: string;
  /** The definition's description. */
  declare readonly description?: string;
  /** Allowed caller contexts, as the definition declares them. */
  declare readonly allowedCallers?: 'rendererOnly' | 'agentOnly' | 'rendererOrAgent';
  /** Whether the definition requires user activation. */
  declare readonly requiresUserActivation?: boolean;

  /**
   * @param name The function's name.
   * @param jsonSchema The function's definition, deeply frozen.
   * @param deriveSchema Converts the definition to the schema of the
   *     function's arguments.
   */
  constructor(
    name: string,
    jsonSchema: JsonSchemaObject,
    deriveSchema: (jsonSchema: JsonSchemaObject) => StandardSchema<any, any>,
  ) {
    this.name = name;
    setLoadedDefinition(this, jsonSchema);
    // A map entry may write the call metadata as constant properties of the
    // call schema, before v1.0 lifted it to keywords.
    const props = isObject(jsonSchema['properties']) ? jsonSchema['properties'] : undefined;
    const constant = (key: string): unknown => {
      const property = props?.[key];
      return isObject(property) ? property['const'] : undefined;
    };
    defineViews(this, {
      schema: () => deriveSchema(jsonSchema),
      returnType: () => {
        const declared = jsonSchema['returnType'] ?? constant('returnType');
        return typeof declared === 'string' ? declared : 'any';
      },
      description: () =>
        typeof jsonSchema['description'] === 'string' ? jsonSchema['description'] : undefined,
      allowedCallers: () => jsonSchema['allowedCallers'] ?? constant('allowedCallers'),
      requiresUserActivation: () =>
        jsonSchema['requiresUserActivation'] ?? constant('requiresUserActivation'),
    });
    Object.freeze(this);
  }

  /** The function's JSON Schema definition, as its catalog document writes it. */
  get jsonSchema(): JsonSchemaObject {
    return loadedDefinition(this)!;
  }
}

/**
 * Builds a loaded entry linked to the given peer catalogs, by entry: each
 * loaded entry, and each entry rebuilt from one, maps to the function that
 * built it.
 */
const entryBuilders = new WeakMap<
  object,
  (peers: readonly PeerCatalogSource[]) => ComponentApi | FunctionApi
>();

/**
 * Returns a copy of a catalog entry whose schema resolves cross-catalog
 * `$ref`s against `peers`. A loaded entry is rebuilt from the same definition;
 * any other entry is returned as is. Schema adapters use it as
 * `CatalogSchemaAdapter.linkEntry`.
 *
 * @param entry A component or function.
 * @param peers The peer catalogs, in matching order.
 */
export function linkLoadedEntry<E extends ComponentApi | FunctionApi>(
  entry: E,
  peers: readonly PeerCatalogSource[],
): E {
  const build = entryBuilders.get(entry);
  return build ? (build(peers) as E) : entry;
}

/**
 * Returns the declared parameter names of a function's argument schema.
 */
function functionParameterNames(schema: unknown, rootDoc?: JsonObject): string[] {
  if (!isObject(schema)) return [];
  const names: string[] = [];
  const visited = new Set<string>();

  const extractProperties = (node: unknown): void => {
    if (!isObject(node)) return;
    if (typeof node['$ref'] === 'string' && rootDoc && node['$ref'].startsWith('#/')) {
      if (!visited.has(node['$ref'])) {
        visited.add(node['$ref']);
        const target = resolveJsonPointer(rootDoc, node['$ref']);
        if (target) extractProperties(target);
      }
    }
    if (isObject(node['properties'])) names.push(...Object.keys(node['properties']));
    if (Array.isArray(node['allOf'])) {
      for (const member of node['allOf']) extractProperties(member);
    }
  };

  if (
    isObject(schema['properties']) ||
    Array.isArray(schema['allOf']) ||
    typeof schema['$ref'] === 'string'
  ) {
    extractProperties(schema);
    return names;
  }
  return isShorthandParameterMap(schema) ? Object.keys(schema) : [];
}

/**
 * Returns the argument schema a function's map-layout definition declares:
 * its `args` property, `args` or `parameters` keyword, or, for a definition
 * that is not a call schema, the definition itself.
 *
 * @param definition The function's definition.
 */
export function functionArgsSchema(definition: Readonly<JsonObject>): JsonObject | undefined {
  const props = isObject(definition['properties']) ? definition['properties'] : undefined;
  let argsSchema = props?.['args'] ?? definition['args'] ?? definition['parameters'];
  if (!argsSchema && props && !('call' in props) && !('@call' in props) && !('function' in props)) {
    argsSchema = definition;
  } else if (isShorthandParameterMap(argsSchema)) {
    argsSchema = {
      type: 'object',
      properties: argsSchema,
      required: definition['required'],
      additionalProperties: definition['additionalProperties'],
    };
  }
  return isObject(argsSchema) ? argsSchema : undefined;
}

/**
 * Returns the names a union's `oneOf` permits, or `undefined` when it lists
 * none.
 *
 * @param oneOf The `oneOf` of `anyComponent` or `anyFunction`.
 * @param prefix `#/components/` or `#/functions/`.
 */
function extractPermittedNames(oneOf: unknown, prefix: string): Set<string> | undefined {
  if (!Array.isArray(oneOf)) return undefined;
  const permitted = new Set<string>();
  for (const item of oneOf) {
    const ref = isObject(item) ? item['$ref'] : undefined;
    if (typeof ref === 'string' && ref.startsWith(prefix)) {
      permitted.add(
        ref
          .slice(prefix.length)
          .replace(/~([01])/g, (_: string, p1: string) => (p1 === '1' ? '/' : '~')),
      );
    }
  }
  return permitted;
}

/** Top-level keys of a catalog document that `CatalogDocumentOptions` models. */
const DOCUMENT_STRING_FIELDS = {
  '$schema': 'schemaUri',
  '$id': 'schemaId',
  'title': 'title',
  'description': 'description',
  'instructions': 'instructions',
} as const;

/** Top-level keys of a catalog document that `Catalog` models besides the string fields. */
const DOCUMENT_STRUCTURE_FIELDS = new Set(['protocolVersion', 'catalogId', 'components']);

/** Whether `actual` is the union a catalog computes, ignoring object key order. */
function isComputedUnion(actual: unknown, computed: JsonObject): boolean {
  return canonicalJsonStringify(actual) === canonicalJsonStringify(computed);
}

/**
 * Reads the document-level fields of a catalog document into the model fields
 * `Catalog` keeps.
 *
 * The `anyComponent` and `anyFunction` unions become flags when they list
 * exactly the loaded entries, in order, as `toJson` computes them; a union of
 * any other form stays in `defs` as written. Keys the model has no field for
 * are kept in `extensionFields`.
 *
 * @param document The frozen catalog document.
 * @param components The components loaded from it.
 * @param functions The functions loaded from it.
 */
function readDocumentFields(
  document: Readonly<JsonObject>,
  components: readonly ComponentApi[],
  functions: readonly FunctionApi[],
): CatalogDocumentOptions {
  const fields: CatalogDocumentOptions = {};
  const extensionFields: JsonObject = {};
  for (const [key, value] of Object.entries(document)) {
    if (key in DOCUMENT_STRING_FIELDS && typeof value === 'string') {
      fields[DOCUMENT_STRING_FIELDS[key as keyof typeof DOCUMENT_STRING_FIELDS]] = value;
    } else if (key === 'protocolVersion' && typeof value === 'string') {
      fields.declaredProtocolVersion = value;
    } else if (key === 'functions' && (Array.isArray(value) || isObject(value))) {
      fields.functionsLayout = Array.isArray(value) ? 'list' : 'map';
    } else if (key === '$defs' && isObject(value)) {
      const anyComponent = isComputedUnion(
        value['anyComponent'],
        buildComponentUnion(components.map(c => c.name)),
      );
      const anyFunction = isComputedUnion(
        value['anyFunction'],
        buildFunctionUnion(functions.map(f => f.name)),
      );
      fields.unions = {anyComponent, anyFunction};
      const defs: JsonObject = {};
      for (const [name, def] of Object.entries(value)) {
        if ((name === 'anyComponent' && anyComponent) || (name === 'anyFunction' && anyFunction)) {
          continue;
        }
        defs[name] = def;
      }
      fields.defs = Object.freeze(defs);
    } else if (!DOCUMENT_STRUCTURE_FIELDS.has(key) || (key === 'components' && !isObject(value))) {
      extensionFields[key] = value;
    }
  }
  fields.declaredProtocolVersion ??= null;
  fields.declaresCatalogId = typeof document['catalogId'] === 'string';
  fields.declaresComponents = isObject(document['components']);
  fields.unions ??= {anyComponent: false, anyFunction: false};
  if (Object.keys(extensionFields).length > 0) {
    fields.extensionFields = Object.freeze(extensionFields);
  }
  return fields;
}

/**
 * Loads a catalog document into the fields of a `Catalog`, converting each
 * definition with `converters` on first use.
 *
 * Entries the document's `anyComponent` or `anyFunction` union leaves out are
 * not loaded. From v1.0, entry, property and argument names must be UAX #31
 * identifiers.
 *
 * @param input Raw catalog document or capabilities inline catalog. It is
 *   copied first and never referenced afterwards.
 * @param options `protocolVersion` takes precedence over the version the
 *   document declares and selects the version's loading rules; `catalogId`
 *   replaces the ID the document declares.
 * @param converters The schema library's conversions.
 * @returns The fields of the catalog to construct.
 * @throws {Error} If the catalog ID is missing or not a string.
 * @throws {A2uiCatalogError} If a v1.0 identifier is not a UAX #31 identifier.
 */
export function loadCatalogDocument(
  input: Record<string, unknown>,
  options: {readonly protocolVersion?: string; readonly catalogId?: string},
  converters: CatalogEntryConverters,
): LoadedCatalogDocument {
  // Everything the catalog keeps, including what the schemas close over,
  // comes from this copy, so mutating the input afterwards cannot change it.
  const document = deepCopyJson(input);
  const catalogId = options.catalogId ?? document['catalogId'] ?? document['$id'] ?? document['id'];
  if (!catalogId || typeof catalogId !== 'string') {
    throw new Error("Catalog ID must be specified via catalog metadata ('catalogId' or '$id').");
  }
  const protocolVersion =
    options.protocolVersion ??
    (typeof document['protocolVersion'] === 'string' ? document['protocolVersion'] : undefined) ??
    DEFAULT_PROTOCOL_VERSION;
  const atLeastV10 = isAtLeastVersion(protocolVersion, '1.0');
  const defs = isObject(document['$defs']) ? document['$defs'] : undefined;

  const components: ComponentApi[] = [];
  const functions: FunctionApi[] = [];
  const contextFor = (peers: readonly PeerCatalogSource[]): CatalogLoadContext => ({
    document,
    catalogId,
    protocolVersion,
    peers,
    components,
    functions,
  });

  // Components the document's anyComponent union permits.
  const permittedComponents = extractPermittedNames(
    isObject(defs?.['anyComponent']) ? defs['anyComponent']['oneOf'] : undefined,
    '#/components/',
  );
  const componentsMap = isObject(document['components']) ? document['components'] : {};
  for (const [name, raw] of Object.entries(componentsMap)) {
    const definition = isObject(raw) ? raw : {};
    if (atLeastV10) {
      assertUax31Identifier(name, `component identifier: '${name}'`);
      if (isObject(definition['properties'])) {
        for (const propName of Object.keys(definition['properties'])) {
          assertUax31Identifier(
            propName,
            `property identifier: '${propName}' in component '${name}'`,
          );
        }
      }
    }
    if (permittedComponents && !permittedComponents.has(name)) continue;
    const build = (peers: readonly PeerCatalogSource[]): ComponentApi => {
      const context = contextFor(peers);
      const entry = new JsonComponentApi(
        name,
        definition,
        d => converters.component(name, d, context),
        converters.componentMetadata && (d => converters.componentMetadata!(name, d, context)),
      );
      entryBuilders.set(entry, build);
      return entry as unknown as ComponentApi;
    };
    components.push(build([]));
  }

  // Functions the document's anyFunction union permits.
  const permittedFunctions = extractPermittedNames(
    isObject(defs?.['anyFunction']) ? defs['anyFunction']['oneOf'] : undefined,
    '#/functions/',
  );
  const assertFunctionIdentifiers = (name: string, paramNames: string[]): void => {
    if (!atLeastV10) return;
    assertUax31Identifier(name, `function identifier: '${name}'`);
    for (const argName of paramNames) {
      assertUax31Identifier(argName, `argument identifier: '${argName}' in function '${name}'`);
    }
  };
  const addFunction = (
    name: string,
    definition: JsonObject,
    args: (definition: JsonObject) => JsonObject | undefined,
  ): void => {
    const build = (peers: readonly PeerCatalogSource[]): FunctionApi => {
      const context = contextFor(peers);
      const entry = new JsonFunctionApi(name, definition, d =>
        converters.functionArgs(name, args(d), context),
      );
      entryBuilders.set(entry, build);
      return entry as unknown as FunctionApi;
    };
    functions.push(build([]));
  };
  const rawFunctions = document['functions'];
  if (Array.isArray(rawFunctions)) {
    for (const fn of rawFunctions) {
      if (!isObject(fn) || typeof fn['name'] !== 'string') continue;
      const name = fn['name'];
      assertFunctionIdentifiers(name, functionParameterNames(fn['parameters'], document));
      if (permittedFunctions && !permittedFunctions.has(name)) continue;
      addFunction(name, fn, d => (isObject(d['parameters']) ? d['parameters'] : undefined));
    }
  } else if (isObject(rawFunctions)) {
    for (const [name, raw] of Object.entries(rawFunctions)) {
      const definition = isObject(raw) ? raw : {};
      assertFunctionIdentifiers(
        name,
        functionParameterNames(functionArgsSchema(definition), document),
      );
      if (permittedFunctions && !permittedFunctions.has(name)) continue;
      if (!isObject(raw)) continue;
      addFunction(name, definition, functionArgsSchema);
    }
  }

  // The theme, under one of the document's theme keys or `$defs.theme`.
  const rawTheme =
    document['theme'] ?? document['themeSchema'] ?? document['styles'] ?? defs?.['theme'];
  let themeSchema: StandardSchema | undefined;
  if (isObject(rawTheme)) {
    const theme =
      'properties' in rawTheme || 'allOf' in rawTheme || rawTheme['type'] === 'object'
        ? rawTheme
        : {type: 'object', properties: rawTheme};
    // Unlike a component, a theme is open unless its author closes it, as JSON
    // Schema itself defaults.
    const closed =
      theme['additionalProperties'] === false || theme['unevaluatedProperties'] === false;
    themeSchema = converters.theme(theme, closed, contextFor([]));
  }

  // The copy is frozen: the entries' definitions and the document fields
  // refer into it.
  deepFreeze(document);

  return {
    id: catalogId,
    protocolVersion,
    components,
    functions,
    ...(themeSchema ? {themeSchema} : {}),
    ...readDocumentFields(document, components, functions),
  };
}

/**
 * The bundled runtime schemas of a loaded document's entries, by document, then
 * by peer list, then by entry.
 */
const runtimeBundles = new WeakMap<object, WeakMap<object, Map<string, JsonObject>>>();

/**
 * Returns the self-contained runtime schema of one entry of a loaded catalog:
 * the validation schema of a catalog holding that entry alone, built from the
 * document and bundled with the runtime common types
 * (`V10_RUNTIME_COMMON_TYPE_DEFS`) instead of the specification's. An entry
 * whose references cannot resolve fails alone, as it would on any conversion.
 */
function runtimeBundle(
  context: CatalogLoadContext,
  entry: {readonly component?: string; readonly function?: string},
): JsonObject {
  let byPeers = runtimeBundles.get(context.document);
  if (!byPeers) {
    byPeers = new WeakMap();
    runtimeBundles.set(context.document, byPeers);
  }
  let byEntry = byPeers.get(context.peers);
  if (!byEntry) {
    byEntry = new Map();
    byPeers.set(context.peers, byEntry);
  }
  const key = entry.component !== undefined ? `c:${entry.component}` : `f:${entry.function ?? ''}`;
  let bundle = byEntry.get(key);
  if (!bundle) {
    const document = context.document;
    const theme = entry.component === undefined && entry.function === undefined;
    const catalog = {
      id: context.catalogId,
      protocolVersion: context.protocolVersion,
      components: new Map(
        context.components.filter(c => c.name === entry.component).map(c => [c.name, c]),
      ),
      functions: new Map(
        context.functions.filter(f => f.name === entry.function).map(f => [f.name, f]),
      ),
      // Only the presence of a theme is read; its schema comes from the document.
      themeSchema: theme ? {} : undefined,
      document,
      peerCatalogs: context.peers,
    } as unknown as CatalogInterface<ComponentApi, FunctionApi>;
    bundle = generateValidationSchema(catalog, {standardDefs: V10_RUNTIME_COMMON_TYPE_DEFS});
    byEntry.set(key, bundle);
  }
  return bundle;
}

/** The parts of a bundle that a self-contained entry schema carries along. */
function bundleSections(bundle: JsonObject): JsonObject {
  return {
    ...(isObject(bundle['$defs']) ? {$defs: bundle['$defs']} : {}),
    ...(isObject(bundle['components']) ? {components: bundle['components']} : {}),
    ...(isObject(bundle['functions']) ? {functions: bundle['functions']} : {}),
  };
}

/** Whether a closure keyword leaves an object open. */
function isOpen(closure: unknown): boolean {
  return closure === true || isObject(closure);
}

/** A loaded component's properties schema, as a renderer validates it. */
export interface RuntimeComponentSchema {
  /** A self-contained JSON Schema of the component's properties. */
  readonly schema: JsonObject;
  /** The component's runtime metadata, read from its definition. */
  readonly metadata: CompleteComponentSchemaMetadata;
}

/**
 * Returns the self-contained runtime schema of a loaded component's properties
 * (without the `id`, `component` and `catalogId` envelope), and its runtime
 * metadata. The properties are closed unless the component's author opened
 * them. Common types are the runtime ones (`V10_RUNTIME_COMMON_TYPE_DEFS`), and
 * references are local, so a converter that reads JSON Schema needs no
 * catalog knowledge.
 *
 * @param name The component's name.
 * @param context The loaded document.
 */
export function runtimeComponentSchema(
  name: string,
  context: CatalogLoadContext,
): RuntimeComponentSchema {
  const bundle = runtimeBundle(context, {component: name});
  const components = isObject(bundle['components']) ? bundle['components'] : {};
  const component = isObject(components[name]) ? components[name] : {};
  const allProperties = isObject(component['properties']) ? component['properties'] : {};
  const properties = Object.fromEntries(
    Object.entries(allProperties).filter(([key]) => !isComponentEnvelopeField(key)),
  );
  const required = (Array.isArray(component['required']) ? component['required'] : []).filter(
    key => typeof key === 'string' && !isComponentEnvelopeField(key),
  );
  const definition = loadedDefinition(
    (context.components.find(c => c.name === name) ?? {}) as object,
  );
  const open = isOpen(
    definition?.['unevaluatedProperties'] ??
      definition?.['additionalProperties'] ??
      component['unevaluatedProperties'],
  );
  const defs = isObject(bundle['$defs']) ? bundle['$defs'] : {};
  return {
    schema: {
      type: 'object',
      ...(typeof component['description'] === 'string'
        ? {description: component['description']}
        : {}),
      properties,
      required,
      additionalProperties: open,
      ...bundleSections(bundle),
    },
    metadata: componentMetadataFromJson(
      properties,
      defs,
      defs,
      open ? null : Object.keys(properties),
    ),
  };
}

/**
 * Returns the self-contained runtime schema of a loaded function's arguments,
 * or `undefined` when its definition declares none.
 *
 * @param name The function's name.
 * @param context The loaded document.
 */
export function runtimeFunctionArgsSchema(
  name: string,
  context: CatalogLoadContext,
): JsonObject | undefined {
  const bundle = runtimeBundle(context, {function: name});
  const functions = isObject(bundle['functions']) ? bundle['functions'] : {};
  const fn = functions[name];
  const properties = isObject(fn) && isObject(fn['properties']) ? fn['properties'] : undefined;
  const args = properties?.['args'];
  return isObject(args) ? {...args, ...bundleSections(bundle)} : undefined;
}

/**
 * Returns the self-contained runtime schema of a loaded catalog's theme, or
 * `undefined` when it declares none.
 *
 * @param context The loaded document.
 */
export function runtimeThemeSchema(context: CatalogLoadContext): JsonObject | undefined {
  const bundle = runtimeBundle(context, {});
  const defs = isObject(bundle['$defs']) ? bundle['$defs'] : {};
  const theme = defs['theme'];
  return isObject(theme) ? {...theme, ...bundleSections(bundle)} : undefined;
}
