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

import {z} from 'zod/v4';

import {isAtLeastVersion} from '../common/semver.js';
import {assertUax31Identifier} from '../common/uax31.js';
import {CommonSchemas} from '../types/zod4/common-types.js';
import {CommonSchemas as V09CommonSchemas} from '../v0_9/zod4/common-types.js';
import {V09_STANDARD_DEFS} from '../v0_9/standard_defs.js';
import {V10_STANDARD_DEFS} from '../v1_0/standard_defs.js';
import {setDefinitionView} from './a2ui_json_schema.js';
import type {EntrySchema} from './a2ui_schema.js';
import {
  compiledEntrySchema,
  isShorthandParameterMap,
  narrowedReference,
  objectDefinitionJson,
  objectDefinitionView,
  objectValidationSchema,
  resolveComponentDefinition,
  resolveFunctionArgumentsDefinition,
  resolveThemeDefinition,
  type CatalogSchemaCompileContext,
  type CatalogSchemaCompiler,
  type ResolvedObjectDefinition,
} from './catalog_definitions.js';
import {
  inlineSchemaReferences,
  PeerScope,
  resolveJsonPointer,
  type PeerCatalogSource,
} from './catalog_references.js';
import {JsonComponentApi, JsonFunctionApi} from './json_entries.js';
import {
  buildComponentUnion,
  buildFunctionUnion,
  deepCopyJson,
  deepFreeze,
} from './schema_serializer.js';
import type {CatalogDocumentOptions, ComponentApi, FunctionApi} from './types.js';

export {isShorthandParameterMap} from './catalog_definitions.js';
export {hasCrossDocumentRefs, type PeerCatalogSource} from './catalog_references.js';

/**
 * The fields of a parsed catalog document: its ID, version and entries, and
 * the document-level fields a `Catalog` keeps so that `toJson` reproduces the
 * document.
 */
export interface ParsedCatalogSchema extends CatalogDocumentOptions {
  id: string;
  protocolVersion: string;
  components: ComponentApi[];
  functions: FunctionApi[];
  themeSchema?: EntrySchema;
}

/**
 * Protocol version assumed for a catalog schema that does not declare one.
 *
 * Catalog schemas only began carrying `protocolVersion` at v1.0, so a schema
 * that omits it predates that field.
 */
export const DEFAULT_PROTOCOL_VERSION = '0.9';

/**
 * The Zod mirrors of the `common_types.json` definitions, by definition name.
 */
type CommonTypeSchemas = Readonly<Record<string, z.ZodTypeAny>>;

/**
 * The common types of a v0.9 catalog: the shared mirrors, with the v0.9
 * definitions where the shared ones follow later versions. The v0.9
 * accessibility attributes lack the `live` and `hidden` that v1.0 added, and
 * a v0.9 check requires its `message`. The other v0.9 mirrors are not used, as
 * some are looser than the published schema: their `FunctionCall` accepts keys
 * that the catalog's function definitions reject.
 */
const V09_COMMON_TYPE_SCHEMAS: CommonTypeSchemas = Object.freeze({
  ...CommonSchemas,
  AccessibilityAttributes: V09CommonSchemas.AccessibilityAttributes,
  ComponentCommon: V09CommonSchemas.ComponentCommon,
  CheckRule: V09CommonSchemas.CheckRule,
  Checkable: V09CommonSchemas.Checkable,
});

/**
 * Returns the Zod mirrors of the common types that a catalog of
 * `protocolVersion` references.
 *
 * @param protocolVersion The catalog's protocol version.
 */
function commonTypeSchemasFor(protocolVersion: string): CommonTypeSchemas {
  return isAtLeastVersion(protocolVersion, '0.9') && !isAtLeastVersion(protocolVersion, '1.0')
    ? V09_COMMON_TYPE_SCHEMAS
    : CommonSchemas;
}

