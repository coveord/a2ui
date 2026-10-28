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

import type {A2uiStandardSchema, A2uiValidator} from './a2ui_schema.js';
import {
  PeerScope,
  resolveDefinition,
  resolveJsonPointer,
  type PeerCatalogSource,
  type ResolvedDefinition,
} from './catalog_references.js';
import type {JsonSchemaObject} from './spec_annotations.js';

/**
 * A piece of an object definition: a common type whose properties it
 * includes, or a map of property schemas whose references resolve in the
 * definition's bundle.
 */
export type ObjectPiece =
  | {
      readonly kind: 'commonType';
      /** The name of the common type, such as `Checkable`. */
      readonly name: string;
      /** The common type's properties the object includes, or all of them when omitted. */
      readonly properties?: readonly string[];
    }
  | {readonly kind: 'properties'; readonly properties: Readonly<Record<string, unknown>>};

/**
 * A component, a function's arguments or a theme, resolved into the object
 * it validates, with no validation library involved.
 */
export interface ResolvedObjectDefinition {
  /** The definition with its references resolved and bundled. */
  readonly definition: ResolvedDefinition;
  /**
   * Resolves the definition again together with `references` into its
   * catalog, in one pass, so that the bundle also holds what they reach under
   * the same names. The protocol's common types refer into the catalog this
   * way, such as a `FunctionCall` to the catalog's `anyFunction`.
   */
  readonly bundleWith: (references: readonly string[]) => ResolvedDefinition;
  /** The document the pieces' references resolve in: the bundled `$defs`. */
  readonly document: Readonly<Record<string, unknown>>;
  /**
   * The object's pieces, least specific first: a property a later piece
   * declares overrides the same property of an earlier one.
   */
  readonly pieces: readonly ObjectPiece[];
  /** The property names the object requires. */
  readonly required: ReadonlySet<string>;
  /** Property names the object leaves out of every piece. */
  readonly omittedProperties: ReadonlySet<string>;
  /** Whether the object accepts properties no piece declares. */
  readonly open: boolean;
}

/** Options for resolving an object definition. */
export interface ResolveObjectOptions {
  /** The peer catalogs, in matching order. */
  readonly peers?: readonly PeerCatalogSource[];
  /** Whether a definition name stands for the protocol common type of that name. */
  readonly isCommonTypeName: (name: string) => boolean;
}

/**
 * The component envelope fields, which route a component rather than
 * configure it. A component's resolved object leaves them out.
 */
const ENVELOPE_FIELDS: ReadonlySet<string> = new Set(['id', 'component', 'catalogId']);

const NO_PROPERTIES: ReadonlySet<string> = new Set();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether an object schema explicitly permits additional or unevaluated properties. */
export function isExplicitlyOpen(schema: Readonly<Record<string, unknown>>): boolean {
  return (
    schema['unevaluatedProperties'] === true ||
    isRecord(schema['unevaluatedProperties']) ||
    schema['additionalProperties'] === true ||
    isRecord(schema['additionalProperties'])
  );
}

/**
 * Checks whether an object schema represents a shorthand parameter map (a map
 * of parameter names to subschemas), rather than a full JSON Schema object or
 * reference combinator.
 */
export function isShorthandParameterMap(schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  return (
    Object.keys(schema).length > 0 &&
    schema['properties'] === undefined &&
    typeof schema['type'] !== 'string' &&
    !('$ref' in schema) &&
    !('allOf' in schema) &&
    !('oneOf' in schema) &&
    !('anyOf' in schema) &&
    !('not' in schema) &&
    Object.values(schema).every(
      v => v !== null && (typeof v === 'object' || typeof v === 'boolean'),
    )
  );
}

