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
 * @fileoverview Specification-shaped catalog definitions of Zod models.
 *
 * A component of a catalog defined in code is a Zod object of all of its
 * properties, annotated (see `spec_annotations.ts`) with the mixins its
 * definition composes with `allOf` and anything else the catalog document
 * writes that Zod does not express. A function's model is the Zod object of
 * its arguments. This module turns such models back into the definitions a
 * catalog document writes, reading each model through its spec view (see
 * `specJsonSchemaOf`) rather than through Zod. The layout rules depend only on
 * the protocol version, not on the catalog.
 *
 * This module is internal to web_core and is not re-exported by any facade.
 */

import {isAtLeastVersion, normalizeVersionString, toCanonicalVersion} from '../common/semver.js';
import {V08_STANDARD_DEFS} from '../v0_8/standard_defs.js';
import {V09_STANDARD_DEFS} from '../v0_9/standard_defs.js';
import {V10_STANDARD_DEFS} from '../v1_0/standard_defs.js';
import {specAnnotationOf, specJsonSchemaOf} from './a2ui_json_schema.js';
import type {EntrySchema} from './a2ui_schema.js';
import {getSpecModels, type SpecAnnotation, type SpecMixin} from './spec_annotations.js';

type JsonObject = Record<string, unknown>;

/** The reference a common types document is written as when a catalog names none. */
export const DEFAULT_COMMON_TYPES_URI = 'common_types.json';

const STANDARD_DEFS_BY_VERSION: Readonly<Record<string, Record<string, unknown>>> = {
  '0.8': V08_STANDARD_DEFS,
  '0.9': V09_STANDARD_DEFS,
  '0.9.1': V09_STANDARD_DEFS,
  '1.0': V10_STANDARD_DEFS,
};

/**
 * Returns the common types definitions of a protocol version. A version with
 * no entry of its own at or above 1.0 gets the v1.0 definitions, and any other
 * version the v0.9 definitions.
 *
 * @param version A protocol version.
 */
export function standardDefsForVersion(version: string | undefined): Record<string, unknown> {
  if (version) {
    const key = toCanonicalVersion(version) ?? normalizeVersionString(version);
    if (key in STANDARD_DEFS_BY_VERSION) return STANDARD_DEFS_BY_VERSION[key];
    if (isAtLeastVersion(version, '1.0')) return V10_STANDARD_DEFS;
  }
  return V09_STANDARD_DEFS;
}

