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

/**
 * The JSON Schema view of an `A2uiSchema`, which web_core reads to bind,
 * serialize and inspect catalog entries without depending on the library the
 * schema was built with.
 *
 * In this view, A2UI types such as `DynamicString`, `Action`, `ComponentId`
 * or `ChildList` appear as `$ref`s to their definitions, such as
 * `common_types.json#/$defs/DynamicString`, or `#/$defs/<name>` for a
 * definition of the catalog document. Only the name the reference ends with
 * matters to web_core.
 */

import {
  libraryOptionsFor,
  normalizeSchema,
  type A2uiSchema,
  type EntrySchema,
  type InspectableSchema,
} from './a2ui_schema.js';
import {SPEC_KEYWORD, type JsonSchemaObject, type SpecAnnotation} from './spec_annotations.js';

const views = new WeakMap<object, JsonSchemaObject>();
const expandedReferenceViews = new WeakMap<object, JsonSchemaObject>();
const specViews = new WeakMap<object, JsonSchemaObject>();

/** Options controlling how the JSON Schema view represents references. */
export interface A2uiJsonSchemaOptions {
  /**
   * Whether a schema that names a definition keeps its constraints beside
   * the `$ref`, unless the definition is one web_core reads by name.
   */
  readonly expandReferences?: boolean;
  /**
   * Whether the view is the one `SpecShaper` writes catalog documents from.
   * See `specJsonSchemaOf`.
   *
   * @internal
   */
  readonly forSpec?: boolean;
}

/**
 * The key under which a node of a spec view (see `specJsonSchemaOf`) holds
 * the `specMeta()` annotation of the schema it was converted from. It is a
 * symbol, so that it is neither written to JSON nor copied by
 * `structuredClone`.
 */
export const SPEC_ANNOTATION: unique symbol = Symbol('a2ui.specAnnotation');

/** Returns the `specMeta()` annotation a node of a spec view holds, if any. */
export function specAnnotationOf(node: unknown): SpecAnnotation | undefined {
  return isJsonObject(node)
    ? ((node as Record<symbol, unknown>)[SPEC_ANNOTATION] as SpecAnnotation | undefined)
    : undefined;
}

/**
 * Returns the JSON Schema view `SpecShaper` writes a catalog document from,
 * computed once and deeply frozen.
 *
 * It is the JSON Schema view of the schema, except that a node holds the
 * `specMeta()` annotation of the schema it was converted from under
 * `SPEC_ANNOTATION`, an object that accepts any unknown key is written with
 * `additionalProperties: true`, and an integer the library bounds only by the
 * safe integers is left unbounded.
 *
 * @param schema The schema.
 */
export function specJsonSchemaOf(schema: EntrySchema): JsonSchemaObject {
  let view = specViews.get(schema as object);
  if (!view) {
    view = deepFreeze(convert(schema, {forSpec: true}));
    specViews.set(schema as object, view);
  }
  return view;
}

/**
 * Returns the JSON Schema view of a schema, computed once and deeply frozen.
 *
 * A schema implementing Standard JSON Schema, or a JSON Schema object, is
 * converted with `normalizeSchema`, targeting draft 2020-12. The keywords a
 * `specMeta()` annotation adds to a schema are written with it. A schema that
 * names its definition, such as with Zod 4's `.meta({$ref})`, is the bare
 * `$ref` by default; callers that need its constraints for inspection can
 * request `expandReferences` explicitly.
 *
 * @throws A2uiCatalogError when the schema cannot be converted.
 */
export function a2uiJsonSchemaOf(
  schema: EntrySchema,
  options: A2uiJsonSchemaOptions = {},
): JsonSchemaObject {
  const computeJson = definitionJsons.get(schema as object);
  if (computeJson) {
    let json = computedDefinitionJsons.get(schema as object);
    if (!json) {
      json = deepFreeze(computeJson());
      computedDefinitionJsons.set(schema as object, json);
    }
    return json;
  }
  const cache = options.expandReferences ? expandedReferenceViews : views;
  let view = cache.get(schema as object);
  if (!view) {
    view = deepFreeze(convert(schema, options));
    cache.set(schema as object, view);
  }
  return view;
}

/**
 * The inspection views of the schemas compiled from a catalog definition,
 * computed from that definition on first use, by compiled schema.
 */
const definitionViews = new WeakMap<object, () => JsonSchemaObject>();
const computedDefinitionViews = new WeakMap<object, JsonSchemaObject>();

/**
 * The JSON Schema views of the schemas compiled from a catalog definition,
 * computed from that definition on first use, by compiled schema.
 */