/** Returns the definition name a `$ref` points at, or `undefined` for any other pointer. */
function definitionNameOf(ref: string): string | undefined {
  return ref.split(/#\/(?:\$defs|definitions)\//)[1];
}

/** Keywords that only constrain the values a schema accepts. */
const CONDITIONAL_KEYWORDS = new Set(['if', 'then', 'else', 'not', 'description', '$comment']);

/**
 * Returns a property schema that narrows one referenced type with an `allOf`,
 * such as a `DynamicString` with a conditional date format, as a reference to
 * that type with the property's own keywords, or `undefined` for any other
 * schema.
 *
 * Loading the property as the referenced type keeps what the type means to
 * the binder, such as a data binding. The conditional members are not
 * enforced.
 *
 * @param propSchema Raw JSON Schema property definition.
 */
export function narrowedReference(
  propSchema: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const {allOf, ...rest} = propSchema;
  if (!Array.isArray(allOf) || rest.$ref !== undefined) return undefined;
  const refs = allOf.filter(
    (member): member is {$ref: string} =>
      typeof (member as Record<string, unknown> | null)?.$ref === 'string',
  );
  const conditionalOnly = allOf.every(
    member =>
      refs.includes(member) ||
      Object.keys(member as Record<string, unknown>).every(key => CONDITIONAL_KEYWORDS.has(key)),
  );
  return refs.length === 1 && conditionalOnly ? {...rest, $ref: refs[0].$ref} : undefined;
}

/** Returns the property names a piece's own `required` lists. */
function requiredNames(schema: Readonly<Record<string, unknown>>): string[] {
  const required = schema['required'];
  return Array.isArray(required) ? required.filter((r): r is string => typeof r === 'string') : [];
}

/** Bundles `schema` for an object definition, as the loader converts it. */
function bundle(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  options: ResolveObjectOptions,
): {
  definition: ResolvedDefinition;
  bundleWith: (references: readonly string[]) => ResolvedDefinition;
  document: Record<string, unknown>;
  scope: PeerScope;
} {
  const resolveOptions = {
    stripLocalComponentEnvelopes: false,
    isCommonTypeName: options.isCommonTypeName,
  };
  const definition = resolveDefinition(
    schema as JsonSchemaObject,
    rootDoc,
    options.peers ?? [],
    resolveOptions,
  );
  const bundleWith = (references: readonly string[]): ResolvedDefinition => {
    // The entry is resolved first, so it keeps the names it has alone.
    const combined = resolveDefinition(
      {entry: schema, references: references.map($ref => ({$ref}))},
      rootDoc,
      options.peers ?? [],
      resolveOptions,
    );
    return {...combined, schema: combined.schema['entry'] as JsonSchemaObject};
  };
  // Every reference into a peer now points into the bundle, so the scope has
  // no peers: a reference left outside it is a common type or unresolvable.
  return {definition, bundleWith, document: {$defs: definition.defs}, scope: new PeerScope()};
}

/**
 * Collects the pieces of an object schema and its `allOf` hierarchy.
 *
 * The pieces are ordered from the most generic to the most specific, so that a
 * later piece overrides a property an earlier one declares: the common-type
 * mixins first, then the definitions the schema references, then its inline
 * `allOf` members, and the schema's own `properties` last. A component that
 * narrows a property it inherits keeps its narrowed schema, and the mixin
 * properties stay first in key order.
 *
 * A `ComponentCommon` mixin contributes the accessibility attributes, and from
 * v1.0 also the component's metadata; `catalogId` is an envelope field. Any
 * other common type contributes all of its properties.
 */
function collectObjectPieces(
  schema: Record<string, unknown>,
  document: Record<string, unknown>,
  scope: PeerScope,
  options: ResolveObjectOptions & {readonly isAtLeastV10: boolean},
  visited: Set<string>,
): Array<{piece: ObjectPiece; required: string[]}> {
  const mixins: Array<{piece: ObjectPiece; required: string[]}> = [];
  const local: Array<{piece: ObjectPiece; required: string[]}> = [];
  const inline: Array<{piece: ObjectPiece; required: string[]}> = [];

  const allOf = schema['allOf'];
  if (Array.isArray(allOf)) {
    for (const sub of allOf) {
      if (!isRecord(sub)) continue;
      const ref = sub['$ref'];
      if (typeof ref !== 'string') {
        inline.push(...collectObjectPieces(sub, document, scope, options, visited));
        continue;
      }
      const commonType = ref.startsWith('#/') ? undefined : definitionNameOf(ref);
      if (ref.includes('common_types.json') && ref.includes('ComponentCommon')) {
        const properties = options.isAtLeastV10 ? ['accessibility', 'metadata'] : ['accessibility'];
        mixins.push({
          piece: {kind: 'commonType', name: 'ComponentCommon', properties},
          required: [],
        });
      } else if (commonType !== undefined && options.isCommonTypeName(commonType)) {
        mixins.push({piece: {kind: 'commonType', name: commonType}, required: []});
      } else {
        const target = scope.resolve(ref, document);
        if (!target) {
          scope.assertResolvable(ref);
        } else if (!visited.has(target.key)) {
          visited.add(target.key);
          const resolved = resolveJsonPointer(document, target.pointer);
          if (resolved) {
            local.push(...collectObjectPieces(resolved, document, scope, options, visited));
          }
        }
      }
    }
  }

  const result = [...mixins, ...local, ...inline];
  const properties = schema['properties'];
  if (properties) {
    result.push({
      piece: {kind: 'properties', properties: isRecord(properties) ? properties : {}},
      required: requiredNames(schema),
    });
  }
  return result;
}

/**
 * Resolves a component's definition into the object a component of that type
 * validates: its envelope fields left out, and closed unless the definition
 * allows unevaluated or additional properties.
 *
 * @param schema The component's definition.
 * @param rootDoc The catalog document the definition belongs to.
 * @param options The peers, common types and protocol version rules.
 */
export function resolveComponentDefinition(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  options: ResolveObjectOptions & {readonly isAtLeastV10: boolean},
): ResolvedObjectDefinition {
  const {definition, bundleWith, document, scope} = bundle(schema, rootDoc, options);
  const collected = collectObjectPieces(
    definition.schema as Record<string, unknown>,
    document,
    scope,
    options,
    new Set(),
  );
  return {
    definition,
    bundleWith,
    document,
    pieces: collected.map(({piece}) => piece),
    required: new Set(collected.flatMap(({required}) => required)),
    omittedProperties: ENVELOPE_FIELDS,
    open: isExplicitlyOpen(schema),
  };
}

/**
 * Resolves a theme's definition into the object a theme validates. Unlike a
 * component, a theme keeps every property it declares, and it is open unless
 * its author closes it, as JSON Schema itself defaults.
 *
 * @param schema The theme's definition, an object schema.
 * @param rootDoc The catalog document the definition belongs to.
 * @param options The common types.
 */
export function resolveThemeDefinition(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  options: ResolveObjectOptions,
): ResolvedObjectDefinition {
  const {definition, bundleWith, document, scope} = bundle(schema, rootDoc, options);
  const collected = collectObjectPieces(
    definition.schema as Record<string, unknown>,
    document,
    scope,
    {...options, isAtLeastV10: false},
    new Set(),
  );
  return {
    definition,
    bundleWith,
    document,
    pieces: collected.map(({piece}) => piece),
    required: new Set(collected.flatMap(({required}) => required)),
    omittedProperties: NO_PROPERTIES,
    open:
      isExplicitlyOpen(schema) ||
      !(schema['additionalProperties'] === false || schema['unevaluatedProperties'] === false),
  };
}

/** An object schema gathered from function arguments. */
interface ArgumentsCollection {
  readonly schemas: Array<Record<string, unknown>>;
  hasUnresolvable: boolean;
}

/**
 * Collects the object schemas of a function's arguments: local pointers are
 * followed, `allOf` members recursed into, and a shorthand map of argument
 * schemas read as an object. A reference that cannot be followed, or a
 * `oneOf` or `anyOf`, leaves the arguments open.
 */
function collectArgumentSchemas(
  schema: Record<string, unknown>,
  document: Record<string, unknown>,
  scope: PeerScope,
  visited: Set<string>,
  collection: ArgumentsCollection,
): void {
  if (isShorthandParameterMap(schema)) {
    collection.schemas.push({type: 'object', properties: schema});
    return;
  }

  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    const target = scope.resolve(ref, document);
    if (!target) {
      scope.assertResolvable(ref);
      collection.hasUnresolvable = true;
    } else if (!visited.has(target.key)) {
      visited.add(target.key);
      const resolved = resolveJsonPointer(document, target.pointer);
      if (resolved) {
        collectArgumentSchemas(resolved, document, scope, visited, collection);
      } else {
        collection.hasUnresolvable = true;
      }
    }
  }

  const allOf = schema['allOf'];
  if (Array.isArray(allOf)) {
    for (const sub of allOf) {
      if (isRecord(sub)) collectArgumentSchemas(sub, document, scope, visited, collection);
    }
  }

  if (Array.isArray(schema['anyOf']) || Array.isArray(schema['oneOf'])) {
    collection.hasUnresolvable = true;
  }

  if (
    schema['properties'] ||
    schema['required'] ||
    schema['additionalProperties'] !== undefined ||
    schema['unevaluatedProperties'] !== undefined
  ) {
    collection.schemas.push(schema);
  }
}

