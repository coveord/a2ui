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

import type {z} from 'zod/v3';
import {zodToJsonSchema, type OverrideCallback} from 'zod-to-json-schema';

import {
  normalizeSchema,
  zod3SchemaOf,
  type A2uiSchema,
  type EntrySchema,
  type InspectableSchema,
} from './a2ui_schema.js';
import {exclusiveUnionOverride} from './exclusive_union.js';
import {getSpecAnnotationOfDef, type JsonSchemaObject} from './spec_annotations.js';

/** The common types definitions that a schema marked with `markChildRef` refers to. */
const CHILD_REF_TARGETS: Readonly<Record<string, string>> = {
  'component-id': 'common_types.json#/$defs/ComponentId',
  'child-list': 'common_types.json#/$defs/ChildList',
};

const views = new WeakMap<object, JsonSchemaObject>();
const expandedReferenceViews = new WeakMap<object, JsonSchemaObject>();

/** Options controlling how the JSON Schema view represents references. */
export interface A2uiJsonSchemaOptions {
  /** Whether Zod 3 `REF:` markers retain their converted constraints beside the `$ref`. */
  readonly expandReferences?: boolean;
}

/**
 * Returns the JSON Schema view of a schema, computed once and deeply frozen.
 *
 * A schema implementing Standard JSON Schema, or a JSON Schema object, is
 * converted with `normalizeSchema`, targeting draft 2020-12. A Zod 3 schema,
 * which does not implement it, is converted with `zod-to-json-schema`: its
 * `REF:<ref>|<description>` description markers and its `markChildRef` marks
 * become `$ref`s, and a union made with `exclusiveUnion` becomes a `oneOf`.
 * The keywords a `spec()` annotation adds to a schema are written with it. A
 * node with a `$ref` to a `$defs` entry is bare by default; callers that
 * need the converted constraints for inspection can request
 * `expandReferences` explicitly.
 *
 * @throws A2uiCatalogError when the schema can be converted neither way.
 */
export function a2uiJsonSchemaOf(
  schema: EntrySchema,
  options: A2uiJsonSchemaOptions = {},
): JsonSchemaObject {
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
 * Records that `schema` was compiled from a catalog definition, and how to
 * compute the view of that definition that `inspectionSchemaOf` returns for
 * it.
 *
 * @param schema The compiled schema.
 * @param computeView Computes the definition's view.
 */
export function setDefinitionView(schema: object, computeView: () => JsonSchemaObject): void {
  definitionViews.set(schema, computeView);
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
  const zod3 = zod3SchemaOf(schema);
  if (zod3) return zod3ToJsonSchema(zod3, options);
  // A schema implementing Standard JSON Schema, or a JSON Schema object, is
  // read through `normalizeSchema`, which throws for a Standard Schema that
  // implements no JSON Schema conversion.
  return {...(normalizeSchema(schema as A2uiSchema) as Record<string, unknown>)};
}

/**
 * Converts a Zod 3 schema into its JSON Schema view.
 *
 * @internal
 */
export function zod3ToJsonSchema(
  schema: z.ZodTypeAny,
  options: A2uiJsonSchemaOptions = {},
): Record<string, unknown> {
  const json = zodToJsonSchema(schema, {
    target: 'jsonSchema2019-09',
    $refStrategy: 'none',
    override: createA2uiOverride(options),
    postProcess: (json, def) => {
      const keywords = getSpecAnnotationOfDef(def)?.keywords;
      return json && keywords ? ({...json, ...keywords} as typeof json) : json;
    },
  }) as Record<string, unknown>;
  delete json['$schema'];
  markersToRefs(json);
  return json;
}

/**
 * The local definitions whose name alone tells what a value referring to them
 * is, so that the JSON Schema view is the bare `$ref`. Expanding them would
 * also recurse: a `FunctionCall`'s arguments are dynamic values, which may
 * be function calls.
 */
const OPAQUE_DEFS =
  /^(Dynamic.*|DataBinding|FunctionCall|ComponentId|ChildList|Action|CheckRule|Checkable)$/;

/** Whether a `REF:` marker points to a named JSON Schema definition. */
function isDefinitionRef(ref: string): boolean {
  return ref.includes('#/$defs/');
}

/** The Zod 3 types that wrap another schema. */
const WRAPPERS = new Set([
  'ZodOptional',
  'ZodNullable',
  'ZodDefault',
  'ZodCatch',
  'ZodReadonly',
  'ZodBranded',
  'ZodLazy',
]);

/** Returns the reference a `REF:<ref>|<description>` marker holds, if it is one. */
function markerRef(description: unknown): string | undefined {
  if (typeof description !== 'string' || !description.startsWith('REF:')) return undefined;
  const content = description.substring(4);
  const pipe = content.indexOf('|');
  return pipe === -1 ? content : content.substring(0, pipe);
}

/**
 * Stops at a schema described with a `REF:` marker to an opaque definition,
 * or marked with `markChildRef`, and writes a union made with
 * `exclusiveUnion` as `oneOf`.
 */
const createA2uiOverride =
  ({expandReferences}: A2uiJsonSchemaOptions): OverrideCallback =>
  (def, refs, seen, forceResolution) => {
    const description = (def as {description?: string}).description;
    const ref = markerRef(description);
    // Wrappers such as `.optional()` and `.default()` copy the description of
    // the schema they wrap, and are converted as usual so that they keep their
    // own keywords, such as `default`.
    const isWrapper = WRAPPERS.has((def as {typeName?: string}).typeName ?? '');
    if (ref !== undefined) {
      if (
        !expandReferences &&
        !isWrapper &&
        (isDefinitionRef(ref) || OPAQUE_DEFS.test(refDefName({$ref: ref})))
      ) {
        return {description};
      }
    } else {
      const childRef = (def as {a2uiChildRef?: string}).a2uiChildRef;
      const target = childRef === undefined ? undefined : CHILD_REF_TARGETS[childRef];
      if (target !== undefined && !isWrapper) {
        return description === undefined ? {$ref: target} : {$ref: target, description};
      }
    }
    return exclusiveUnionOverride(def, refs, seen, forceResolution);
  };

/**
 * Replaces the `REF:<ref>|<description>` marker of each node with a `$ref` to
 * `<ref>` and the marker's description, keeping the node's structure.
 */
function markersToRefs(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) markersToRefs(item);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const obj = node as Record<string, unknown>;
  const description = obj['description'];
  const ref = markerRef(description);
  if (ref !== undefined) {
    const prose = (description as string).substring(4 + ref.length + 1);
    delete obj['description'];
    obj['$ref'] = ref;
    if (prose) obj['description'] = prose;
  }
  for (const value of Object.values(obj)) markersToRefs(value);
}

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