/**
 * Zod schemas converted for one catalog entry, keyed by the document-scoped
 * key of the reference they were converted from, together with the common
 * type mirrors the entry's common-type references convert to.
 *
 * An entry is converted from its resolved definition, whose references into
 * peer catalogs already point into its bundle, so the scope has no peers.
 */
class ConversionCache extends Map<string, z.ZodTypeAny> {
  readonly scope = new PeerScope();
  readonly commonTypes: CommonTypeSchemas;
  /** The JSON Schema definitions the Zod mirrors in `commonTypes` stand for. */
  readonly commonTypeDefinitions: Readonly<Record<string, unknown>>;

  constructor(commonTypes?: CommonTypeSchemas) {
    super();
    this.commonTypes = commonTypes ?? CommonSchemas;
    this.commonTypeDefinitions =
      this.commonTypes === V09_COMMON_TYPE_SCHEMAS ? V09_STANDARD_DEFS : V10_STANDARD_DEFS;
  }
}

/**
 * Builds a JSON-loaded catalog entry linked to the given peer catalogs, by
 * entry: each entry `fromJson` loads, and each entry rebuilt from one, maps to
 * the function that built it. The function does not depend on any peers.
 */
const entryBuilders = new WeakMap<
  object,
  (peers: readonly PeerCatalogSource[]) => ComponentApi | FunctionApi
>();

/**
 * Returns a copy of a catalog entry whose Zod schema resolves cross-catalog
 * `$ref`s against `peers`. An entry `fromJson` loaded is rebuilt from the same
 * definition; any other entry is returned as is.
 *
 * @param entry A component or function.
 * @param peers The peer catalogs, in matching order.
 */
export function linkEntry<E extends ComponentApi | FunctionApi>(
  entry: E,
  peers: readonly PeerCatalogSource[],
): E {
  const build = entryBuilders.get(entry);
  return build ? (build(peers) as E) : entry;
}

/**
 * Returns a copy of `node` with local `#/...` and peer catalog `<doc>#/...`
 * references resolved inline, preserving references to standard common types.
 *
 * Documents are matched with the peer matching rule: a reference to a bare
 * `catalog.json`, or to a document ending in `/catalog.json` that no peer
 * matches exactly, points into `rootDoc`. References inside an inlined peer
 * document resolve against the same `peers`, and its local pointers against
 * that peer's document.
 *
 * @param node The schema to inline references in.
 * @param rootDoc The document `node` belongs to.
 * @param peers The peer catalogs, in matching order.
 * @param options `inlineLocalDefs`: whether to inline local `#/$defs/...`
 *     references; `visited`: reference identities already inlined.
 */
export function inlinePeerAndLocalRefs(
  node: unknown,
  rootDoc: Record<string, unknown>,
  peers: readonly PeerCatalogSource[] = [],
  options: {inlineLocalDefs?: boolean; visited?: Set<string>} = {},
): unknown {
  return inlineSchemaReferences(node, rootDoc, peers, {
    visited: options.visited,
    keepLocalDefinition:
      options.inlineLocalDefs === false ? () => true : name => Object.hasOwn(CommonSchemas, name),
  });
}

/**
 * Resolves a standard protocol `$ref` to its corresponding common type schema.
 *
 * @param ref JSON Schema reference string.
 * @param commonTypes The common type schemas of the catalog's protocol version.
 * @returns The matching Zod schema, or undefined if not a known protocol definition.
 */