/**
 * Resolves the schema of a function's arguments into the object the
 * arguments form. Every name any gathered schema lists in `required` is
 * required. The arguments are open when a gathered schema allows unevaluated
 * or additional properties, or when part of the schema cannot be gathered,
 * such as a `oneOf`, so that no valid argument is rejected.
 *
 * @param schema The arguments' schema.
 * @param rootDoc The catalog document the definition belongs to.
 * @param options The peers and common types.
 */
export function resolveFunctionArgumentsDefinition(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  options: ResolveObjectOptions,
): ResolvedObjectDefinition {
  const {definition, bundleWith, document, scope} = bundle(schema, rootDoc, options);
  const collection: ArgumentsCollection = {schemas: [], hasUnresolvable: false};
  collectArgumentSchemas(
    definition.schema as Record<string, unknown>,
    document,
    scope,
    new Set(),
    collection,
  );
  const pieces: ObjectPiece[] = [];
  for (const gathered of collection.schemas) {
    const properties = gathered['properties'];
    if (isRecord(properties)) pieces.push({kind: 'properties', properties});
  }
  return {
    definition,
    bundleWith,
    document,
    pieces,
    required: new Set(collection.schemas.flatMap(requiredNames)),
    omittedProperties: NO_PROPERTIES,
    open:
      collection.hasUnresolvable ||
      collection.schemas.some(isExplicitlyOpen) ||
      isExplicitlyOpen(schema),
  };
}