function copyJson<V>(value: V): V {
  return JSON.parse(JSON.stringify(value)) as V;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolves a `$ref`, or returns `undefined` for one it cannot follow. */
type RefResolver = (ref: string) => JsonObject | undefined;

/** How deep the disjointness check follows references and nested schemas. */
const MAX_DISJOINT_DEPTH = 8;

/** The JSON type of a JSON value, with integers counted as numbers. */
function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Follows a schema's `$ref` chain, or returns `undefined` when it cannot. */
function resolveSchema(
  schema: unknown,
  resolve: RefResolver,
  depth: number,
): JsonObject | undefined {
  let node = schema;
  for (let hops = 0; isObject(node) && typeof node['$ref'] === 'string'; hops++) {
    if (hops + depth > MAX_DISJOINT_DEPTH) return undefined;
    node = resolve(node['$ref']);
  }
  return isObject(node) ? node : undefined;
}

/**
 * The JSON types a schema can accept, or `undefined` when the schema does not
 * restrict them. `integer` is counted as `number`.
 */
function acceptedTypes(schema: JsonObject): Set<string> | undefined {
  const type = schema['type'];
  if (typeof type === 'string' || Array.isArray(type)) {
    return new Set(
      ([] as unknown[]).concat(type).map(t => (t === 'integer' ? 'number' : String(t))),
    );
  }
  if (Object.hasOwn(schema, 'const')) return new Set([jsonTypeOf(schema['const'])]);
  if (Array.isArray(schema['enum'])) return new Set(schema['enum'].map(jsonTypeOf));
  return undefined;
}

/**
 * The values a schema accepts, when it lists them with `const` or `enum`, or
 * `undefined` when it does not or when one of them is an object or an array.
 * Primitive values compare equal exactly when their JSON texts do; objects
 * equal as JSON may differ in key order, so they are not compared.
 */
function acceptedValues(schema: JsonObject): string[] | undefined {
  let values: unknown[];
  if (Object.hasOwn(schema, 'const')) values = [schema['const']];
  else if (Array.isArray(schema['enum'])) values = schema['enum'];
  else return undefined;
  if (values.some(v => typeof v === 'object' && v !== null)) return undefined;
  return values.map(v => JSON.stringify(v));
}

/** The properties an object schema and the schemas of its `allOf` require. */
function requiredKeys(schema: JsonObject, resolve: RefResolver, depth: number): Set<string> {
  const keys = new Set<string>();
  if (Array.isArray(schema['required'])) {
    for (const key of schema['required']) keys.add(String(key));
  }
  if (depth < MAX_DISJOINT_DEPTH && Array.isArray(schema['allOf'])) {
    for (const member of schema['allOf']) {
      const resolved = resolveSchema(member, resolve, depth + 1);
      if (resolved) for (const key of requiredKeys(resolved, resolve, depth + 1)) keys.add(key);
    }
  }
  return keys;
}

/**
 * The only properties a closed object schema accepts, or `undefined` when the
 * schema is open or its closure cannot be read without evaluating it.
 */
function closedKeys(schema: JsonObject): Set<string> | undefined {
  if (schema['additionalProperties'] !== false) return undefined;
  if (Object.hasOwn(schema, 'patternProperties')) return undefined;
  const properties = schema['properties'];
  return new Set(isObject(properties) ? Object.keys(properties) : []);
}

/** The schema of an object schema's own property, if it declares one. */
function propertySchema(schema: JsonObject, key: string): unknown {
  const properties = schema['properties'];
  return isObject(properties) ? properties[key] : undefined;
}

/**
 * Whether no JSON value matches both schemas. A `false` result means that the
 * check could not prove them disjoint, not that they overlap.
 *
 * Two schemas are disjoint when they accept no common JSON type, when both
 * list their values and none is shared, when one is a closed object that
 * does not allow a property the other requires, or when both require a
 * property whose schemas are disjoint.
 */
function provablyDisjoint(a: unknown, b: unknown, resolve: RefResolver, depth = 0): boolean {
  if (depth > MAX_DISJOINT_DEPTH) return false;
  const left = resolveSchema(a, resolve, depth);
  const right = resolveSchema(b, resolve, depth);
  if (!left || !right) return false;

  const leftTypes = acceptedTypes(left);
  const rightTypes = acceptedTypes(right);
  if (leftTypes && rightTypes && ![...leftTypes].some(t => rightTypes.has(t))) return true;

  const leftValues = acceptedValues(left);
  const rightValues = acceptedValues(right);
  if (leftValues && rightValues && !leftValues.some(v => rightValues.includes(v))) return true;

  const objectOnly = (types: Set<string> | undefined) =>
    types !== undefined && types.size === 1 && types.has('object');
  if (!objectOnly(leftTypes) || !objectOnly(rightTypes)) return false;

  const leftRequired = requiredKeys(left, resolve, depth);
  const rightRequired = requiredKeys(right, resolve, depth);
  const leftClosed = closedKeys(left);
  const rightClosed = closedKeys(right);
  if (leftClosed && [...rightRequired].some(key => !leftClosed.has(key))) return true;
  if (rightClosed && [...leftRequired].some(key => !rightClosed.has(key))) return true;
  return [...leftRequired].some(
    key =>
      rightRequired.has(key) &&
      provablyDisjoint(propertySchema(left, key), propertySchema(right, key), resolve, depth + 1),
  );
}

/** The properties of a component that the message envelope declares. */
const ENVELOPE_PROPERTIES = new Set(['id', 'component']);

/** Returns the spec view of a schema (see `specJsonSchemaOf`). */
function viewOf(schema: EntrySchema): JsonObject {
  return specJsonSchemaOf(schema) as JsonObject;
}

/** Returns the `spec()` annotation of a schema, read from its spec view. */
function annotationOf(schema: EntrySchema): SpecAnnotation {
  return specAnnotationOf(viewOf(schema)) ?? {};
}

/**
 * Returns whether a component's schema is a specification-shaped model: one
 * annotated with the mixins its definition composes.
 */
export function isSpecComponentSchema(schema: EntrySchema): boolean {
  return annotationOf(schema).mixins !== undefined;
}

/**
 * Returns whether a function's argument schema is a specification-shaped
 * model: one with an annotation.
 */
export function isSpecFunctionSchema(schema: EntrySchema): boolean {
  return Object.keys(annotationOf(schema)).length > 0;
}

/**
 * Returns whether a function's argument JSON Schema requires `args` to be
 * supplied on a call to the function: that is, whether an omitted (empty)
 * argument object cannot satisfy the schema.
 *
 * A schema requires arguments when it directly declares `required` properties
 * or a positive `minProperties`, when any member of an `allOf` requires
 * arguments, when every branch of a non-empty `oneOf` or `anyOf` union
 * requires arguments, or when a local `#/$defs/...` `$ref` resolves in `defs`
 * to a schema that requires arguments. A schema that carries a `default`
 * value does not require arguments.
 *
 * @param schema The function's `args` JSON Schema.
 * @param defs Optional `$defs` map for resolving local `#/$defs/...` references.
 * @param visited References already on the resolution stack.
 */
export function schemaRequiresArgs(
  schema: unknown,
  defs?: Readonly<Record<string, unknown>>,
  visited: ReadonlySet<string> = new Set(),
): boolean {
  if (!isObject(schema) || schema['default'] !== undefined) return false;
  if (Array.isArray(schema['required']) && schema['required'].length > 0) return true;
  if (typeof schema['minProperties'] === 'number' && schema['minProperties'] > 0) return true;
  const ref = schema['$ref'];
  if (typeof ref === 'string' && defs && ref.startsWith('#/$defs/') && !visited.has(ref)) {
    let target: unknown = defs;
    for (const raw of ref.slice('#/$defs/'.length).split('/')) {
      const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
      target = isObject(target) && Object.hasOwn(target, segment) ? target[segment] : undefined;
    }
    if (target !== undefined && schemaRequiresArgs(target, defs, new Set(visited).add(ref))) {
      return true;
    }
  }
  if (
    Array.isArray(schema['allOf']) &&
    schema['allOf'].some(sub => schemaRequiresArgs(sub, defs, visited))
  ) {
    return true;
  }
  if (
    Array.isArray(schema['oneOf']) &&
    schema['oneOf'].length > 0 &&
    schema['oneOf'].every(sub => schemaRequiresArgs(sub, defs, visited))
  ) {
    return true;
  }
  if (
    Array.isArray(schema['anyOf']) &&
    schema['anyOf'].length > 0 &&
    schema['anyOf'].every(sub => schemaRequiresArgs(sub, defs, visited))
  ) {
    return true;
  }
  return false;
}

/** A definition and the catalog definitions it needs. */
export interface SpecSchema {
  /** The definition. */
  readonly schema: JsonObject;
  /**
   * The models of the catalog definitions the definition references, by
   * name, such as a component's `CatalogComponentCommon` mixin.
   */
  readonly catalogDefs: ReadonlyMap<string, EntrySchema>;
}

/**
 * Builds specification-shaped definitions of models for a protocol version.
 *
 * It reads a model through its spec view (see `specJsonSchemaOf`): its JSON
 * Schema, and the `spec()` annotations its nodes hold.
 */
export class SpecShaper {
  private readonly isV08: boolean;
  private readonly isV10: boolean;
  private readonly standardDefs: Record<string, unknown>;
  /** Standard definitions with their references written as the catalog does. */
  private readonly standardDefsInCatalog = new Map<string, JsonObject>();
  /**
   * @param protocolVersion The catalog's protocol version.
   * @param commonTypesUri How the catalog's document writes the common types
   *     document in references, such as `common_types.json`.
   */
  constructor(
    protocolVersion: string,
    private readonly commonTypesUri: string = DEFAULT_COMMON_TYPES_URI,
  ) {
    this.isV08 = !isAtLeastVersion(protocolVersion, '0.9');
    this.isV10 = isAtLeastVersion(protocolVersion, '1.0');
    this.standardDefs = standardDefsForVersion(protocolVersion);
  }

  /**
   * The definition models the schemas shaped so far carry through
   * `specMeta({defs})`, by definition name.
   */
  private readonly carriedModels = new Map<string, EntrySchema>();

  /** Records the definition models `schema` carries. */
  private collectCarriedModels(schema: EntrySchema): void {
    for (const [name, model] of getSpecModels(schema) ?? []) {
      this.carriedModels.set(name, model as EntrySchema);
    }
  }

  /**
   * Returns the definition a catalog document writes for a component.
   *
   * @param name The component's name.
   * @param schema The component's schema, annotated with its mixins.
   * @param allowedParents The component's allowed parents, if restricted.
   * @param allowedChildren The component's allowed children, if restricted.
   */
  componentSchema(
    name: string,
    schema: EntrySchema,
    allowedParents?: readonly string[],
    allowedChildren?: readonly string[],
  ): SpecSchema {
    this.collectCarriedModels(schema);
    const catalogDefs = new Map<string, EntrySchema>();
    let result: JsonObject;
    if (this.isV08) {
      // A v0.8 catalog document has no common types: the whole component is
      // written inline, without the properties the envelope declares.
      result = this.toJson(schema, catalogDefs);
      const properties = result['properties'];
      if (isObject(properties)) {
        for (const key of ENVELOPE_PROPERTIES) delete properties[key];
      }
      if (Array.isArray(result['required'])) {
        const required = result['required'].filter(r => !ENVELOPE_PROPERTIES.has(r as string));
        if (required.length > 0) result['required'] = required;
        else delete result['required'];
      }
    } else {
      const view = viewOf(schema);
      const annotation = specAnnotationOf(view) ?? {};
      const mixins = annotation.mixins ?? [];
      const inherited = new Set<string>(ENVELOPE_PROPERTIES);
      const refs: JsonObject[] = [];
      for (const mixin of mixins) {
        refs.push({$ref: this.mixinRef(mixin, catalogDefs)});
        for (const key of this.mixinProperties(mixin)) inherited.add(key);
      }
      const description = plainDescription(view);
      const own = this.objectSchema(view, annotation, key => !inherited.has(key), catalogDefs);
      const properties = {component: {const: name}, ...(own['properties'] as JsonObject)};
      const required = ['component', ...((own['required'] as string[] | undefined) ?? [])];
      const inner: JsonObject = {type: 'object'};
      // The specification puts a v1.0 description on the component and a
      // v0.9 description on the object of its own properties.
      if (description !== undefined && !this.isV10) inner['description'] = description;
      inner['properties'] = properties;
      inner['required'] = required;
      result = {type: 'object'};
      if (this.isV10) {
        if (description !== undefined) result['description'] = description;
        if (refs.length > 0) {
          result['allOf'] = [...refs, inner];
        } else {
          result['properties'] = properties;
          result['required'] = required;
        }
      } else {
        result['allOf'] = [...refs, inner];
        result['unevaluatedProperties'] = false;
      }
    }
    if (allowedParents && allowedParents.length > 0) result['allowedParents'] = [...allowedParents];
    if (allowedChildren && allowedChildren.length > 0) {
      result['allowedChildren'] = [...allowedChildren];
    }
    return {schema: result, catalogDefs};
  }

  /**
   * Returns the definition a catalog document writes for a function: the
   * schema of a call to it.
   *
   * @param name The function's name.
   * @param fn The function's API, whose `schema` is its argument model.
   */
  functionSchema(
    name: string,
    fn: {
      readonly schema: EntrySchema;
      readonly returnType: string;
      readonly description?: string;
      readonly allowedCallers?: string;
      readonly requiresUserActivation?: boolean;
    },
    defs?: Readonly<Record<string, unknown>>,
    catalogDefs?: Map<string, EntrySchema>,
  ): JsonObject {
    const args = this.toJson(fn.schema, catalogDefs);
    const argsRequired = schemaRequiresArgs(args, defs);
    const result: JsonObject = {type: 'object'};
    if (fn.description) result['description'] = fn.description;
    if (this.isV10) {
      result['returnType'] = fn.returnType;
      if (fn.allowedCallers) result['allowedCallers'] = fn.allowedCallers;
      if (fn.requiresUserActivation) result['requiresUserActivation'] = true;
      result['properties'] = {'@call': {const: name}, args};
      result['required'] = argsRequired ? ['@call', 'args'] : ['@call'];
      return result;
    }
    if (fn.allowedCallers) result['allowedCallers'] = fn.allowedCallers;
    if (fn.requiresUserActivation) result['requiresUserActivation'] = true;
    result['properties'] = {call: {const: name}, args, returnType: {const: fn.returnType}};
    result['required'] = argsRequired ? ['call', 'args'] : ['call'];
    result['unevaluatedProperties'] = false;
    return result;
  }

  /**
   * Returns the definition a catalog document writes for a model, such as a
   * mixin or a theme.
   *
   * @param schema The model.
   */
  defSchema(schema: EntrySchema, catalogDefs?: Map<string, EntrySchema>): JsonObject {
    return this.toJson(schema, catalogDefs, true);
  }

  /** Returns the reference a component's definition makes to a mixin. */
  private mixinRef(mixin: SpecMixin, catalogDefs: Map<string, EntrySchema>): string {
    if (typeof mixin === 'string') return `${this.commonTypesUri}#/$defs/${mixin}`;
    const name = annotationOf(mixin).defName;
    if (name === undefined) {
      throw new Error('A component mixin model must be named with specDef().');
    }
    catalogDefs.set(name, mixin);
    return `#/$defs/${name}`;
  }

  /** Returns the names of the properties a mixin declares. */
  private mixinProperties(mixin: SpecMixin): string[] {
    if (typeof mixin !== 'string') {
      const properties = viewOf(mixin)['properties'];
      return isObject(properties) ? Object.keys(properties) : [];
    }
    const names: string[] = [];
    const collect = (def: unknown, seen: Set<unknown>): void => {
      if (!isObject(def) || seen.has(def)) return;
      seen.add(def);
      if (isObject(def['properties'])) names.push(...Object.keys(def['properties']));
      for (const sub of Array.isArray(def['allOf']) ? def['allOf'] : []) {
        const ref = isObject(sub) ? sub['$ref'] : undefined;
        const target =
          typeof ref === 'string' && ref.startsWith('#/$defs/')
            ? this.standardDefs[ref.substring('#/$defs/'.length)]
            : sub;
        collect(target, seen);
      }
    };
    collect(this.standardDefs[mixin], new Set());
    return names;
  }

  /**
   * Returns the JSON Schema a catalog document writes for a schema.
   *
   * @param schema The schema.
   */
  toJson(
    schema: EntrySchema,
    catalogDefs?: Map<string, EntrySchema>,
    isDefRoot = false,
  ): JsonObject {
    this.collectCarriedModels(schema);
    return this.nodeJson(viewOf(schema), catalogDefs, isDefRoot);
  }

  /** Returns the JSON Schema a catalog document writes for a node of a spec view. */
  private nodeJson(
    node: JsonObject,
    catalogDefs?: Map<string, EntrySchema>,
    isDefRoot = false,
  ): JsonObject {
    const annotation = specAnnotationOf(node) ?? {};
    const defName = isDefRoot ? undefined : annotation.defName;
    const defModel =
      defName === undefined ? undefined : (annotation.defModel ?? this.carriedModels.get(defName));
    if (defName !== undefined && defModel !== undefined) {
      return this.defRefJson(node, defName, defModel, catalogDefs);
    }
    const ref = node['$ref'];
    // The keywords an annotation adds are written after what the schema
    // itself says, so they are left out of what it says.
    const own = annotation.keywords ? withoutKeys(node, Object.keys(annotation.keywords)) : node;
    const core =
      typeof ref === 'string'
        ? {$ref: this.refTarget(ref)}
        : this.coreJson(own, annotation, catalogDefs);
    if (annotation.keywords) Object.assign(core, copyJson(annotation.keywords));
    const result: JsonObject = annotation.allOf
      ? {allOf: [core, ...annotation.allOf.map(s => copyJson(s))]}
      : core;
    const description = node['description'];
    if (typeof description === 'string' && description) result['description'] = description;
    if (node['default'] !== undefined) result['default'] = copyJson(node['default']);
    return result;
  }

  /**
   * Returns the reference a catalog document writes for a node annotated as
   * the catalog definition `defName`, recording the definition's model in
   * `catalogDefs`. The node's description and default are written beside the
   * reference only where they differ from the model's.
   */
  private defRefJson(
    node: JsonObject,
    defName: string,
    model: EntrySchema,
    catalogDefs?: Map<string, EntrySchema>,
  ): JsonObject {
    catalogDefs?.set(defName, model);
    const modelView = viewOf(model);
    const result: JsonObject = {$ref: `#/$defs/${defName}`};
    const description = node['description'];
    if (
      typeof description === 'string' &&
      description &&
      description !== modelView['description']
    ) {
      result['description'] = description;
    }
    const value = node['default'];
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(modelView['default'])) {
      result['default'] = copyJson(value);
    }
    return result;
  }
  /**
   * Returns the standard definition a reference in the catalog document names
   * (`<commonTypesUri>#/$defs/<name>`), or `undefined` for any other
   * reference. A bare `#/$defs/<name>` in the catalog document names one of
   * the catalog's own definitions, which may share a standard definition's
   * name, so it is not followed.
   *
   * The definition is returned with its own references, which are local to
   * the common types document, written as the catalog document writes them,
   * so that they resolve against the same document when followed in turn.
   */
  private resolveStandardRef(ref: string): JsonObject | undefined {
    const prefix = `${this.commonTypesUri}#/$defs/`;
    if (!ref.startsWith(prefix)) return undefined;
    const name = ref.substring(prefix.length);
    if (name.includes('/') || !Object.hasOwn(this.standardDefs, name)) return undefined;
    const cached = this.standardDefsInCatalog.get(name);
    if (cached) return cached;
    const definition = this.standardDefs[name];
    if (!isObject(definition)) return undefined;
    const rewritten = this.withCatalogRefs(definition) as JsonObject;
    this.standardDefsInCatalog.set(name, rewritten);
    return rewritten;
  }

  /**
   * Returns a copy of a part of the common types document with its local
   * references written as the catalog document writes them.
   */
  private withCatalogRefs(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => this.withCatalogRefs(item));
    if (!isObject(value)) return value;
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] =
        key === '$ref' && typeof item === 'string'
          ? this.refTarget(item)
          : this.withCatalogRefs(item);
    }
    return result;
  }

  /** Writes a `REF:` marker's reference as the catalog document does. */
  private refTarget(ref: string): string {
    if (!ref.startsWith('#/$defs/')) return ref;
    return `${this.commonTypesUri}${ref}`;
  }

  /** Converts what a node of a spec view says of its value, below its wrappers. */
  private coreJson(
    node: JsonObject,
    annotation: SpecAnnotation,
    catalogDefs?: Map<string, EntrySchema>,
  ): JsonObject {
    if (node['const'] !== undefined) return {const: copyJson(node['const'])};
    if (Array.isArray(node['enum'])) return {type: 'string', enum: [...node['enum']]};
    const branches = node['anyOf'] ?? node['oneOf'];
    if (Array.isArray(branches)) {
      // A union accepts a value any of its branches accepts, as `anyOf`
      // does. It is written as `oneOf`, as the specification writes its
      // unions, only when no value matches two branches, so that both
      // keywords accept the same values.
      const written = branches.filter(isObject).map(branch => this.nodeJson(branch, catalogDefs));
      const resolve = (ref: string) => {
        const model = ref.startsWith('#/$defs/')
          ? catalogDefs?.get(ref.substring('#/$defs/'.length))
          : undefined;
        return model !== undefined
          ? this.defSchema(model, catalogDefs)
          : this.resolveStandardRef(ref);
      };
      const disjoint = written.every((branch, i) =>
        written.slice(i + 1).every(other => provablyDisjoint(branch, other, resolve)),
      );
      return {[disjoint ? 'oneOf' : 'anyOf']: written};
    }
    switch (node['type']) {
      case 'object':
        if (isObject(node['properties'])) {
          return this.objectSchema(node, annotation, () => true, catalogDefs);
        }
        return isObject(node['additionalProperties'])
          ? {
              type: 'object',
              additionalProperties: this.nodeJson(node['additionalProperties'], catalogDefs),
            }
          : {type: 'object', properties: {}};
      case 'string':
        return pickKeywords(node, {type: 'string'}, STRING_KEYWORDS);
      case 'integer':
      case 'number':
        return pickKeywords(node, {type: node['type']}, NUMBER_KEYWORDS);
      case 'boolean':
        return {type: 'boolean'};
      case 'null':
        return {type: 'null'};
      case 'array': {
        const result: JsonObject = {
          type: 'array',
          items: isObject(node['items']) ? this.nodeJson(node['items'], catalogDefs) : {},
        };
        if (node['minItems'] !== undefined) result['minItems'] = node['minItems'];
        if (node['maxItems'] !== undefined) result['maxItems'] = node['maxItems'];
        return result;
      }
    }
    if (isObject(node['not']) && Object.keys(node['not']).length === 0) return {not: {}};
    const rest = Object.keys(node).filter(key => key !== 'description' && key !== 'default');
    if (rest.length === 0) return {};
    return fallbackJson(node);
  }

  /**
   * Converts an object node, keeping the properties `keep` accepts. Its
   * `required` list follows the annotation, or else the property order. It is
   * closed with the annotation's keyword, or with `additionalProperties` when
   * it rejects unknown keys.
   */
  private objectSchema(
    node: JsonObject,
    annotation: SpecAnnotation,
    keep: (key: string) => boolean,
    catalogDefs?: Map<string, EntrySchema>,
  ): JsonObject {
    const nodeProperties = node['properties'];
    if (!isObject(nodeProperties)) return this.nodeJson(node, catalogDefs);
    const nodeRequired = new Set(Array.isArray(node['required']) ? node['required'] : []);
    const properties: JsonObject = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(nodeProperties)) {
      if (!keep(key)) continue;
      properties[key] = this.nodeJson(isObject(value) ? value : {}, catalogDefs);
      if (nodeRequired.has(key)) required.push(key);
    }
    const result: JsonObject = {type: 'object', properties};
    const order = annotation.required?.filter(key => required.includes(key));
    const unordered = required.filter(key => !order?.includes(key));
    if (required.length > 0) result['required'] = order ? [...order, ...unordered] : required;
    const additional = node['additionalProperties'];
    const keyword = annotation.closure ?? (additional === false ? 'additionalProperties' : 'none');
    if (isObject(additional)) {
      result[keyword === 'none' ? 'additionalProperties' : keyword] = this.nodeJson(
        additional,
        catalogDefs,
      );
    } else if (keyword !== 'none') {
      result[keyword] = additional === true;
    }
    return result;
  }
}

