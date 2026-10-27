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
 * @fileoverview JSON Schema rewrites for converters that support a subset of
 * the keywords catalog documents use.
 */

import {canonicalJsonStringify, deepCopyJson} from './json.js';

type JsonObject = Record<string, unknown>;

/** How many alternatives a closed union may expand to before staying open. */
const MAX_ALTERNATIVES = 256;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keywords whose value is one subschema. */
const SCHEMA_KEYS = new Set([
  'items',
  'additionalItems',
  'additionalProperties',
  'unevaluatedItems',
  'unevaluatedProperties',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
]);

/** Keywords whose value is a list of subschemas. */
const SCHEMA_LIST_KEYS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems', 'items']);

/**
 * Keywords whose value maps names to subschemas, including the `components`
 * and `functions` sections of a bundled catalog schema.
 */
const SCHEMA_MAP_KEYS = new Set([
  'properties',
  'patternProperties',
  'dependentSchemas',
  '$defs',
  'definitions',
  'components',
  'functions',
]);

/**
 * Calls `visit` on a schema and on every subschema it holds, parents first.
 * Values that are data rather than schemas, such as `const`, `enum`,
 * `default` or a property map itself, are never visited, so a property named
 * like a keyword is left alone. Subschemas `visit` adds are visited too.
 */
function visitSchemas(
  schema: unknown,
  visit: (node: JsonObject) => void,
  seen: Set<object> = new Set(),
): void {
  if (!isObject(schema) || seen.has(schema)) return;
  seen.add(schema);
  visit(schema);
  for (const [key, value] of Object.entries(schema)) {
    if (Array.isArray(value) && SCHEMA_LIST_KEYS.has(key)) {
      for (const item of value) visitSchemas(item, visit, seen);
    } else if (isObject(value) && SCHEMA_MAP_KEYS.has(key)) {
      for (const item of Object.values(value)) visitSchemas(item, visit, seen);
    } else if (SCHEMA_KEYS.has(key)) {
      visitSchemas(value, visit, seen);
    }
  }
}