/**
 * Returns the JSON Schema view of a property schema, as web_core inspects the
 * property: what binds as a dynamic value, what refers to a child, and which
 * keys an object declares. It reads the schema the way the catalog loader
 * converts it.
 *
 * - A reference to a common type, wherever its definition is written, is a
 *   bare `$ref` to `common_types.json`.
 * - A reference into `document` is read as the definition it points to. A
 *   reference back into a definition already being read reads as any value.
 * - A union of an enum with a data binding, and no description of its own, is
 *   a `DynamicString`.
 * - An object is closed when it forbids additional or unevaluated properties,
 *   and open otherwise.
 */
function propertyView(
  schema: unknown,
  document: Readonly<Record<string, unknown>>,
  isCommonTypeName: (name: string) => boolean,
  visited: ReadonlySet<string>,
): JsonSchemaObject {
  if (!isRecord(schema)) return {};
  const description = typeof schema['description'] === 'string' ? schema['description'] : undefined;
  const described = (view: Record<string, unknown>): JsonSchemaObject =>
    description === undefined ? view : {...view, description};
  const read = (node: unknown, seen = visited) =>
    propertyView(node, document, isCommonTypeName, seen);

  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    const name = definitionNameOf(ref);
    if (name !== undefined && isCommonTypeName(name)) {
      return described({$ref: `common_types.json#/$defs/${name}`});
    }
    const target = new PeerScope().resolve(ref, document);
    const resolved = target ? resolveJsonPointer(document, target.pointer) : undefined;
    if (target && resolved) {
      if (visited.has(target.key)) return {};
      const view = read(resolved, new Set(visited).add(target.key));
      return description === undefined ? view : {...view, description};
    }
    if (ref.startsWith('#')) return {};
  }

  const narrowed = narrowedReference(schema);
  if (narrowed) return read(narrowed);

  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) continue;
    const objects = branches.filter(isRecord);
    if (objects.length === 0) break;
    const hasEnum = objects.some(branch => Array.isArray(branch['enum']));
    const hasBinding = objects.some(
      branch => typeof branch['$ref'] === 'string' && branch['$ref'].includes('DataBinding'),
    );
    if (description === undefined && hasEnum && hasBinding) {
      return {$ref: 'common_types.json#/$defs/DynamicString'};
    }
    const views = objects.map(branch => read(branch));
    if (views.length === 1) return described(views[0]);
    return described({[Array.isArray(schema['oneOf']) ? 'oneOf' : 'anyOf']: views});
  }

  if (schema['const'] !== undefined) return described({const: schema['const']});
  if (Array.isArray(schema['enum']) && schema['enum'].length > 0) {
    return described({enum: schema['enum']});
  }
  switch (schema['type']) {
    case 'array':
      return described({
        type: 'array',
        items: isRecord(schema['items']) ? read(schema['items']) : {},
      });
    case 'object': {
      const properties = schema['properties'];
      if (!isRecord(properties)) return described({type: 'object'});
      const closed =
        schema['additionalProperties'] === false || schema['unevaluatedProperties'] === false;
      return described({
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [key, read(value)]),
        ),
        additionalProperties: !closed,
      });
    }
    case 'string':
    case 'integer':
    case 'number':
    case 'boolean':
      return described({type: schema['type']});
    default:
      return described({});
  }
}

