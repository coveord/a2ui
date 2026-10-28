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

import {
  RefScope,
  resolveDefinition,
  resolveJsonPointer,
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
): {definition: ResolvedDefinition; document: Record<string, unknown>; scope: RefScope} {
  const definition = resolveDefinition(schema as JsonSchemaObject, rootDoc, {
    stripLocalComponentEnvelopes: false,
    isCommonTypeName: options.isCommonTypeName,
  });
  // Every reference into the catalog now points into the bundle: a reference
  // left outside it is a common type or unresolvable.
  return {definition, document: {$defs: definition.defs}, scope: new RefScope()};
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
  scope: RefScope,
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
        // A reference into another document is ignored.
        if (target && !visited.has(target.key)) {
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
 * @param options The common types and protocol version rules.
 */
export function resolveComponentDefinition(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  options: ResolveObjectOptions & {readonly isAtLeastV10: boolean},
): ResolvedObjectDefinition {
  const {definition, document, scope} = bundle(schema, rootDoc, options);
  const collected = collectObjectPieces(
    definition.schema as Record<string, unknown>,
    document,
    scope,
    options,
    new Set(),
  );
  return {
    definition,
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
  const {definition, document, scope} = bundle(schema, rootDoc, options);
  const collected = collectObjectPieces(
    definition.schema as Record<string, unknown>,
    document,
    scope,
    {...options, isAtLeastV10: false},
    new Set(),
  );
  return {
    definition,
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
  scope: RefScope,
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
 * @param options The common types.
 */
export function resolveFunctionArgumentsDefinition(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  options: ResolveObjectOptions,
): ResolvedObjectDefinition {
  const {definition, document, scope} = bundle(schema, rootDoc, options);
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
    const target = new RefScope().resolve(ref, document);
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