/** Resolves a local `#/...` pointer against `root`. */
function resolveLocal(root: JsonObject, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let current: unknown = root;
  for (const raw of ref.slice(2).split('/')) {
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Every union of one set from each list, or `undefined` past the limit. */
function combine(left: Set<string>[], right: Set<string>[]): Set<string>[] | undefined {
  if (left.length * right.length > MAX_ALTERNATIVES) return undefined;
  return left.flatMap(a => right.map(b => new Set([...a, ...b])));
}

/**
 * Returns the sets of property names a schema can evaluate, one set per way
 * it can match: its own `properties`, those of every `allOf` member, and
 * those of one `oneOf` or `anyOf` branch. Returns `undefined` when they cannot
 * be listed, such as with `patternProperties` or an unresolvable reference.
 */
function evaluatedKeys(
  schema: unknown,
  root: JsonObject,
  visiting: ReadonlySet<string>,
): Set<string>[] | undefined {
  if (schema === true || (isObject(schema) && Object.keys(schema).length === 0)) {
    return [new Set()];
  }
  if (!isObject(schema)) return [new Set()];
  if ('patternProperties' in schema || 'if' in schema || 'dependentSchemas' in schema) {
    return undefined;
  }

  let alternatives: Set<string>[] | undefined = [
    new Set(isObject(schema['properties']) ? Object.keys(schema['properties']) : []),
  ];
  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    if (visiting.has(ref)) return undefined;
    const target = resolveLocal(root, ref);
    if (target === undefined) return undefined;
    const referenced = evaluatedKeys(target, root, new Set(visiting).add(ref));
    alternatives = referenced && combine(alternatives, referenced);
  }
  for (const member of Array.isArray(schema['allOf']) ? schema['allOf'] : []) {
    if (!alternatives) return undefined;
    const memberKeys = evaluatedKeys(member, root, visiting);
    alternatives = memberKeys && combine(alternatives, memberKeys);
  }
  for (const key of ['oneOf', 'anyOf']) {
    const branches = schema[key];
    if (!alternatives || !Array.isArray(branches)) continue;
    const branchKeys: Set<string>[] = [];
    for (const branch of branches) {
      const keys = evaluatedKeys(branch, root, visiting);
      if (!keys) return undefined;
      branchKeys.push(...keys);
    }
    alternatives = combine(alternatives, branchKeys);
  }
  return alternatives;
}

/** Closes `node` over the property names of one alternative. */
function closedOver(keys: ReadonlySet<string>, closure: unknown): JsonObject {
  return {
    properties: Object.fromEntries([...keys].map(key => [key, {}])),
    additionalProperties: closure,
  };
}

/**
 * Rewrites a schema's `unevaluatedProperties` as `additionalProperties`, in
 * place.
 *
 * A schema that closes itself with `unevaluatedProperties` accepts only the
 * properties its own `properties`, its `allOf` members and the `oneOf` or
 * `anyOf` branch that matches evaluate. That becomes `additionalProperties`
 * over those names, with one alternative per way the schema can match. A
 * schema whose evaluated names cannot be listed stays open.
 */
function closeUnevaluated(node: JsonObject, root: JsonObject): void {
  if (!('unevaluatedProperties' in node)) return;
  const closure = node['unevaluatedProperties'];
  delete node['unevaluatedProperties'];
  const open = closure === true || (isObject(closure) && Object.keys(closure).length === 0);
  const alternatives = open ? undefined : evaluatedKeys(node, root, new Set());
  if (alternatives?.length === 1) {
    const properties = isObject(node['properties']) ? node['properties'] : {};
    for (const key of alternatives[0]) {
      if (!(key in properties)) properties[key] = {};
    }
    node['properties'] = properties;
    node['additionalProperties'] = closure;
  } else if (alternatives && alternatives.length > 1) {
    const allOf = Array.isArray(node['allOf']) ? node['allOf'] : [];
    node['allOf'] = [...allOf, {anyOf: alternatives.map(keys => closedOver(keys, closure))}];
  }
}

/**
 * Returns a copy of a self-contained JSON Schema without
 * `unevaluatedProperties`, for converters that do not support the keyword,
 * such as Zod 4's `z.fromJSONSchema`. Local references resolve against the
 * schema itself.
 *
 * @param schema A schema whose references are all local.
 */
export function withoutUnevaluatedProperties<T extends JsonObject>(schema: T): T {
  const copy = deepCopyJson(schema);
  visitSchemas(copy, node => closeUnevaluated(node, copy));
  return copy;
}

/** Every JSON Schema type. */
const JSON_TYPES = ['string', 'number', 'integer', 'boolean', 'null', 'array', 'object'];

/** Rewrites one negated schema into `node`, or returns false when it cannot. */
function applyNegation(node: JsonObject, negated: unknown): boolean {
  if (!isObject(negated)) return false;
  const keys = Object.keys(negated);
  if (keys.length === 0) return false;
  if (keys.every(key => key === 'anyOf') && Array.isArray(negated['anyOf'])) {
    // not (A or B) is (not A) and (not B).
    return negated['anyOf'].every(member => applyNegation(node, member));
  }
  if (keys.every(key => key === 'required') && Array.isArray(negated['required'])) {
    const names = negated['required'].filter((name): name is string => typeof name === 'string');
    const absent = names.map(name => ({properties: {[name]: false}}));
    if (absent.length === 1) {
      const properties = isObject(node['properties']) ? node['properties'] : {};
      properties[names[0]] = false;
      node['properties'] = properties;
    } else {
      // Not every name is present: at least one is absent.
      node['allOf'] = [...(Array.isArray(node['allOf']) ? node['allOf'] : []), {anyOf: absent}];
    }
    return true;
  }
  if (keys.every(key => key === 'type') && negated['type'] !== undefined) {
    const excluded = new Set(([] as unknown[]).concat(negated['type']));
    if (excluded.has('number')) excluded.add('integer');
    const remaining = JSON_TYPES.filter(type => !excluded.has(type));
    node['allOf'] = [...(Array.isArray(node['allOf']) ? node['allOf'] : []), {type: remaining}];
    return true;
  }
  if (keys.every(key => key === 'pattern') && typeof negated['pattern'] === 'string') {
    const pattern = `^(?!(?:${negated['pattern']}))`;
    if (typeof node['pattern'] === 'string') {
      node['allOf'] = [...(Array.isArray(node['allOf']) ? node['allOf'] : []), {pattern}];
    } else {
      node['pattern'] = pattern;
    }
    return true;
  }
  return false;
}

function removeNegation(node: JsonObject): void {
  const negated = node['not'];
  if (negated === undefined || (isObject(negated) && Object.keys(negated).length === 0)) return;
  delete node['not'];
  // A negation with no equivalent is dropped, which accepts more values.
  applyNegation(node, negated);
}

/**
 * Returns a copy of a schema without `not`, for converters that support only
 * `{not: {}}`, such as Zod 4's `z.fromJSONSchema`.
 *
 * `not` over required names becomes properties that must be absent, `not`
 * over a pattern becomes a negative lookahead, `not` over types becomes the
 * other types, and `not` over `anyOf` becomes one negation per member. Any other negation is dropped, so the copy accepts
 * more values than the schema.
 *
 * @param schema The schema to rewrite.
 */
export function withoutNegations<T extends JsonObject>(schema: T): T {
  const copy = deepCopyJson(schema);
  visitSchemas(copy, removeNegation);
  return copy;
}

/** Prefixes of the definitions `withRefsUnderDefs` moves sections to. */
const SECTION_PREFIXES: Readonly<Record<string, string>> = {
  components: '__component__',
  functions: '__function__',
};

function moveRef(node: JsonObject): void {
  const ref = node['$ref'];
  if (typeof ref !== 'string') return;
  for (const [section, prefix] of Object.entries(SECTION_PREFIXES)) {
    if (ref.startsWith(`#/${section}/`)) {
      node['$ref'] = `#/$defs/${prefix}${ref.slice(`#/${section}/`.length)}`;
    }
  }
}

/**
 * Returns a copy of a bundled catalog schema whose `components` and
 * `functions` sections are definitions under `$defs`, for converters that
 * resolve references only into `$defs`, such as Zod 4's `z.fromJSONSchema`.
 * A reference such as `#/functions/required` becomes
 * `#/$defs/__function__required`.
 *
 * @param schema A schema whose references are all local.
 */
export function withRefsUnderDefs<T extends JsonObject>(schema: T): T {
  const copy = deepCopyJson(schema) as JsonObject;
  const defs: JsonObject = isObject(copy['$defs']) ? copy['$defs'] : {};
  for (const [section, prefix] of Object.entries(SECTION_PREFIXES)) {
    const entries = copy[section];
    if (!isObject(entries)) continue;
    for (const [name, definition] of Object.entries(entries)) defs[`${prefix}${name}`] = definition;
    delete copy[section];
  }
  copy['$defs'] = defs;
  visitSchemas(copy, moveRef);
  return copy as T;
}

function removeConditional(node: JsonObject): void {
  if (!('if' in node)) return;
  const condition = node['if'];
  const then = node['then'];
  const otherwise = node['else'];
  delete node['if'];
  delete node['then'];
  delete node['else'];
  // (if and then) or (not if and else); a missing branch accepts anything.
  node['allOf'] = [
    ...(Array.isArray(node['allOf']) ? node['allOf'] : []),
    {
      anyOf: [{allOf: [condition, then ?? {}]}, {allOf: [{not: condition}, otherwise ?? {}]}],
    },
  ];
}

/**
 * Returns a copy of a schema without `if`, `then` and `else`, for converters
 * that do not support them, such as Zod 4's `z.fromJSONSchema`. A conditional
 * becomes "the condition and `then`, or not the condition and `else`". Run
 * `withoutNegations` on the result to remove the negated condition.
 *
 * @param schema The schema to rewrite.
 */
export function withoutConditionals<T extends JsonObject>(schema: T): T {
  const copy = deepCopyJson(schema);
  visitSchemas(copy, removeConditional);
  return copy;
}

/** Whether a branch only lists required property names. */
function isRequiredOnly(branch: unknown): branch is {required: unknown[]} {
  return (
    isObject(branch) &&
    Array.isArray(branch['required']) &&
    Object.keys(branch).every(key => key === 'required' || key === 'description')
  );
}

function expandRequiredBranches(node: JsonObject): void {
  const isObjectSchema = node['type'] === 'object' || isObject(node['properties']);
  for (const key of ['anyOf', 'oneOf']) {
    const branches = node[key];
    if (!isObjectSchema || !Array.isArray(branches) || !branches.every(isRequiredOnly)) continue;
    const {[key]: _branches, $defs, definitions, $schema, ...shape} = node;
    const required = Array.isArray(shape['required']) ? shape['required'] : [];
    for (const name of Object.keys(node)) delete node[name];
    // Definitions stay where references resolve them.
    if ($defs !== undefined) node['$defs'] = $defs;
    if (definitions !== undefined) node['definitions'] = definitions;
    if ($schema !== undefined) node['$schema'] = $schema;
    node[key] = branches.map(branch => ({
      ...deepCopyJson(shape),
      required: [...new Set([...required, ...branch.required])],
    }));
  }
}

/**
 * Returns a copy of a schema whose `anyOf` and `oneOf` branches that only list
 * required names, beside an object schema, each repeat that object schema.
 * Converters such as Zod 4's `z.fromJSONSchema` read a branch without a type
 * as accepting anything, which would drop the requirement.
 *
 * @param schema The schema to rewrite.
 */
export function withRequiredBranchesExpanded<T extends JsonObject>(schema: T): T {
  const copy = deepCopyJson(schema);
  visitSchemas(copy, expandRequiredBranches);
  return copy;
}

function removeUnicodePropertyPatterns(node: JsonObject): void {
  const patterns = node['patternProperties'];
  if (isObject(patterns) && Object.keys(patterns).some(pattern => pattern.includes('\\p{'))) {
    // The names cannot be checked, so the object accepts any name.
    delete node['patternProperties'];
    if (node['additionalProperties'] === false) delete node['additionalProperties'];
  }
  if (typeof node['pattern'] === 'string' && node['pattern'].includes('\\p{')) {
    delete node['pattern'];
  }
}

/**
 * Returns a copy of a schema without patterns that use Unicode property
 * escapes (`\\p{...}`), for converters that build regular expressions without
 * the `u` flag, such as Zod 4's `z.fromJSONSchema`. The copy accepts any value
 * those patterns would have checked.
 *
 * @param schema The schema to rewrite.
 */
export function withoutUnicodePropertyPatterns<T extends JsonObject>(schema: T): T {
  const copy = deepCopyJson(schema);
  visitSchemas(copy, removeUnicodePropertyPatterns);
  return copy;
}

function mergeIdenticalOneOfBranches(node: JsonObject): void {
  const branches = node['oneOf'];
  if (!Array.isArray(branches)) return;
  // Branches that only differed by their format are now the same schema,
  // and exactly one of identical branches can never match.
  const seenBranches = new Set<string>();
  node['oneOf'] = branches.filter(branch => {
    const text = canonicalJsonStringify(branch);
    if (seenBranches.has(text)) return false;
    seenBranches.add(text);
    return true;
  });
}

/**
 * Returns a copy of a schema without `format`, which JSON Schema 2020-12 reads
 * as an annotation rather than an assertion, for converters that assert it,
 * such as Zod 4's `z.fromJSONSchema`. `oneOf` branches that become identical
 * are merged into one.
 *
 * @param schema The schema to rewrite.
 */
export function withoutFormatAssertions<T extends JsonObject>(schema: T): T {
  const copy = deepCopyJson(schema);
  visitSchemas(copy, node => {
    delete node['format'];
  });
  visitSchemas(copy, mergeIdenticalOneOfBranches);
  return copy;
}

/**
 * Returns a copy of a bundled schema that converters supporting only a subset
 * of JSON Schema, such as Zod 4's `z.fromJSONSchema`, can read: sections under
 * `$defs`; no `unevaluatedProperties`, conditionals, negations, Unicode
 * property patterns or format assertions; and required-name branches that
 * repeat their object.
 *
 * @param schema A schema whose references are all local.
 */
export function forSubsetConverters<T extends JsonObject>(schema: T): T {
  return withRequiredBranchesExpanded(
    withoutFormatAssertions(
      withoutUnicodePropertyPatterns(
        withoutNegations(
          withoutConditionals(withoutUnevaluatedProperties(withRefsUnderDefs(schema))),
        ),
      ),
    ),
  );
}