function resolveProtocolRef(ref: string, commonTypes: CommonTypeSchemas): z.ZodTypeAny | undefined {
  const defName = ref.split(/#\/(?:\$defs|definitions)\//)[1];
  return defName && Object.hasOwn(commonTypes, defName) ? commonTypes[defName] : undefined;
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
 * Serializes a value to canonical JSON with deterministically sorted object keys.
 *
 * Produces identical strings for semantically equivalent values regardless of
 * object property insertion order.
 *
 * @param val Value to serialize.
 * @returns Deterministic JSON string representation.
 */
function canonicalJsonStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map(canonicalJsonStringify).join(',')}]`;
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  const entries = keys.map(
    k => `${JSON.stringify(k)}:${canonicalJsonStringify((val as Record<string, unknown>)[k])}`,
  );
  return `{${entries.join(',')}}`;
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
  const resolvedProtocol = resolveProtocolRef(ref, defCache.commonTypes);
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
  const doc = rootDoc;
  const schema = resolveJsonPointer(rootDoc, target.pointer);
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
 * Returns a union that accepts a value exactly one of `branches` accepts, as
 * a JSON Schema `oneOf` does.
 */
function exclusiveUnion(
  branches: readonly [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
): z.ZodTypeAny {
  return z.union(branches).superRefine((value, ctx) => {
    let matches = 0;
    for (const branch of branches) {
      if (branch.safeParse(value).success && ++matches > 1) {
        ctx.addIssue({code: 'custom', message: 'Value matched more than one schema in oneOf'});
        return;
      }
    }
  });
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

  const narrowedRef = narrowedReference(propSchema);
  if (narrowedRef) {
    return convertPropertyToZod(narrowedRef, rootDoc, visitedPointers, defCache);
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
        items =>
          new Set((items as unknown[]).map(canonicalJsonStringify)).size ===
          (items as unknown[]).length,
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
            undefined,
            rootDoc,
            visitedPointers,
            defCache,
          ),
        );
        const forbidExtra =
          propSchema.additionalProperties === false || propSchema.unevaluatedProperties === false;
        obj = forbidExtra ? baseObj.strict() : baseObj.passthrough();
      } else {
        obj = z.record(z.string(), z.unknown());
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
 * @param omittedProperties Property names to leave out, such as a component's envelope fields.
 * @param rootDoc Optional root schema document for reference resolution.
 * @param visitedPointers Set of reference pointers currently on the resolution stack.
 * @param defCache Cache mapping reference strings to resolved Zod schemas.
 * @returns Map of property names to Zod schemas representing the shape.
 */
function convertPropertiesToShape(
  properties: Record<string, unknown>,
  requiredSet: ReadonlySet<string>,
  omittedProperties: ReadonlySet<string> = new Set(),
  rootDoc?: Record<string, unknown>,
  visitedPointers?: Set<string>,
  defCache = new ConversionCache(),
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [propName, propSchema] of Object.entries(properties)) {
    if (omittedProperties.has(propName)) {
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
 * Builds the Zod object for an object definition the resolver produced: each
 * piece's properties in order, a later piece overriding an earlier one, with
 * the definition's required names, omitted properties and closure.
 *
 * A common-type piece contributes the properties of that type's Zod mirror,
 * or none when the mirror is not an object.
 *
 * @param model The resolved object definition.
 * @param defCache Cache mapping reference keys to converted Zod schemas, and
 *     the common type mirrors of the catalog's protocol version.
 * @returns Zod object schema validating the object.
 */
function buildObjectZod(
  model: ResolvedObjectDefinition,
  defCache: ConversionCache,
): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const piece of model.pieces) {
    if (piece.kind === 'commonType') {
      const mirror = defCache.commonTypes[piece.name];
      if (!(mirror instanceof z.ZodObject)) continue;
      const mirrorShape = (mirror as z.ZodObject).shape as Record<string, z.ZodTypeAny>;
      for (const propName of piece.properties ?? Object.keys(mirrorShape)) {
        if (model.omittedProperties.has(propName) || !mirrorShape[propName]) continue;
        shape[propName] = mirrorShape[propName];
      }
      continue;
    }
    Object.assign(
      shape,
      convertPropertiesToShape(
        piece.properties as Record<string, unknown>,
        model.required,
        model.omittedProperties,
        model.document as Record<string, unknown>,
        undefined,
        defCache,
      ),
    );
  }
  const obj = z.object(shape);
  const zod = model.open ? obj.passthrough() : obj.strict();
  // The binder inspects, and the JSON Schema view writes, the definition this
  // object was built from rather than the Zod object itself.
  const isCommonTypeName = (name: string) => Object.hasOwn(defCache.commonTypes, name);
  setDefinitionView(
    zod,
    () => objectDefinitionView(model, defCache.commonTypeDefinitions, isCommonTypeName),
    () => objectDefinitionJson(model, defCache.commonTypeDefinitions, isCommonTypeName),
  );
  return zod;
}

/**
 * How a catalog's entries are compiled: by `compiler` when one is given, to
 * Zod 4 otherwise, at the catalog's protocol version.
 */
interface Compilation {
  readonly compiler?: CatalogSchemaCompiler;
  readonly protocolVersion: string;
}

/**
 * Compiles a resolved object definition with the catalog's compiler, or
 * builds its Zod object when it has none. A compiled schema validates with the
 * compiler's validator and writes the JSON Schema it was compiled from, and
 * the binder inspects it through its definition, as it does a Zod object.
 */
function compileObject(
  model: ResolvedObjectDefinition,
  defCache: ConversionCache,
  compilation: Compilation,
  context: Omit<CatalogSchemaCompileContext, 'protocolVersion'>,
): EntrySchema {
  const {compiler, protocolVersion} = compilation;
  if (!compiler) return buildObjectZod(model, defCache);
  const isCommonTypeName = (name: string) => Object.hasOwn(defCache.commonTypes, name);
  const jsonSchema = objectValidationSchema(
    model,
    defCache.commonTypeDefinitions,
    isCommonTypeName,
  );
  const validator = compiler.compile(structuredClone(jsonSchema), {...context, protocolVersion});
  const schema = compiledEntrySchema(validator, jsonSchema);
  setDefinitionView(schema, () =>
    objectDefinitionView(model, defCache.commonTypeDefinitions, isCommonTypeName),
  );
  return schema;
}

/** The schema of a function that declares no arguments: any object. */
function anyArguments(compilation: Compilation, name: string): EntrySchema {
  const {compiler, protocolVersion} = compilation;
  if (!compiler) return z.record(z.string(), z.unknown());
  const jsonSchema = {type: 'object'};
  return compiledEntrySchema(
    compiler.compile({type: 'object'}, {kind: 'functionArgs', name, protocolVersion}),
    jsonSchema,
  );
}

/**
 * Extracts declared parameter names from a function's argument schema.
 */
function functionParameterNames(schema: unknown, rootDoc?: Record<string, unknown>): string[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [];
  }
  const s = schema as Record<string, unknown>;
  const names: string[] = [];
  const visited = new Set<string>();

  const extractProperties = (node: unknown): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;
    if (typeof n.$ref === 'string' && rootDoc && n.$ref.startsWith('#/')) {
      if (!visited.has(n.$ref)) {
        visited.add(n.$ref);
        const target = resolveJsonPointer(rootDoc, n.$ref);
        if (target) {
          extractProperties(target);
        }
      }
    }
    if (
      n.properties &&
      typeof n.properties === 'object' &&
      n.properties !== null &&
      !Array.isArray(n.properties)
    ) {
      names.push(...Object.keys(n.properties as Record<string, unknown>));
    }
    if (Array.isArray(n.allOf)) {
      for (const member of n.allOf) {
        extractProperties(member);
      }
    }
  };

  if (
    (s.properties &&
      typeof s.properties === 'object' &&
      s.properties !== null &&
      !Array.isArray(s.properties)) ||
    Array.isArray(s.allOf) ||
    typeof s.$ref === 'string'
  ) {
    extractProperties(s);
    return names;
  }

  if (isShorthandParameterMap(s)) {
    return Object.keys(s);
  }

  return [];
}

/**
 * Parses raw catalog function definitions into typed FunctionApi objects.
 *
 * Validates UAX #31 identifier requirements when targeting protocol v1.0 or higher,
 * filters against permitted function names, and converts parameter schemas to Zod validators.
 *
 * @param rawFunctions Raw function definitions from the catalog schema (array or dictionary).
 * @param compilation How the functions' argument schemas are compiled.
 * @param rootDoc Optional root schema document for reference resolution.
 * @param permittedNames Optional set of allowed function names from `anyFunction.oneOf`.
 * @param atLeastV10 Whether the catalog targets protocol v1.0 or higher.
 * @param commonTypes The common type schemas of the catalog's protocol version.
 * @returns Array of parsed FunctionApi objects.
 * @throws {A2uiCatalogError} If a function or argument identifier fails UAX #31 validation in v1.0+.
 */
function parseFunctionDefinitions(
  rawFunctions: unknown,
  compilation: Compilation,
  rootDoc?: Record<string, unknown>,
  permittedNames?: Set<string>,
  atLeastV10 = false,
  commonTypes: CommonTypeSchemas = CommonSchemas,
): FunctionApi[] {
  const result: FunctionApi[] = [];
  if (!rawFunctions) return result;

  /** Validates a function's own name and its declared argument names. */
  const assertFunctionIdentifiers = (name: string, paramNames: string[]): void => {
    if (!atLeastV10) return;
    assertUax31Identifier(name, `function identifier: '${name}'`);
    for (const argName of paramNames) {
      assertUax31Identifier(argName, `argument identifier: '${argName}' in function '${name}'`);
    }
  };

  /** Compiles a function's arguments schema, resolved against `peers`. */
  const convertArguments = (
    name: string,
    argsSchema: Record<string, unknown>,
    peers: readonly PeerCatalogSource[],
  ): EntrySchema =>
    compileObject(
      resolveFunctionArgumentsDefinition(argsSchema, rootDoc ?? {}, {
        peers,
        isCommonTypeName: commonTypeName => Object.hasOwn(commonTypes, commonTypeName),
      }),
      new ConversionCache(commonTypes),
      compilation,
      {kind: 'functionArgs', name},
    );

  if (Array.isArray(rawFunctions)) {
    for (const fn of rawFunctions) {
      if (fn && typeof fn === 'object' && typeof fn.name === 'string') {
        const paramNames = functionParameterNames(fn.parameters, rootDoc);
        assertFunctionIdentifiers(fn.name, paramNames);
        if (permittedNames && !permittedNames.has(fn.name)) {
          continue;
        }
        const build = (peers: readonly PeerCatalogSource[]): FunctionApi => {
          const entry = new JsonFunctionApi<EntrySchema>(
            fn.name,
            fn as Record<string, unknown>,
            definition =>
              definition['parameters'] && typeof definition['parameters'] === 'object'
                ? convertArguments(
                    fn.name,
                    definition['parameters'] as Record<string, unknown>,
                    peers,
                  )
                : anyArguments(compilation, fn.name),
          );
          entryBuilders.set(entry, build);
          return entry;
        };
        result.push(build([]));
      }
    }
    return result;
  }

  if (typeof rawFunctions === 'object' && rawFunctions !== null) {
    for (const [name, defn] of Object.entries(rawFunctions)) {
      const rawDefn = defn && typeof defn === 'object' ? (defn as Record<string, unknown>) : {};
      const argsSchema = functionArgsSchema(rawDefn);
      const paramNames = functionParameterNames(argsSchema, rootDoc);
      assertFunctionIdentifiers(name, paramNames);
      if (permittedNames && !permittedNames.has(name)) {
        continue;
      }
      if (!defn || typeof defn !== 'object') continue;
      const build = (peers: readonly PeerCatalogSource[]): FunctionApi => {
        const entry = new JsonFunctionApi<EntrySchema>(
          name,
          defn as Record<string, unknown>,
          definition => {
            const argsSchema = functionArgsSchema(definition);
            return argsSchema
              ? convertArguments(name, argsSchema, peers)
              : anyArguments(compilation, name);
          },
        );
        entryBuilders.set(entry, build);
        return entry;
      };
      result.push(build([]));
    }
  }

  return result;
}

/**
 * Returns the schema of the arguments of a function a `functions` map
 * defines: its call schema's `args`, a bare map of argument schemas with the
 * object keywords beside it, or, for a definition that is not a call schema,
 * the definition itself.
 *
 * @param d The function's definition.
 */
function functionArgsSchema(
  d: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const props =
    d.properties &&
    typeof d.properties === 'object' &&
    d.properties !== null &&
    !Array.isArray(d.properties)
      ? (d.properties as Record<string, unknown>)
      : undefined;
  let argsSchema = props?.args ?? d.args ?? d.parameters;
  if (!argsSchema && props && !('call' in props) && !('@call' in props) && !('function' in props)) {
    argsSchema = d;
  } else if (isShorthandParameterMap(argsSchema)) {
    argsSchema = {
      type: 'object',
      properties: argsSchema as Record<string, unknown>,
      required: d.required,
      additionalProperties: d.additionalProperties,
    };
  }
  return argsSchema && typeof argsSchema === 'object' && !Array.isArray(argsSchema)
    ? (argsSchema as Record<string, unknown>)
    : undefined;
}

/**
 * Extracts permitted definition names matching a reference prefix from a `oneOf` array.
 *
 * @param oneOf Array of reference schema objects from `anyComponent` or `anyFunction`.
 * @param prefix Prefix to match and strip, such as `#/components/` or `#/functions/`.
 * @returns Set of unescaped allowed names, or undefined if `oneOf` is not an array.
 */