const definitionJsons = new WeakMap<object, () => JsonSchemaObject>();
const computedDefinitionJsons = new WeakMap<object, JsonSchemaObject>();

/**
 * Records that `schema` was compiled from a catalog definition, and how to
 * compute the views of that definition: the one `inspectionSchemaOf` returns
 * for it, and its JSON Schema view, which `a2uiJsonSchemaOf` returns for it
 * instead of converting the compiled schema.
 *
 * @param schema The compiled schema.
 * @param computeView Computes the definition's inspection view.
 * @param computeJson Computes the definition's JSON Schema view.
 */
export function setDefinitionView(
  schema: object,
  computeView: () => JsonSchemaObject,
  computeJson?: () => JsonSchemaObject,
): void {
  definitionViews.set(schema, computeView);
  if (computeJson) definitionJsons.set(schema, computeJson);
}

/** Whether `schema` was compiled from a catalog definition web_core inspects it through. */
export function hasDefinitionView(schema: object): boolean {
  return definitionViews.has(schema);
}

/**
 * Returns the JSON Schema view web_core inspects a schema through, to bind
 * its properties and find its child references and known keys.
 *
 * A schema the catalog loader compiled from a definition is inspected
 * through that definition, so what the binder sees does not depend on how the
 * validator was built. Any other schema is inspected through its own JSON
 * Schema view (see `a2uiJsonSchemaOf`).
 *
 * @param schema The schema to inspect.
 * @returns The view, computed once and deeply frozen.
 */
export function inspectionSchemaOf(schema: InspectableSchema): JsonSchemaObject {
  const computeView = definitionViews.get(schema as object);
  if (!computeView) return a2uiJsonSchemaOf(schema as EntrySchema);
  let view = computedDefinitionViews.get(schema as object);
  if (!view) {
    view = deepFreeze(computeView());
    computedDefinitionViews.set(schema as object, view);
  }
  return view;
}

/** Returns a mutable copy of the JSON Schema view of a schema. */
export function copyA2uiJsonSchemaOf(
  schema: EntrySchema,
  options: A2uiJsonSchemaOptions = {},
): Record<string, unknown> {
  return structuredClone(a2uiJsonSchemaOf(schema, options)) as Record<string, unknown>;
}

function convert(schema: EntrySchema, options: A2uiJsonSchemaOptions): Record<string, unknown> {
  // A schema implementing Standard JSON Schema, or a JSON Schema object, is
  // read through `normalizeSchema`, which throws for a Standard Schema that
  // implements no JSON Schema conversion.
  const libraryOptions = options.expandReferences ? EXPANDING_LIBRARY_OPTIONS : undefined;
  return liftSpecKeywords(normalizeSchema(schema as A2uiSchema, libraryOptions), options) as Record<
    string,
    unknown
  >;
}

/** The largest and smallest integers some libraries write as an integer's bounds. */
const SAFE_INTEGER_BOUNDS: Readonly<Record<string, number>> = {
  minimum: Number.MIN_SAFE_INTEGER,
  maximum: Number.MAX_SAFE_INTEGER,
};

/**
 * Returns a copy of the JSON Schema of a schema, with the annotation each
 * node carries under `SPEC_KEYWORD` read out of it: the keyword is removed
 * and the keywords the annotation adds are written. A spec view also holds the annotation under
 * `SPEC_ANNOTATION`, writes an object that accepts any unknown key as
 * `additionalProperties: true`, and leaves out the safe-integer bounds a
 * library writes for an integer it does not bound.
 */
function liftSpecKeywords(value: unknown, options: A2uiJsonSchemaOptions): unknown {
  if (Array.isArray(value)) return value.map(item => liftSpecKeywords(item, options));
  if (!isJsonObject(value)) return value;
  const result: Record<string | symbol, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== SPEC_KEYWORD) result[key] = liftSpecKeywords(child, options);
  }
  const annotation = value[SPEC_KEYWORD] as SpecAnnotation | undefined;
  if (isJsonObject(annotation) && isJsonObject(annotation.keywords)) {
    Object.assign(result, structuredClone(annotation.keywords));
  }
  if (options.forSpec) {
    if (isJsonObject(annotation)) result[SPEC_ANNOTATION] = annotation;
    const additional = result['additionalProperties'];
    if (isJsonObject(additional) && Object.keys(additional).length === 0) {
      result['additionalProperties'] = true;
    }
    if (result['type'] === 'integer') {
      for (const [bound, limit] of Object.entries(SAFE_INTEGER_BOUNDS)) {
        if (result[bound] === limit) delete result[bound];
      }
    }
  }
  return result;
}

