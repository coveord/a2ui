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

import {z} from 'zod';

import {isAtLeastVersion} from '@a2ui/web_core_v1_0';
import {CommonSchemas, ComponentCommonSchema} from '../types/common-types.js';
import {exclusiveUnion} from './exclusive_union.js';
import {
  canonicalJsonStringify,
  isComponentEnvelopeField,
  isShorthandParameterMap,
  loadCatalogDocument,
  PeerScope,
  resolveJsonPointer,
  resolvePeerTarget,
  throwUnresolvableRef,
  type CatalogEntryConverters,
  type LoadedCatalogDocument,
  type PeerCatalogSource,
} from '@a2ui/web_core_v1_0/catalog';

/**
 * Zod schemas converted for one catalog entry, keyed by the document-scoped
 * key of the reference they were converted from, together with the peer
 * catalogs the entry's cross-catalog references resolve against.
 */
class ConversionCache extends Map<string, z.ZodTypeAny> {
  readonly scope: PeerScope;

  constructor(peers: readonly PeerCatalogSource[] = []) {
    super();
    this.scope = new PeerScope(peers);
  }
}

/**
 * Resolves a standard protocol `$ref` to its corresponding common type schema.
 *
 * @param ref JSON Schema reference string.
 * @returns The matching Zod schema, or undefined if not a known protocol definition.
 */