function extractPermittedNames(oneOf: unknown, prefix: string): Set<string> | undefined {
  if (!Array.isArray(oneOf)) return undefined;
  const permitted = new Set<string>();
  for (const item of oneOf) {
    if (typeof item?.$ref === 'string' && item.$ref.startsWith(prefix)) {
      const rawName = item.$ref.slice(prefix.length);
      const unescapedName = rawName.replace(/~([01])/g, (_: string, p1: string) =>
        p1 === '1' ? '/' : '~',
      );
      permitted.add(unescapedName);
    }
  }
  return permitted;
}

/**
 * Parses raw catalog component schemas into typed ComponentApi definitions.
 *
 * Validates UAX #31 identifier requirements for v1.0+ specifications, filters
 * components if permitted names are specified, and transforms JSON schemas into
 * runtime Zod schemas.
 *
 * @param componentsMap Mapping of component name to raw component schema definition.
 * @param catalogSchema Enclosing raw catalog schema for resolving local references.
 * @param compilation How the components' schemas are compiled.
 * @param atLeastV10 Whether the catalog targets protocol v1.0 or higher.
 * @param permittedNames Optional set of allowed component names from anyComponent.oneOf.
 * @param commonTypes The common type schemas of the catalog's protocol version.
 * @returns Array of parsed ComponentApi objects with validation schemas and hierarchy constraints.
 * @throws {A2uiCatalogError} If a component or property identifier fails UAX #31 validation in v1.0+.
 */