/**
 * Returns the JSON Schema view of a resolved object definition, as web_core
 * inspects it: its pieces' properties merged in order, without its omitted
 * properties, with the names it requires and whether it is open.
 *
 * @param model The resolved object definition.
 * @param commonTypes The JSON Schema definitions of the protocol's common
 *     types, which a common-type piece reads its properties from.
 * @param isCommonTypeName Whether a definition name stands for a common type.
 */
export function objectDefinitionView(
  model: ResolvedObjectDefinition,
  commonTypes: Readonly<Record<string, unknown>>,
  isCommonTypeName: (name: string) => boolean,
): JsonSchemaObject {
  const commonTypesDocument = {$defs: commonTypes};
  const properties: Record<string, JsonSchemaObject> = {};
  for (const piece of model.pieces) {
    const [source, document] =
      piece.kind === 'commonType'
        ? [
            isRecord(commonTypes[piece.name]) ? commonTypes[piece.name] : undefined,
            commonTypesDocument,
          ]
        : [{properties: piece.properties}, model.document];
    const declared = isRecord(source) ? source['properties'] : undefined;
    if (!isRecord(declared)) continue;
    const names =
      piece.kind === 'commonType'
        ? (piece.properties ?? Object.keys(declared))
        : Object.keys(declared);
    for (const name of names) {
      if (model.omittedProperties.has(name) || declared[name] === undefined) continue;
      properties[name] = propertyView(declared[name], document, isCommonTypeName, new Set());
    }
  }
  const required = [...model.required].filter(name => name in properties);
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? {required} : {}),
    additionalProperties: model.open,
  };
}

/** What a `CatalogSchemaCompiler` compiles a schema for. */
export interface CatalogSchemaCompileContext {
  /**
   * `'component'` for a component's properties, without its envelope fields
   * (`id`, `component`, `catalogId`); `'functionArgs'` for a function's
   * arguments; `'theme'` for the catalog's theme.
   */
  readonly kind: 'component' | 'functionArgs' | 'theme';
  /** The component's or function's name, or `'theme'`. */
  readonly name: string;
  /** The protocol version the catalog is loaded at. */
  readonly protocolVersion: string;
}