/**
 * The local definitions whose name alone tells what a value referring to them
 * is, so that the JSON Schema view is the bare `$ref`. Expanding them would
 * also recurse: a `FunctionCall`'s arguments are dynamic values, which may
 * be function calls.
 */
const OPAQUE_DEFS =
  /^(Dynamic.*|DataBinding|FunctionCall|ComponentId|ChildList|Action|CheckRule|Checkable)$/;

/**
 * Converter options that keep the contents of a schema naming a definition
 * that is not opaque, for a view that expands references.
 */
const EXPANDING_LIBRARY_OPTIONS = libraryOptionsFor(
  ref => !OPAQUE_DEFS.test(refDefName({$ref: ref})),
);

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Returns the name of the definition a JSON Schema `$ref` points to, such as
 * `DynamicString` for `common_types.json#/$defs/DynamicString`, or an empty
 * string when the node has no `$ref`.
 */
export function refDefName(node: unknown): string {
  const ref = isJsonObject(node) ? node['$ref'] : undefined;
  if (typeof ref !== 'string') return '';
  const hash = ref.lastIndexOf('#');
  const segments = (hash === -1 ? ref : ref.slice(hash + 1)).split('/').filter(Boolean);
  return segments.pop() ?? '';
}

/** Whether a value is a JSON object (not an array). */
export function isJsonObject(value: unknown): value is JsonSchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the members of a node that only wraps one or more schemas without
 * constraining them further: the branches of `anyOf` / `oneOf` other than
 * `null`, and the non-empty members of `allOf`. Returns `[node]` for any other
 * node.
 */
export function unwrapJsonSchema(node: JsonSchemaObject): JsonSchemaObject[] {
  const allOf = node['allOf'];
  if (Array.isArray(allOf) && node['$ref'] === undefined) {
    const members = allOf.filter(m => isJsonObject(m) && Object.keys(m).length > 0);
    if (members.length === 1) return unwrapJsonSchema(members[0] as JsonSchemaObject);
  }
  return [node];
}

/**
 * Returns the branches of a union node (`anyOf` or `oneOf`), without the
 * branches that only make it nullable or optional (`{type: 'null'}`, and
 * `{not: {}}`, which matches nothing), or `undefined` for a node that is not
 * a union.
 */
export function unionBranches(node: JsonSchemaObject): JsonSchemaObject[] | undefined {
  const branches = node['anyOf'] ?? node['oneOf'];
  if (!Array.isArray(branches)) return undefined;
  return branches.filter((b): b is JsonSchemaObject => isJsonObject(b) && !isEmptyBranch(b));
}

function isEmptyBranch(node: JsonSchemaObject): boolean {
  const keys = Object.keys(node);
  if (keys.length !== 1) return false;
  if (keys[0] === 'type') return node['type'] === 'null';
  return keys[0] === 'not' && isJsonObject(node['not']) && Object.keys(node['not']).length === 0;
}

/**
 * Returns the schema a node stands for once a nullable union with a single
 * other branch, or an `allOf` with a single non-empty member, is unwrapped.
 */
export function coreJsonSchema(node: JsonSchemaObject): JsonSchemaObject {
  let current = unwrapJsonSchema(node)[0];
  const branches = unionBranches(current);
  if (branches && branches.length === 1 && current['$ref'] === undefined) {
    current = coreJsonSchema(branches[0]);
  }
  return current;
}

/** Returns the properties of an object node, or `undefined` for any other node. */
export function objectProperties(
  node: JsonSchemaObject,
): Record<string, JsonSchemaObject> | undefined {
  const properties = node['properties'];
  return isJsonObject(properties) ? (properties as Record<string, JsonSchemaObject>) : undefined;
}

/** Returns the element schema of an array node, or `undefined` for any other node. */
export function arrayItems(node: JsonSchemaObject): JsonSchemaObject | undefined {
  if (node['type'] !== 'array') return undefined;
  const items = node['items'];
  return isJsonObject(items) ? items : {};
}

/**
 * Names of the definitions a single child reference refers to: `ComponentId`,
 * and the aliases catalog documents declare for it, such as the v1.0 basic
 * catalog's `Child`.
 */
export const COMPONENT_ID_DEF_NAMES: ReadonlySet<string> = new Set([
  'ComponentId',
  'Child',
  'ChildComponentId',
]);

/** Names of the definitions a list of child references refers to. */
export const CHILD_LIST_DEF_NAMES: ReadonlySet<string> = new Set([
  'ChildList',
  'TemplateChildList',
]);