function parseCatalogComponents(
  componentsMap: Record<string, unknown>,
  catalogSchema: Record<string, unknown>,
  compilation: Compilation,
  atLeastV10: boolean,
  permittedNames?: Set<string>,
  commonTypes: CommonTypeSchemas = CommonSchemas,
): ComponentApi[] {
  const components: ComponentApi[] = [];

  for (const [name, rawCompSchema] of Object.entries(componentsMap)) {
    const rawComp = (rawCompSchema as Record<string, unknown>) || {};
    if (atLeastV10) {
      assertUax31Identifier(name, `component identifier: '${name}'`);
      const props = rawComp.properties;
      if (props && typeof props === 'object') {
        for (const propName of Object.keys(props as Record<string, unknown>)) {
          assertUax31Identifier(
            propName,
            `property identifier: '${propName}' in component '${name}'`,
          );
        }
      }
    }
    if (permittedNames && !permittedNames.has(name)) {
      continue;
    }
    const build = (peers: readonly PeerCatalogSource[]): ComponentApi => {
      const entry = new JsonComponentApi<EntrySchema>(name, rawComp, definition =>
        compileObject(
          resolveComponentDefinition(definition as Record<string, unknown>, catalogSchema, {
            peers,
            isCommonTypeName: commonTypeName => Object.hasOwn(commonTypes, commonTypeName),
            isAtLeastV10: atLeastV10,
          }),
          new ConversionCache(commonTypes),
          compilation,
          {kind: 'component', name},
        ),
      );
      entryBuilders.set(entry, build);
      return entry;
    };
    components.push(build([]));
  }
  return components;
}