/**
 * Compiles the schemas of a catalog `Catalog.fromJson` loads into validators,
 * in place of the built-in Zod 3 compiler.
 *
 * A2UI resolves each entry's definition first: its references, including
 * those into peer catalogs, its mixins and `allOf` members, and the closure
 * rules of its protocol version. The compiler receives the result as one
 * self-contained JSON Schema draft 2020-12 object, with the protocol's common
 * types and every definition it reaches under `$defs`, and returns a
 * synchronous Standard Schema validator. A2UI binds and inspects the entry
 * through its definition, so the validator only validates.
 */
export interface CatalogSchemaCompiler {
  /**
   * Compiles `schema` into a validator. Called on an entry's first use, and
   * again for each set of peer catalogs the entry is linked to.
   *
   * @param schema The JSON Schema of the object to validate, which the
   *     compiler may keep.
   * @param context What the schema is for.
   * @returns A validator whose `validate` returns synchronously.
   */
  compile(schema: JsonSchemaObject, context: CatalogSchemaCompileContext): A2uiValidator;
}

/**
 * Returns the self-contained JSON Schema of a resolved object definition, as
 * a `CatalogSchemaCompiler` compiles it: its pieces' properties merged in
 * order, without its omitted properties, with the names it requires, closed
 * unless open, and with `$defs` holding its bundled definitions and the
 * protocol's common types. A reference to a common type, wherever its
 * definition is written, points at the common type, and a reference into the
 * root catalog document at the bundled definition.
 *
 * @param model The resolved object definition.
 * @param commonTypes The JSON Schema definitions of the protocol's common types.
 * @param isCommonTypeName Whether a definition name stands for a common type.
 * @throws {A2uiCatalogError} If the definition refers into a catalog
 *     document that is not available.
 */
export function objectValidationSchema(
  model: ResolvedObjectDefinition,
  commonTypes: Readonly<Record<string, unknown>>,
  isCommonTypeName: (name: string) => boolean,
): JsonSchemaObject {
  const scope = new PeerScope();
  const localize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(localize);
    if (!isRecord(value)) return value;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) result[key] = localize(child);
    const ref = value['$ref'];
    if (typeof ref === 'string') {
      const name = definitionNameOf(ref);
      if (name !== undefined && isCommonTypeName(name)) {
        result['$ref'] = `#/$defs/${name}`;
      } else {
        const target = scope.resolve(ref, {});
        if (target) result['$ref'] = target.pointer;
        else scope.assertResolvable(ref);
      }
    }
    return result;
  };

  const properties: Record<string, unknown> = {};
  for (const piece of model.pieces) {
    const source =
      piece.kind === 'commonType' ? commonTypes[piece.name] : {properties: piece.properties};
    const declared = isRecord(source) ? source['properties'] : undefined;
    if (!isRecord(declared)) continue;
    const names =
      piece.kind === 'commonType'
        ? (piece.properties ?? Object.keys(declared))
        : Object.keys(declared);
    for (const name of names) {
      if (model.omittedProperties.has(name) || declared[name] === undefined) continue;
      properties[name] = localize(declared[name]);
    }
  }
  const required = [...model.required].filter(name => name in properties);
  const catalogReferences = referencesOutside(commonTypes, isCommonTypeName);
  const bundled =
    catalogReferences.length > 0 ? model.bundleWith(catalogReferences) : model.definition;
  const defs: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(bundled.defs)) {
    defs[name] = localize(definition);
  }
  // A definition named after a common type stands for the common type.
  for (const [name, definition] of Object.entries(commonTypes)) {
    defs[name] = localize(definition);
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? {required} : {}),
    additionalProperties: model.open,
    $defs: defs,
  };
}

/**
 * Returns the references the common types make outside themselves, into the
 * catalog that uses them, such as a `FunctionCall` to the catalog's
 * `anyFunction`.
 */