function resolveProtocolRef(ref: string): z.ZodTypeAny | undefined {
  const defName = ref.split(/#\/(?:\$defs|definitions)\//)[1];
  return defName && Object.hasOwn(CommonSchemas, defName)
    ? (CommonSchemas as Record<string, z.ZodTypeAny>)[defName]
    : undefined;
}

/**
 * Converts an array of JSON Schema enum values to a Zod schema.
 *
 * @param values Allowed enum values.
 * @returns Zod enum, literal, or union schema representing the allowed values.
 */
function convertEnumToZod(values: unknown[]): z.ZodTypeAny {
  if (values.length === 0) {
    return z.unknown();
  }
  if (values.every(v => typeof v === 'string')) {
    return z.enum(values as [string, ...string[]]);
  }
  if (values.length === 1) {
    return z.literal(values[0] as string | number | boolean);
  }
  return z.union(
    values.map(v => z.literal(v as string | number | boolean)) as unknown as [
      z.ZodTypeAny,
      z.ZodTypeAny,
      ...z.ZodTypeAny[],
    ],
  );
}

/**
 * Applies `not`, `default`, and `description` modifiers to a converted Zod schema.
 *
 * @param baseZod Base Zod schema before modifiers.
 * @param propSchema Raw property schema definition.
 * @param rootDoc Optional root schema document for resolving nested references.
 * @param visitedPointers Set of JSON pointer references currently being resolved.
 * @param defCache Cache of previously converted definition schemas.
 * @returns The modified Zod schema.
 */
function finalizePropertyZod(
  baseZod: z.ZodTypeAny,
  propSchema: Record<string, unknown>,
  rootDoc?: Record<string, unknown>,
  visitedPointers?: Set<string>,
  defCache?: ConversionCache,
): z.ZodTypeAny {
  let result = baseZod;
  if (propSchema.not && typeof propSchema.not === 'object') {
    const notSchema = convertPropertyToZod(
      propSchema.not as Record<string, unknown>,
      rootDoc,
      new Set(visitedPointers),
      defCache,
    );
    result = result.refine(val => !notSchema.safeParse(val).success, {
      message: 'Value matched prohibited "not" schema',
    });
  }
  if (propSchema.default !== undefined) {
    result = result.default(propSchema.default);
  }
  if (typeof propSchema.description === 'string') {
    result = result.describe(propSchema.description);
  }
  return result;
}

/**
 * Converts a JSON Schema `$ref` pointer into a Zod schema.
 *
 * Resolves standard protocol definitions from common types, as well as local
 * `#/$defs/...` pointers within the root document. Handles recursive references
 * using `z.lazy` and caches resolved schemas to break cycles.
 *
 * @param ref JSON Schema reference string.
 * @param propSchema Property schema containing the reference.
 * @param rootDoc Root schema document containing definition targets.
 * @param visitedPointers Set of reference pointers currently on the resolution stack.
 * @param defCache Cache mapping reference strings to resolved Zod schemas.
 * @returns Converted Zod schema, or undefined if the reference cannot be resolved.
 */
function convertRefToZod(
  ref: string,
  propSchema: Record<string, unknown>,
  rootDoc: Record<string, unknown> | undefined,
  visitedPointers: Set<string>,
  defCache: ConversionCache,
): z.ZodTypeAny | undefined {
  const resolvedProtocol = resolveProtocolRef(ref);
  if (resolvedProtocol) {
    const defName = ref.split(/#\/(?:\$defs|definitions)\//)[1];
    const desc =
      typeof propSchema.description === 'string'
        ? `REF:common_types.json#/$defs/${defName}|${propSchema.description}`
        : resolvedProtocol.description;
    return desc ? resolvedProtocol.describe(desc) : resolvedProtocol;
  }

  if (!rootDoc) return undefined;
  const target = defCache.scope.resolve(ref, rootDoc);
  if (!target) {
    defCache.scope.assertResolvable(ref);
    return undefined;
  }
  let doc: Record<string, unknown>;
  let schema: Record<string, unknown> | undefined;
  if (target.isPeer) {
    const peerResolved = resolvePeerTarget(target);
    if (!peerResolved) throwUnresolvableRef(ref);
    ({doc, target: schema} = peerResolved);
  } else {
    doc = rootDoc;
    schema = resolveJsonPointer(rootDoc, target.pointer);
    if (!schema) {
      // A pointer written as `catalog.json#/...` that the document cannot
      // satisfy is left unresolved, as it was before peers were linked.
      if (!ref.startsWith('#')) return undefined;
      return z.unknown().superRefine((_val, ctx) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unresolvable schema reference: '${ref}'`,
        });
      });
    }
  }
  const key = target.key;
  const resolved = schema;
  if (visitedPointers.has(key)) {
    let cached = defCache.get(key);
    return z.lazy(() => {
      if (!cached) {
        cached = defCache.get(key) ?? convertPropertyToZod(resolved, doc, new Set([key]), defCache);
        defCache.set(key, cached);
      }
      return cached;
    });
  }
  let zodType = defCache.get(key);
  if (!zodType) {
    const nextVisited = new Set(visitedPointers);
    nextVisited.add(key);
    zodType = convertPropertyToZod(resolved, doc, nextVisited, defCache);
    defCache.set(key, zodType);
  }
  if (typeof propSchema.description === 'string') {
    zodType = zodType.describe(propSchema.description);
  }
  return zodType;
}

/**
 * Converts `oneOf` or `anyOf` JSON Schema unions into a Zod schema.
 *
 * Enforces mutual exclusivity for `oneOf` unions by verifying that valid values
 * match exactly one branch. Preserves metadata such as `default`, `description`,
 * and dynamic string annotations for enum/DataBinding unions.
 *
 * @param propSchema Schema containing `oneOf` or `anyOf` branches.
 * @param rootDoc Root schema document for resolving nested references.
 * @param visitedPointers Set of reference pointers currently on the resolution stack.
 * @param defCache Cache mapping reference strings to resolved Zod schemas.
 * @returns Converted Zod union schema, or undefined if no valid branches exist.
 */
function convertUnionToZod(
  propSchema: Record<string, unknown>,
  rootDoc: Record<string, unknown> | undefined,
  visitedPointers: Set<string>,
  defCache: ConversionCache,
): z.ZodTypeAny | undefined {
  const isOneOf = Array.isArray(propSchema.oneOf);
  const rawBranches = (propSchema.oneOf || propSchema.anyOf) as unknown[];
  const branches = rawBranches.filter(
    (b): b is Record<string, unknown> => typeof b === 'object' && b !== null,
  );
  if (branches.length === 0) return undefined;

  const enumBranch = branches.find(b => Array.isArray(b.enum));
  const hasBinding = branches.some(
    b => typeof b.$ref === 'string' && b.$ref.includes('DataBinding'),
  );
  const zodBranches = branches.map(b =>
    convertPropertyToZod(b, rootDoc, new Set(visitedPointers), defCache),
  );

  let unionZod: z.ZodTypeAny;
  if (zodBranches.length === 1) {
    unionZod = zodBranches[0];
  } else {
    const tuple = [zodBranches[0], zodBranches[1], ...zodBranches.slice(2)] as const;
    unionZod = isOneOf ? exclusiveUnion(tuple) : z.union(tuple);
  }

  if (propSchema.default !== undefined) {
    unionZod = unionZod.default(propSchema.default);
  }
  const desc =
    (typeof propSchema.description === 'string' ? propSchema.description : undefined) ||
    (enumBranch && hasBinding ? 'REF:common_types.json#/$defs/DynamicString' : undefined);
  return desc ? unionZod.describe(desc) : unionZod;
}

/**
 * Converts a JSON Schema property definition into a runtime Zod schema.
 *
 * Handles `$ref` pointers, unions (`oneOf`, `anyOf`), enums, const values,
 * arrays with boundary constraints and uniqueness, strings with length and pattern
 * validations, numbers with minimum/maximum/multipleOf bounds, booleans, and nested
 * objects with property maps and additionalProperties constraints.
 *
 * @param propSchema Raw JSON Schema property definition.
 * @param rootDoc Optional root schema document for resolving references.
 * @param visitedPointers Set of reference pointers currently being resolved.
 * @param defCache Cache of resolved definition schemas to handle recursion and avoid duplicate work.
 * @returns Runtime Zod schema enforcing the declared JSON Schema constraints.
 */
function convertPropertyToZod(
  propSchema: Record<string, unknown>,
  rootDoc?: Record<string, unknown>,
  visitedPointers = new Set<string>(),
  defCache = new ConversionCache(),
): z.ZodTypeAny {
  if (!propSchema || typeof propSchema !== 'object') {
    return z.unknown();
  }
  if (propSchema instanceof z.ZodType) {
    return propSchema;
  }

  if (propSchema.$ref && typeof propSchema.$ref === 'string') {
    const resolvedRef = convertRefToZod(
      propSchema.$ref,
      propSchema,
      rootDoc,
      visitedPointers,
      defCache,
    );
    if (resolvedRef) return resolvedRef;
  }

  // oneOf / anyOf inspection
  if (Array.isArray(propSchema.oneOf) || Array.isArray(propSchema.anyOf)) {
    const resolvedUnion = convertUnionToZod(propSchema, rootDoc, visitedPointers, defCache);
    if (resolvedUnion) return resolvedUnion;
  }

  // Const literal
  if (propSchema.const !== undefined) {
    const constZod = z.literal(propSchema.const as string | number | boolean);
    return finalizePropertyZod(constZod, propSchema, rootDoc, visitedPointers, defCache);
  }

  // Enums
  if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
    const enumZod = convertEnumToZod(propSchema.enum);
    return finalizePropertyZod(enumZod, propSchema, rootDoc, visitedPointers, defCache);
  }

  // Arrays
  if (propSchema.type === 'array') {
    const itemSchema =
      propSchema.items && typeof propSchema.items === 'object'
        ? convertPropertyToZod(
            propSchema.items as Record<string, unknown>,
            rootDoc,
            new Set(visitedPointers),
            defCache,
          )
        : z.unknown();
    let arr: z.ZodTypeAny = z.array(itemSchema);
    if (typeof propSchema.minItems === 'number') {
      arr = (arr as z.ZodArray<any>).min(propSchema.minItems);
    }
    if (typeof propSchema.maxItems === 'number') {
      arr = (arr as z.ZodArray<any>).max(propSchema.maxItems);
    }
    if (propSchema.uniqueItems === true) {
      arr = arr.refine(
        (items: unknown[]) => new Set(items.map(canonicalJsonStringify)).size === items.length,
        {message: 'Array items must be unique'},
      );
    }
    return finalizePropertyZod(arr, propSchema, rootDoc, visitedPointers, defCache);
  }

  // Primitives
  switch (propSchema.type) {
    case 'string': {
      let s = z.string();
      if (typeof propSchema.minLength === 'number') {
        s = s.min(propSchema.minLength);
      }
      if (typeof propSchema.maxLength === 'number') {
        s = s.max(propSchema.maxLength);
      }
      if (typeof propSchema.pattern === 'string') {
        try {
          s = s.regex(new RegExp(propSchema.pattern, 'u'));
        } catch {
          // ignore regex compilation failure
        }
      }
      return finalizePropertyZod(s, propSchema, rootDoc, visitedPointers, defCache);
    }
    case 'integer':
    case 'number': {
      let n = propSchema.type === 'integer' ? z.number().int() : z.number();
      if (typeof propSchema.minimum === 'number') {
        n = n.min(propSchema.minimum);
      }
      if (typeof propSchema.maximum === 'number') {
        n = n.max(propSchema.maximum);
      }
      if (typeof propSchema.exclusiveMinimum === 'number') {
        n = n.gt(propSchema.exclusiveMinimum);
      }
      if (typeof propSchema.exclusiveMaximum === 'number') {
        n = n.lt(propSchema.exclusiveMaximum);
      }
      if (typeof propSchema.multipleOf === 'number') {
        n = n.multipleOf(propSchema.multipleOf);
      }
      return finalizePropertyZod(n, propSchema, rootDoc, visitedPointers, defCache);
    }
    case 'boolean': {
      return finalizePropertyZod(z.boolean(), propSchema, rootDoc, visitedPointers, defCache);
    }
    case 'object': {
      // An inline object that declares its properties is converted structurally
      // rather than collapsed to an opaque record. Without this, a child
      // reference nested inside an array item is invisible to the reference map,
      // so the component graph would look as if it had no children there.
      const props = propSchema.properties;
      let obj: z.ZodTypeAny;
      if (typeof props === 'object' && props !== null) {
        const required = Array.isArray(propSchema.required)
          ? new Set(propSchema.required.filter((r): r is string => typeof r === 'string'))
          : new Set<string>();
        const baseObj = z.object(
          convertPropertiesToShape(
            props as Record<string, unknown>,
            required,
            false,
            rootDoc,
            visitedPointers,
            defCache,
          ),
        );
        const forbidExtra =
          propSchema.additionalProperties === false || propSchema.unevaluatedProperties === false;
        obj = forbidExtra ? baseObj.strict() : baseObj.passthrough();
      } else {
        obj = z.record(z.unknown());
      }
      return finalizePropertyZod(obj, propSchema, rootDoc, visitedPointers, defCache);
    }
    default: {
      return finalizePropertyZod(z.unknown(), propSchema, rootDoc, visitedPointers, defCache);
    }
  }
}

/**
 * Converts a dictionary of property definitions into a Zod raw shape map.
 *
 * Marks fields as optional unless present in `requiredSet`.
 *
 * @param properties Property name to property schema mapping.
 * @param requiredSet Set of required property names.
 * @param omitEnvelopeFields Whether to omit component envelope fields (`id`, `component`, `catalogId`).
 * @param rootDoc Optional root schema document for reference resolution.
 * @param visitedPointers Set of reference pointers currently on the resolution stack.
 * @param defCache Cache mapping reference strings to resolved Zod schemas.
 * @returns Map of property names to Zod schemas representing the shape.
 */
function convertPropertiesToShape(
  properties: Record<string, unknown>,
  requiredSet: Set<string>,
  omitEnvelopeFields = false,
  rootDoc?: Record<string, unknown>,
  visitedPointers?: Set<string>,
  defCache = new ConversionCache(),
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [propName, propSchema] of Object.entries(properties)) {
    if (omitEnvelopeFields && isComponentEnvelopeField(propName)) {
      continue;
    }
    const zodField = convertPropertyToZod(
      typeof propSchema === 'object' && propSchema !== null
        ? (propSchema as Record<string, unknown>)
        : {},
      rootDoc,
      visitedPointers ? new Set(visitedPointers) : new Set<string>(),
      defCache,
    );
    if (!requiredSet.has(propName)) {
      shape[propName] = zodField.optional();
    } else if (zodField.safeParse(undefined).success) {
      // A schema that accepts any value, such as `{}`, also accepts a missing
      // key, which `required` rules out.
      shape[propName] = zodField.refine(value => value !== undefined, {message: 'Required'});
    } else {
      shape[propName] = zodField;
    }
  }
  return shape;
}

/**
 * A piece of a component definition gathered while flattening `allOf`.
 *
 * Most pieces are raw JSON Schema fragments taken from the catalog document. A piece that
 * comes from an external `$ref` into `common_types.json` cannot be read as JSON here, since
 * only the catalog document is loaded, so it arrives as the zod mirror of the canonical
 * type instead.
 */
type ComponentSubSchema =
  | {kind: 'json'; schema: Record<string, unknown>; rootDoc: Record<string, unknown>}
  | {kind: 'zod'; properties: Record<string, z.ZodTypeAny>};

/**
 * Collects all property definitions and constraints from a component schema.
 *
 * Resolves local document `$defs` and canonical protocol references, including
 * external `common_types.json` mixins such as `Checkable`.
 *
 * The pieces are ordered from the most generic to the most specific, so that a
 * later piece overrides a property an earlier one declares: the standard
 * mixins first, then the local definitions the schema references, then its
 * inline `allOf` members, and the schema's own `properties` last. A component
 * that narrows a property it inherits keeps its narrowed schema, and the mixin
 * properties stay first in key order.
 *
 * A reference into a peer catalog contributes the pieces of its target, whose
 * own local pointers resolve against the peer's document.
 *
 * @param schema Component schema definition.
 * @param rootDoc Root schema document containing definition targets.
 * @param scope Peer catalogs that cross-catalog references resolve against.
 * @param visitedPointers Document-scoped keys of the references currently being resolved, to
 *     prevent cycles.
 * @param isAtLeastV10 Whether the catalog targets protocol v1.0 or higher.
 * @returns The pieces gathered from the schema and its `allOf` hierarchy, as JSON Schema
 *     fragments or zod mirrors of canonical types, least specific first.
 */
function collectComponentSubSchemas(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  scope: PeerScope,
  visitedPointers = new Set<string>(),
  isAtLeastV10 = false,
): ComponentSubSchema[] {
  if (!schema || typeof schema !== 'object') return [];
  const mixins: ComponentSubSchema[] = [];
  const local: ComponentSubSchema[] = [];
  const inline: ComponentSubSchema[] = [];

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      if (!sub || typeof sub !== 'object') continue;

      if (typeof sub.$ref === 'string') {
        const ref = sub.$ref;
        if (ref.includes('common_types.json') && ref.includes('ComponentCommon')) {
          // Protocol common properties: accessibility attributes, and from
          // v1.0 also the component's metadata. `catalogId` is an envelope
          // field, like `id`.
          const {accessibility, metadata} = ComponentCommonSchema.shape;
          mixins.push({
            kind: 'zod',
            properties: isAtLeastV10 ? {accessibility, metadata} : {accessibility},
          });
        } else {
          // Any other external reference, such as common_types.json#/$defs/Checkable.
          // The referenced document is not loaded here, so fall back to the zod mirror of
          // the canonical type. Without this the mixin is dropped with no error, which is
          // how `checks` used to disappear from every Checkable component.
          const mirror = ref.startsWith('#/') ? undefined : resolveProtocolRef(ref);
          const target = mirror instanceof z.ZodObject ? undefined : scope.resolve(ref, rootDoc);
          if (mirror instanceof z.ZodObject) {
            mixins.push({kind: 'zod', properties: {...mirror.shape}});
          } else if (!target) {
            scope.assertResolvable(ref);
          } else if (!target.isPeer) {
            if (!visitedPointers.has(target.key)) {
              visitedPointers.add(target.key);
              const resolved = resolveJsonPointer(rootDoc, target.pointer);
              if (resolved) {
                local.push(
                  ...collectComponentSubSchemas(
                    resolved,
                    rootDoc,
                    scope,
                    visitedPointers,
                    isAtLeastV10,
                  ),
                );
              }
            }
          } else if (!visitedPointers.has(target.key)) {
            const peerResolved = resolvePeerTarget(target);
            if (!peerResolved) throwUnresolvableRef(ref);
            const nextVisited = new Set(visitedPointers).add(target.key);
            local.push(
              ...collectComponentSubSchemas(
                peerResolved.target,
                peerResolved.doc,
                scope,
                nextVisited,
                isAtLeastV10,
              ),
            );
          }
        }
      } else {
        inline.push(
          ...collectComponentSubSchemas(sub, rootDoc, scope, visitedPointers, isAtLeastV10),
        );
      }
    }
  }

  const result = [...mixins, ...local, ...inline];
  if (schema.properties) {
    result.push({kind: 'json', schema, rootDoc});
  }
  return result;
}

/**
 * Converts a raw component JSON schema definition into a Zod object schema.
 *
 * Merges sub-schemas from `allOf` compositions, applies required fields, and
 * respects `additionalProperties` and `unevaluatedProperties` constraints.
 *
 * @param rawSchema Raw component schema definition.
 * @param rootDoc Root schema document for resolving references.
 * @param omitEnvelopeFields Whether to omit envelope fields (`id`, `component`, `catalogId`). Defaults to true.
 * @param defCache Cache mapping reference strings to resolved Zod schemas.
 * @param isAtLeastV10 Whether the catalog targets protocol v1.0 or higher.
 * @returns Zod object schema validating component properties.
 */
function convertComponentJsonSchemaToZod(
  rawSchema: Record<string, unknown>,
  rootDoc: Record<string, unknown>,
  omitEnvelopeFields = true,
  defCache = new ConversionCache(),
  isAtLeastV10 = false,
): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const schemasToMerge = collectComponentSubSchemas(
    rawSchema,
    rootDoc,
    defCache.scope,
    undefined,
    isAtLeastV10,
  );

  const requiredSet = new Set<string>();
  for (const s of schemasToMerge) {
    if (s.kind === 'json' && Array.isArray(s.schema.required)) {
      s.schema.required.forEach((r: unknown) => {
        if (typeof r === 'string') requiredSet.add(r);
      });
    }
  }

  for (const s of schemasToMerge) {
    if (s.kind === 'zod') {
      for (const [propName, propSchema] of Object.entries(s.properties)) {
        if (omitEnvelopeFields && isComponentEnvelopeField(propName)) {
          continue;
        }
        shape[propName] = propSchema;
      }
      continue;
    }
    const propShape = convertPropertiesToShape(
      (s.schema.properties as Record<string, unknown>) || {},
      requiredSet,
      omitEnvelopeFields,
      s.rootDoc,
      undefined,
      defCache,
    );
    Object.assign(shape, propShape);
  }

  const obj = z.object(shape);
  const allowExtra =
    rawSchema.unevaluatedProperties === true ||
    (typeof rawSchema.unevaluatedProperties === 'object' &&
      rawSchema.unevaluatedProperties !== null) ||
    rawSchema.additionalProperties === true ||
    (typeof rawSchema.additionalProperties === 'object' && rawSchema.additionalProperties !== null);
  return allowExtra ? obj.passthrough() : obj.strict();
}

/**
 * Checks whether an object schema explicitly permits additional or unevaluated properties.
 */
function isExplicitlyOpen(schema: Record<string, unknown>): boolean {
  return (
    schema.unevaluatedProperties === true ||
    (typeof schema.unevaluatedProperties === 'object' && schema.unevaluatedProperties !== null) ||
    schema.additionalProperties === true ||
    (typeof schema.additionalProperties === 'object' && schema.additionalProperties !== null)
  );
}

/** An object schema gathered from function arguments, with the document it belongs to. */
interface ArgSubSchema {
  readonly schema: Record<string, unknown>;
  readonly doc?: Record<string, unknown>;
}

/**
 * Collects sub-schemas and references for function argument definitions.
 *
 * Resolves local document pointers (`#/`) and references into peer catalogs,
 * recurses into `allOf` compositions, and detects unresolvable references or
 * open combiners (`oneOf`, `anyOf`).
 */
function collectArgSubSchemas(
  schema: Record<string, unknown>,
  rootDoc: Record<string, unknown> | undefined,
  scope: PeerScope,
  visited = new Set<string>(),
): {schemas: ArgSubSchema[]; hasUnresolvable: boolean} {
  const result: {schemas: ArgSubSchema[]; hasUnresolvable: boolean} = {
    schemas: [],
    hasUnresolvable: false,
  };

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return result;
  }

  if (isShorthandParameterMap(schema)) {
    result.schemas.push({
      schema: {
        type: 'object',
        properties: schema,
      },
      doc: rootDoc,
    });
    return result;
  }

  const addSub = (sub: {schemas: ArgSubSchema[]; hasUnresolvable: boolean}) => {
    result.schemas.push(...sub.schemas);
    if (sub.hasUnresolvable) {
      result.hasUnresolvable = true;
    }
  };

  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref;
    const target = rootDoc ? scope.resolve(ref, rootDoc) : undefined;
    if (!target || !rootDoc) {
      if (rootDoc) scope.assertResolvable(ref);
      result.hasUnresolvable = true;
    } else if (!target.isPeer) {
      if (!visited.has(target.key)) {
        visited.add(target.key);
        const resolved = resolveJsonPointer(rootDoc, target.pointer);
        if (resolved) {
          addSub(collectArgSubSchemas(resolved, rootDoc, scope, visited));
        } else {
          result.hasUnresolvable = true;
        }
      }
    } else if (!visited.has(target.key)) {
      const peerResolved = resolvePeerTarget(target);
      if (!peerResolved) throwUnresolvableRef(ref);
      const nextVisited = new Set(visited).add(target.key);
      addSub(collectArgSubSchemas(peerResolved.target, peerResolved.doc, scope, nextVisited));
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
        addSub(collectArgSubSchemas(sub as Record<string, unknown>, rootDoc, scope, visited));
      }
    }
  }

  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    result.hasUnresolvable = true;
  }

  if (
    schema.properties ||
    schema.required ||
    schema.additionalProperties !== undefined ||
    schema.unevaluatedProperties !== undefined
  ) {
    result.schemas.push({schema, doc: rootDoc});
  }

  return result;
}

/**
 * Converts a function argument JSON schema definition into a Zod object schema.
 *
 * Maps function argument schemas to object properties, requiring fields listed in
 * `required` and applying strictness or passthrough based on `additionalProperties`
 * and reference resolution.
 *
 * @param rawSchema Raw function arguments schema.
 * @param rootDoc Optional root schema document for reference resolution.
 * @param defCache Cache mapping reference keys to resolved Zod schemas, and the
 *     peer catalogs cross-catalog references resolve against.
 * @returns Zod object schema validating function arguments.
 */
function convertFunctionArgsJsonSchemaToZod(
  rawSchema: Record<string, unknown>,
  rootDoc?: Record<string, unknown>,
  defCache = new ConversionCache(),
): z.ZodObject<z.ZodRawShape> {
  const collected = collectArgSubSchemas(rawSchema, rootDoc, defCache.scope);
  const requiredSet = new Set<string>();
  for (const {schema: s} of collected.schemas) {
    if (Array.isArray(s.required)) {
      for (const r of s.required) {
        if (typeof r === 'string') {
          requiredSet.add(r);
        }
      }
    }
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const {schema: s, doc} of collected.schemas) {
    if (s.properties && typeof s.properties === 'object' && !Array.isArray(s.properties)) {
      const propShape = convertPropertiesToShape(
        s.properties as Record<string, unknown>,
        requiredSet,
        false,
        doc,
        undefined,
        defCache,
      );
      Object.assign(shape, propShape);
    }
  }

  const obj = z.object(shape);
  const allowExtra =
    collected.hasUnresolvable ||
    collected.schemas.some(({schema: s}) => isExplicitlyOpen(s)) ||
    isExplicitlyOpen(rawSchema);
  return allowExtra ? obj.passthrough() : obj.strict();
}

/** The Zod 3 conversions of a catalog document's definitions. */
const ZOD_CONVERTERS: CatalogEntryConverters = {
  component: (_name, definition, context) =>
    convertComponentJsonSchemaToZod(
      definition as Record<string, unknown>,
      context.document as Record<string, unknown>,
      true,
      new ConversionCache(context.peers),
      isAtLeastVersion(context.protocolVersion, '1.0'),
    ),
  functionArgs: (_name, args, context) =>
    args
      ? convertFunctionArgsJsonSchemaToZod(
          args as Record<string, unknown>,
          context.document as Record<string, unknown>,
          new ConversionCache(context.peers),
        )
      : z.record(z.unknown()),
  theme: (schema, closed, context) => {
    const theme = convertComponentJsonSchemaToZod(
      schema as Record<string, unknown>,
      context.document as Record<string, unknown>,
      false,
    );
    return closed ? theme : theme.passthrough();
  },
};

/**
 * Loads a catalog document into the fields of a `Catalog` whose schemas are
 * Zod 3 schemas, converted from each definition on first use. See
 * `loadCatalogDocument` for the rules.
 *
 * @param inputSchema Raw catalog document or capabilities inline catalog.
 * @param protocolVersion Protocol version that overrides the one the document declares.
 * @param catalogIdOverride Catalog ID that overrides the one the document declares.
 */
export function parseCatalogSchema(
  inputSchema: Record<string, unknown>,
  protocolVersion?: string,
  catalogIdOverride?: string,
): LoadedCatalogDocument {
  return loadCatalogDocument(
    inputSchema,
    {protocolVersion, catalogId: catalogIdOverride},
    ZOD_CONVERTERS,
  );
}