/**
 * Extracts and compiles the theme schema from a catalog definition if present.
 *
 * Checks top-level theme, themeSchema, styles, and $defs.theme definitions.
 *
 * @param catalogSchema Raw catalog schema or capabilities definition object.
 * @param compilation How the theme's schema is compiled.
 * @param defs Optional $defs mapping from the root schema.
 * @returns Compiled schema for theme tokens, or undefined if not declared.
 */
function parseThemeSchema(
  catalogSchema: Record<string, unknown>,
  compilation: Compilation,
  defs?: Record<string, unknown>,
): EntrySchema | undefined {
  const rawTheme =
    catalogSchema.theme ??
    catalogSchema.themeSchema ??
    catalogSchema.styles ??
    (defs?.theme as Record<string, unknown> | undefined);
  if (rawTheme && typeof rawTheme === 'object') {
    const rawThemeObj = rawTheme as Record<string, unknown>;
    const normalizedThemeSchema =
      'properties' in rawThemeObj || 'allOf' in rawThemeObj || rawThemeObj.type === 'object'
        ? rawThemeObj
        : {type: 'object', properties: rawThemeObj};
    // A theme references no peers, and its common types are those of v1.0.
    return compileObject(
      resolveThemeDefinition(normalizedThemeSchema, catalogSchema, {
        isCommonTypeName: name => Object.hasOwn(CommonSchemas, name),
      }),
      new ConversionCache(),
      compilation,
      {kind: 'theme', name: 'theme'},
    );
  }
  return undefined;
}