function referencesOutside(
  commonTypes: Readonly<Record<string, unknown>>,
  isCommonTypeName: (name: string) => boolean,
): string[] {
  const references = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (isRecord(value)) {
      const ref = value['$ref'];
      if (typeof ref === 'string') {
        const name = definitionNameOf(ref);
        if (!ref.startsWith('#/') && !(name !== undefined && isCommonTypeName(name))) {
          references.add(ref);
        }
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(commonTypes);
  return [...references];
}

/**
 * Returns a schema that validates with `validator` and writes `jsonSchema`
 * as its Standard JSON Schema: a compiled catalog entry, which A2UI reads as
 * any library schema.
 *
 * @param validator The validator a `CatalogSchemaCompiler` returned.
 * @param jsonSchema The JSON Schema it was compiled from.
 */
export function compiledEntrySchema(
  validator: A2uiValidator,
  jsonSchema: JsonSchemaObject,
): A2uiStandardSchema {
  const write = () => structuredClone(jsonSchema) as Record<string, unknown>;
  return Object.freeze({
    '~standard': Object.freeze({
      version: 1 as const,
      vendor: validator['~standard'].vendor,
      validate: (value: unknown) => validator['~standard'].validate(value),
      jsonSchema: Object.freeze({input: write, output: write}),
    }),
  });
}

/**
 * Returns a copy of `value` as the JSON Schema view of a compiled schema
 * writes it: a reference to a common type, wherever its definition is
 * written, is a reference into `common_types.json`, and any other reference
 * into `document` is replaced by its target, the reference's own keywords
 * winning. A reference back into a target already being replaced is kept.
 */
function definitionJson(
  value: unknown,
  document: Readonly<Record<string, unknown>>,
  isCommonTypeName: (name: string) => boolean,
  visited: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => definitionJson(item, document, isCommonTypeName, visited));
  }
  if (!isRecord(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== '$ref') copy[key] = definitionJson(child, document, isCommonTypeName, visited);
  }
  const ref = value['$ref'];
  if (typeof ref !== 'string') return copy;
  const name = definitionNameOf(ref);
  if (name !== undefined && isCommonTypeName(name)) {
    return {$ref: `common_types.json#/$defs/${name}`, ...copy};
  }
  const target = new PeerScope().resolve(ref, document);
  const resolved = target ? resolveJsonPointer(document, target.pointer) : undefined;
  if (!target || !resolved || visited.has(target.key)) return {$ref: ref, ...copy};
  const inlined = definitionJson(
    resolved,
    document,
    isCommonTypeName,
    new Set(visited).add(target.key),
  );
  return {...(inlined as Record<string, unknown>), ...copy};
}

/**
 * Returns the JSON Schema view of a schema compiled from a resolved object
 * definition: the object's properties as its definition writes them, its
 * pieces merged in order without its omitted properties, with the names it
 * requires, and closed unless open. Common types are references into
 * `common_types.json`, and the catalog's own definitions are inlined.
 *
 * @param model The resolved object definition.
 * @param commonTypes The JSON Schema definitions of the protocol's common types.
 * @param isCommonTypeName Whether a definition name stands for a common type.
 */
export function objectDefinitionJson(
  model: ResolvedObjectDefinition,
  commonTypes: Readonly<Record<string, unknown>>,
  isCommonTypeName: (name: string) => boolean,
): JsonSchemaObject {
  const commonTypesDocument = {$defs: commonTypes};
  const properties: Record<string, unknown> = {};
  for (const piece of model.pieces) {
    const [source, document] =
      piece.kind === 'commonType'
        ? [commonTypes[piece.name], commonTypesDocument]
        : [{properties: piece.properties}, model.document];
    const declared = isRecord(source) ? source['properties'] : undefined;
    if (!isRecord(declared)) continue;
    const names =
      piece.kind === 'commonType'
        ? (piece.properties ?? Object.keys(declared))
        : Object.keys(declared);
    for (const name of names) {
      if (model.omittedProperties.has(name) || declared[name] === undefined) continue;
      properties[name] = definitionJson(declared[name], document, isCommonTypeName, new Set());
    }
  }
  const required = [...model.required].filter(name => name in properties);
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? {required} : {}),
    additionalProperties: model.open,
  };
}