/** The keywords a catalog document writes for a string. */
const STRING_KEYWORDS = new Set(['pattern', 'minLength', 'maxLength', 'format']);

/** The keywords a catalog document writes for a number. */
const NUMBER_KEYWORDS = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']);

/** Copies `keywords` of `node` onto `result`, in the node's order. */
function pickKeywords(
  node: JsonObject,
  result: JsonObject,
  keywords: ReadonlySet<string>,
): JsonObject {
  for (const [key, value] of Object.entries(node)) {
    if (keywords.has(key)) result[key] = value;
  }
  return result;
}

/** Returns a node without `keys`, keeping the annotation it holds. */
function withoutKeys(node: JsonObject, keys: readonly string[]): JsonObject {
  const result: Record<string | symbol, unknown> = {...node};
  for (const key of keys) delete result[key];
  return result as JsonObject;
}

/** Returns the description of a node, unless it has none. */
function plainDescription(node: JsonObject): string | undefined {
  const description = node['description'];
  return typeof description === 'string' ? description : undefined;
}

/** Copies a node the shaper has no rule for, without its own definitions. */
function fallbackJson(node: JsonObject): JsonObject {
  const json = structuredClone(node) as JsonObject;
  delete json['definitions'];
  delete json['$defs'];
  return json;
}