/**
 * Parses a raw A2UI catalog schema into its typed component, function, and metadata fields.
 *
 * Parses component and function definitions, extracts hierarchy constraints (`allowedParents`,
 * `allowedChildren`), unescapes RFC 6901 JSON pointers, and builds runtime Zod validators.
 *
 * @param inputSchema Raw catalog schema or capabilities definition object. It
 *   is copied first and never referenced afterwards.
 * @param protocolVersion Protocol version of the catalog. When given, it takes
 *   precedence over the `protocolVersion` the schema declares and selects the
 *   version's loading rules; the declared version is still kept as written.
 *   Catalog schemas published before v1.0 omit `protocolVersion`; when
 *   neither the caller nor the schema supplies it, `DEFAULT_PROTOCOL_VERSION`
 *   applies.
 * @param catalogIdOverride Catalog ID to use instead of the one the schema
 *   declares. The schema itself is kept as written.
 * @param schemaCompiler Compiles the entries' and theme's schemas instead of
 *   the built-in Zod 3 compiler.
 * @returns Parsed catalog fields ready to construct a `Catalog` instance.
 * @throws {Error} If the catalog ID is missing or not a string.
 */
export function parseCatalogSchema(
  inputSchema: Record<string, unknown>,
  protocolVersion?: string,
  catalogIdOverride?: string,
  schemaCompiler?: CatalogSchemaCompiler,
): ParsedCatalogSchema {
  // Everything the catalog keeps, including what the Zod schemas close over,
  // comes from this copy, so mutating the input afterwards cannot change it.
  const catalogSchema = deepCopyJson(inputSchema);
  const catalogId =
    catalogIdOverride ?? catalogSchema.catalogId ?? catalogSchema.$id ?? catalogSchema.id;
  if (!catalogId || typeof catalogId !== 'string') {
    throw new Error("Catalog ID must be specified via catalog metadata ('catalogId' or '$id').");
  }

  // Filter permitted components via anyComponent.oneOf if declared
  const defs = catalogSchema.$defs as Record<string, unknown> | undefined;
  const anyComp = defs?.anyComponent as Record<string, unknown> | undefined;
  const permittedNames = extractPermittedNames(anyComp?.oneOf, '#/components/');

  const resolvedVersion =
    protocolVersion ??
    (catalogSchema.protocolVersion as string | undefined) ??
    DEFAULT_PROTOCOL_VERSION;
  const atLeastV10 = isAtLeastVersion(resolvedVersion, '1.0');
  const commonTypes = commonTypeSchemasFor(resolvedVersion);
  const compilation: Compilation = {compiler: schemaCompiler, protocolVersion: resolvedVersion};

  const componentsMap = (catalogSchema.components as Record<string, unknown>) ?? {};
  const components = parseCatalogComponents(
    componentsMap,
    catalogSchema,
    compilation,
    atLeastV10,
    permittedNames,
    commonTypes,
  );

  // Filter permitted functions via anyFunction.oneOf if declared
  const anyFunc = defs?.anyFunction as Record<string, unknown> | undefined;
  const permittedFunctionNames = extractPermittedNames(anyFunc?.oneOf, '#/functions/');

  const functions = parseFunctionDefinitions(
    catalogSchema.functions,
    compilation,
    catalogSchema,
    permittedFunctionNames,
    atLeastV10,
    commonTypes,
  );

  const themeSchema = parseThemeSchema(catalogSchema, compilation, defs);

  // The copy is frozen: the entries' definitions and the document fields
  // refer into it.
  deepFreeze(catalogSchema);

  return {
    id: catalogId,
    protocolVersion: resolvedVersion,
    components,
    functions,
    themeSchema,
    ...readDocumentFields(catalogSchema, components, functions),
  };
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether `actual` is the union a catalog computes, ignoring object key order.
 */
function isComputedUnion(actual: unknown, computed: Record<string, unknown>): boolean {
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
  document: Readonly<Record<string, unknown>>,
  components: readonly ComponentApi[],
  functions: readonly FunctionApi[],
): CatalogDocumentOptions {
  const fields: CatalogDocumentOptions = {};
  const extensionFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(document)) {
    if (key in DOCUMENT_STRING_FIELDS && typeof value === 'string') {
      fields[DOCUMENT_STRING_FIELDS[key as keyof typeof DOCUMENT_STRING_FIELDS]] = value;
    } else if (key === 'protocolVersion' && typeof value === 'string') {
      fields.declaredProtocolVersion = value;
    } else if (key === 'functions' && (Array.isArray(value) || isPlainObject(value))) {
      fields.functionsLayout = Array.isArray(value) ? 'list' : 'map';
    } else if (key === '$defs' && isPlainObject(value)) {
      const anyComponent = isComputedUnion(
        value['anyComponent'],
        buildComponentUnion(components.map(c => c.name)),
      );
      const anyFunction = isComputedUnion(
        value['anyFunction'],
        buildFunctionUnion(functions.map(f => f.name)),
      );
      fields.unions = {anyComponent, anyFunction};
      const defs: Record<string, unknown> = {};
      for (const [name, def] of Object.entries(value)) {
        if ((name === 'anyComponent' && anyComponent) || (name === 'anyFunction' && anyFunction)) {
          continue;
        }
        defs[name] = def;
      }
      fields.defs = Object.freeze(defs);
    } else if (
      !DOCUMENT_STRUCTURE_FIELDS.has(key) ||
      (key === 'components' && !isPlainObject(value))
    ) {
      extensionFields[key] = value;
    }
  }
  fields.declaredProtocolVersion ??= null;
  fields.declaresCatalogId = typeof document['catalogId'] === 'string';
  fields.declaresComponents = isPlainObject(document['components']);
  fields.unions ??= {anyComponent: false, anyFunction: false};
  if (Object.keys(extensionFields).length > 0) {
    fields.extensionFields = Object.freeze(extensionFields);
  }
  return fields;
}
