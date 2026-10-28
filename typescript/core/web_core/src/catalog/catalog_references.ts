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

import {A2uiCatalogError} from '../errors.js';
import type {JsonSchemaObject} from './spec_annotations.js';
import type {CatalogInterface, ComponentApi, FunctionApi} from './types.js';

/**
 * A peer catalog that a cross-catalog `$ref` can resolve against: a catalog,
 * or a raw catalog document.
 */
export type PeerCatalogSource =
  | CatalogInterface<ComponentApi, FunctionApi>
  | Readonly<Record<string, unknown>>;

const COMMON_TYPES_DOCUMENT = 'common_types.json';
const CATALOG_DOCUMENT = 'catalog.json';

/** Whether `doc` is the document `name`, bare or as the last segment of a path. */
function isDocumentNamed(doc: string, name: string): boolean {
  return doc === name || doc.endsWith(`/${name}`);
}

/** Returns the last `/`-separated segment of a path or URI. */
function lastPathSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Splits a `$ref` at its first `#` into its document and fragment. */
function splitRef(ref: string): {doc: string; fragment: string} {
  const hashIdx = ref.indexOf('#');
  return hashIdx < 0
    ? {doc: ref, fragment: ''}
    : {doc: ref.slice(0, hashIdx), fragment: ref.slice(hashIdx)};
}

/**
 * Where the document part of a `$ref` points: the document that contains the
 * reference (`self`), the common types document, a peer catalog, or nowhere
 * known.
 */
type RefDocument =
  | {readonly kind: 'self'}
  | {readonly kind: 'commonTypes'}
  | {readonly kind: 'peer'; readonly peer: PeerCatalogSource}
  | {readonly kind: 'unresolved'};

function isCatalogInstance(
  peer: PeerCatalogSource,
): peer is CatalogInterface<ComponentApi, FunctionApi> {
  return typeof (peer as CatalogInterface<ComponentApi, FunctionApi>).toJson === 'function';
}

function peerIds(peer: PeerCatalogSource): {id?: string; schemaId?: string} {
  if (isCatalogInstance(peer)) {
    return {id: peer.id, schemaId: peer.schemaId};
  }
  const catalogId = peer['catalogId'];
  const schemaId = peer['$id'];
  return {
    id: typeof catalogId === 'string' ? catalogId : undefined,
    schemaId: typeof schemaId === 'string' ? schemaId : undefined,
  };
}

/**
 * Resolves the document part `doc` of a `$ref` with the peer matching rule:
 *
 * 1. An empty `doc` is the document that contains the reference.
 * 2. `common_types.json`, bare or as a path suffix, is the common types
 *    document.
 * 3. A bare `catalog.json` is the document that contains the reference.
 * 4. Otherwise, the first peer whose `catalogId` or `$id` equals `doc`, ends
 *    with `/` + `doc`, or is a `/`-suffix of `doc`.
 * 5. Otherwise, a `doc` ending in `/catalog.json` is the document that contains
 *    the reference.
 * 6. Otherwise, the first peer whose `$id` or `catalogId` has the same last
 *    path segment as `doc`.
 * 7. Otherwise, the reference is unresolved.
 */
function resolveRefDocument(doc: string, peers: readonly PeerCatalogSource[]): RefDocument {
  if (!doc) return {kind: 'self'};
  if (isDocumentNamed(doc, COMMON_TYPES_DOCUMENT)) return {kind: 'commonTypes'};
  if (doc === CATALOG_DOCUMENT) return {kind: 'self'};

  for (const peer of peers) {
    const {id, schemaId} = peerIds(peer);
    for (const candidate of [id, schemaId]) {
      if (
        candidate &&
        (doc === candidate || candidate.endsWith(`/${doc}`) || doc.endsWith(`/${candidate}`))
      ) {
        return {kind: 'peer', peer};
      }
    }
  }

  if (doc.endsWith(`/${CATALOG_DOCUMENT}`)) return {kind: 'self'};

  const base = lastPathSegment(doc);
  for (const peer of peers) {
    const {id, schemaId} = peerIds(peer);
    for (const candidate of [schemaId, id]) {
      if (candidate && lastPathSegment(candidate) === base) {
        return {kind: 'peer', peer};
      }
    }
  }
  return {kind: 'unresolved'};
}

/**
 * Whether a JSON document contains a `$ref` into another catalog document: one
 * whose document part is neither empty, nor the common types document, nor a
 * bare `catalog.json`.
 *
 * @param node A catalog document or a part of one.
 */
export function hasCrossDocumentRefs(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasCrossDocumentRefs);
  if (!node || typeof node !== 'object') return false;
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const {doc} = splitRef(value);
      if (doc && doc !== CATALOG_DOCUMENT && !isDocumentNamed(doc, COMMON_TYPES_DOCUMENT)) {
        return true;
      }
    } else if (hasCrossDocumentRefs(value)) {
      return true;
    }
  }
  return false;
}

/** Stable identities of the documents local `#/...` pointers resolve into. */
const documentIds = new WeakMap<object, number>();
let nextDocumentId = 0;

/** Returns a key that identifies `doc` for cycle detection and caching. */
function documentKey(doc: object): number {
  let id = documentIds.get(doc);
  if (id === undefined) {
    id = nextDocumentId++;
    documentIds.set(doc, id);
  }
  return id;
}

/** A `$ref` resolved to the document and pointer it targets. */
export interface RefTarget {
  /** The document the pointer resolves in. */
  readonly doc: Readonly<Record<string, unknown>>;
  /** The JSON pointer within `doc`, starting with `#/`. */
  readonly pointer: string;
  /**
   * Key identifying the target for cycle detection and caching: the document's
   * identity and pointer for a local reference, and the reference itself for a
   * peer reference.
   */
  readonly key: string;
  /** Whether the target is in a peer catalog rather than the current document. */
  readonly isPeer: boolean;
}

/**
 * The peer catalogs `$ref`s resolve against while loading or inlining a schema.
 * Common-type mirrors remain in the Zod-specific conversion cache.
 */
export class PeerScope {
  private readonly documents = new Map<PeerCatalogSource, Readonly<Record<string, unknown>>>();

  constructor(readonly peers: readonly PeerCatalogSource[] = []) {}

  /** Returns the catalog document of a peer, reading a Catalog only once. */
  documentOf(peer: PeerCatalogSource): Readonly<Record<string, unknown>> {
    if (!isCatalogInstance(peer)) return peer;
    let document = this.documents.get(peer);
    if (!document) {
      document = peer.toJson();
      this.documents.set(peer, document);
    }
    return document;
  }

  /**
   * Resolves `ref`, written in `currentDoc`, to the document and pointer it
   * targets, or returns `undefined` for a reference to the common types, to
   * an unknown document, or without a JSON pointer fragment.
   */
  resolve(ref: string, currentDoc: Readonly<Record<string, unknown>>): RefTarget | undefined {
    const {doc, fragment} = splitRef(ref);
    if (!fragment.startsWith('#/')) return undefined;
    const target = resolveRefDocument(doc, this.peers);
    if (target.kind === 'self') {
      return {
        doc: currentDoc,
        pointer: fragment,
        key: `${documentKey(currentDoc)}:${fragment}`,
        isPeer: false,
      };
    }
    if (target.kind === 'peer') {
      return {doc: this.documentOf(target.peer), pointer: fragment, key: ref, isPeer: true};
    }
    return undefined;
  }

  /**
   * Throws if `ref` points into another catalog document that no peer matches:
   * an unresolved cross-catalog reference is a catalog error, never a schema
   * that accepts any value.
   *
   * @throws {A2uiCatalogError} If `ref` cannot be resolved through peers.
   */
  assertResolvable(ref: string): void {
    if (resolveRefDocument(splitRef(ref).doc, this.peers).kind === 'unresolved') {
      throwUnresolvableRef(ref);
    }
  }
}

/** Reports a reference whose target cannot be found as a catalog error. */
function throwUnresolvableRef(ref: string): never {
  throw new A2uiCatalogError(`Unresolvable schema reference: '${ref}'`);
}

/** Whether a property belongs to a component envelope rather than its properties. */
function isEnvelopeField(propertyName: string): boolean {
  return propertyName === 'id' || propertyName === 'component' || propertyName === 'catalogId';
}

/**
 * Removes a referenced component's envelope fields and closure keywords.
 * Component-specific `allOf` members stay before inherited members so an
 * inlined component retains the same property precedence as its source.
 */
function stripEnvelopeFromSubschema(node: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'unevaluatedProperties' || key === 'additionalProperties' || key === 'title') {
      continue;
    }
    cleaned[key] = value;
  }
  if (
    cleaned.properties &&
    typeof cleaned.properties === 'object' &&
    !Array.isArray(cleaned.properties)
  ) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cleaned.properties as Record<string, unknown>)) {
      if (!isEnvelopeField(key)) properties[key] = value;
    }
    cleaned.properties = properties;
  }
  if (Array.isArray(cleaned.required)) {
    cleaned.required = cleaned.required.filter(
      (value): value is string => typeof value === 'string' && !isEnvelopeField(value),
    );
  }
  if (Array.isArray(cleaned.allOf)) {
    const specific: unknown[] = [];
    const inherited: unknown[] = [];
    for (const item of cleaned.allOf) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const object = item as Record<string, unknown>;
        const properties = object.properties;
        const hasComponent =
          Boolean(properties) &&
          typeof properties === 'object' &&
          !Array.isArray(properties) &&
          'component' in (properties as Record<string, unknown>);
        const stripped = stripEnvelopeFromSubschema(object);
        (hasComponent ? specific : inherited).push(stripped);
      } else {
        inherited.push(item);
      }
    }
    cleaned.allOf = [...specific, ...inherited];
  }
  return cleaned;
}

function stripReferencedComponentEnvelope(
  node: Record<string, unknown>,
  pointer: string,
): Record<string, unknown> {
  if (!pointer.startsWith('#/components/')) return node;
  const parts = pointer.slice(2).split('/');
  return parts.length === 2 ? stripEnvelopeFromSubschema(node) : node;
}

/**
 * Resolves a JSON Pointer within a root JSON document.
 *
 * Follows RFC 6901 pointer unescaping (`~1` to `/`, `~0` to `~`).
 *
 * @param rootDoc Root JSON document containing the pointer target.
 * @param pointer RFC 6901 JSON pointer starting with `#/`.
 * @returns The target JSON object, or `undefined` when the pointer is invalid
 *     or resolves to a non-object value.
 */
export function resolveJsonPointer(
  rootDoc: Record<string, unknown>,
  pointer: string,
): Record<string, unknown> | undefined {
  if (!pointer.startsWith('#/')) return undefined;
  let current: unknown = rootDoc;
  for (const segment of pointer
    .slice(2)
    .split('/')
    .map(value => value.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof current === 'object' && current !== null
    ? (current as Record<string, unknown>)
    : undefined;
}

/** Resolves a peer reference to its target, omitting a referenced component envelope. */
export function resolvePeerTarget(
  target: RefTarget,
): {doc: Record<string, unknown>; target: Record<string, unknown>} | undefined {
  const doc = target.doc as Record<string, unknown>;
  const resolved = resolveJsonPointer(doc, target.pointer);
  return resolved
    ? {doc, target: stripReferencedComponentEnvelope(resolved, target.pointer)}
    : undefined;
}

/**
 * A schema definition resolved against its catalog and peers.
 *
 * The entry schema retains its named references. Every local or peer target it
 * reaches is bundled under `$defs`; references to common types remain external.
 */
export interface ResolvedDefinition {
  readonly schema: JsonSchemaObject;
  readonly defs: Readonly<Record<string, JsonSchemaObject>>;
  /** Definition names that originated in the catalog containing `schema`. */
  readonly localDefinitionNames: ReadonlySet<string>;
}

/** Options for resolving an entry schema's references. */
export interface ResolveDefinitionOptions {
  /**
   * Whether a referenced component written in the same document as its
   * reference loses its envelope, as a component in a peer catalog always
   * does. Defaults to `true`.
   */
  readonly stripLocalComponentEnvelopes?: boolean;
  /**
   * Whether a definition name stands for the protocol common type of that
   * name. A reference to such a definition outside the root catalog's own
   * `$defs` is written as a reference into `common_types.json` instead of
   * being bundled. By default no name does.
   */
  readonly isCommonTypeName?: (name: string) => boolean;
}

/** Returns the definition name a `$ref` points at, or `undefined` for any other pointer. */
function definitionNameOf(ref: string): string | undefined {
  return ref.split(/#\/(?:\$defs|definitions)\//)[1];
}

/**
 * Resolves the references an entry schema reaches without flattening them.
 *
 * Local `$defs` remain local references and their definitions are bundled
 * under the same name. Peer targets are copied under collision-free names and
 * their references are rewritten to those local definitions. Common-type
 * references remain external because the protocol owns their documents.
 */
export function resolveDefinition(
  schema: JsonSchemaObject,
  rootDoc: Record<string, unknown>,
  peers: readonly PeerCatalogSource[] = [],
  options: ResolveDefinitionOptions = {},
): ResolvedDefinition {
  const {stripLocalComponentEnvelopes = true, isCommonTypeName = () => false} = options;
  const scope = new PeerScope(peers);
  const defs: Record<string, JsonSchemaObject> = {};
  const localDefinitionNames = new Set<string>();
  const namesByTarget = new Map<string, string>();
  const usedNames = new Set<string>();

  const localDefs = rootDoc['$defs'];
  if (localDefs && typeof localDefs === 'object' && !Array.isArray(localDefs)) {
    for (const name of Object.keys(localDefs as Record<string, unknown>)) usedNames.add(name);
  }

  const pointerSegment = (pointer: string): string =>
    pointer.split('/').filter(Boolean).at(-1)?.replace(/~1/g, '/').replace(/~0/g, '~') ?? 'target';
  // Names a bundled target that is not a root `$defs` entry: a peer target
  // after its peer, and a root component after the component, never reusing a
  // root definition name or another bundled name.
  const bundledName = (target: RefTarget): string => {
    const prefix =
      target.doc === rootDoc
        ? 'component'
        : `peer_${peers.findIndex(peer => scope.documentOf(peer) === target.doc)}`;
    const base = `${prefix}_${pointerSegment(target.pointer)}`;
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) name = `${base}_${suffix++}`;
    usedNames.add(name);
    return name;
  };

  const transform = (value: unknown, document: Readonly<Record<string, unknown>>): unknown => {
    if (Array.isArray(value)) return value.map(item => transform(item, document));
    if (!value || typeof value !== 'object') return value;

    const object = value as Record<string, unknown>;
    const ref = object['$ref'];
    const target = typeof ref === 'string' ? scope.resolve(ref, document) : undefined;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(object)) {
      result[key] = key === '$ref' ? child : transform(child, document);
    }
    if (!target) return result;

    const resolved = resolveJsonPointer(target.doc as Record<string, unknown>, target.pointer);
    if (!resolved) {
      scope.assertResolvable(ref as string);
      return result;
    }

    const rootLocalDefinition =
      target.doc === rootDoc && target.pointer.startsWith('#/$defs/')
        ? target.pointer
            .slice('#/$defs/'.length)
            .split('/')[0]
            ?.replace(/~1/g, '/')
            .replace(/~0/g, '~')
        : undefined;
    const commonTypeName = definitionNameOf(ref as string);
    if (!rootLocalDefinition && commonTypeName !== undefined && isCommonTypeName(commonTypeName)) {
      result['$ref'] = `common_types.json#/$defs/${commonTypeName}`;
      return result;
    }
    const name = rootLocalDefinition ?? namesByTarget.get(target.key) ?? bundledName(target);
    if (rootLocalDefinition) localDefinitionNames.add(name);
    namesByTarget.set(target.key, name);

    if (!(name in defs)) {
      defs[name] = {};
      const definition = rootLocalDefinition
        ? (resolveJsonPointer(
            target.doc as Record<string, unknown>,
            `#/$defs/${rootLocalDefinition}`,
          ) ?? resolved)
        : target.isPeer || stripLocalComponentEnvelopes
          ? stripReferencedComponentEnvelope(resolved, target.pointer)
          : resolved;
      defs[name] = transform(definition, target.doc) as JsonSchemaObject;
    }

    if (!rootLocalDefinition) {
      result['$ref'] = `#/$defs/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    }
    return result;
  };

  const resolvedSchema = transform(schema, rootDoc) as JsonSchemaObject;
  return {schema: resolvedSchema, defs, localDefinitionNames};
}

/** Options for resolving references inline in a JSON Schema definition. */
export interface InlineReferenceOptions {
  /** Reference identities already being resolved, used to stop recursive loops. */
  readonly visited?: Set<string>;
  /** Whether a local `$defs` name remains a named reference rather than being inlined. */
  readonly keepLocalDefinition?: (name: string) => boolean;
}

/**
 * Returns a copy of `node` with local and peer catalog references resolved
 * inline. The caller chooses which local definitions remain named references.
 */
export function inlineSchemaReferences(
  node: unknown,
  rootDoc: Record<string, unknown>,
  peers: readonly PeerCatalogSource[] = [],
  options: InlineReferenceOptions = {},
): unknown {
  const definition = resolveDefinition(node as JsonSchemaObject, rootDoc, peers);
  return inlineResolvedDefinition(definition, options);
}

/**
 * Resolves the named references of a bundled definition inline for consumers
 * that require them. When a reference has sibling keywords, object keywords
 * are shallow-merged with the sibling winning and array keywords are unioned,
 * preserving the established catalog mixin precedence.
 */
export function inlineResolvedDefinition(
  definition: ResolvedDefinition,
  options: InlineReferenceOptions = {},
): unknown {
  const rootDoc = {$defs: definition.defs};
  return inlineReferences(
    definition.schema,
    rootDoc,
    new PeerScope(),
    options.visited ?? new Set<string>(),
    name =>
      definition.localDefinitionNames.has(name) && (options.keepLocalDefinition?.(name) ?? false),
  );
}

function inlineReferences(
  node: unknown,
  rootDoc: Readonly<Record<string, unknown>>,
  scope: PeerScope,
  visited: Set<string>,
  keepLocalDefinition: (name: string) => boolean,
): unknown {
  if (Array.isArray(node)) {
    return node.map(item => inlineReferences(item, rootDoc, scope, visited, keepLocalDefinition));
  }
  if (!node || typeof node !== 'object') return node;

  const object = node as Record<string, unknown>;
  if (typeof object.$ref === 'string') {
    let target = scope.resolve(object.$ref, rootDoc);
    if (target && !target.isPeer) {
      const definitionName = target.pointer.split('/').pop() ?? '';
      if (target.pointer.startsWith('#/$defs/') && keepLocalDefinition(definitionName)) {
        target = undefined;
      }
    }

    if (target && !visited.has(target.key)) {
      const resolved = resolveJsonPointer(target.doc as Record<string, unknown>, target.pointer);
      if (resolved) {
        const nextVisited = new Set(visited).add(target.key);
        const inlined = inlineReferences(
          resolved,
          target.doc,
          scope,
          nextVisited,
          keepLocalDefinition,
        );
        if (inlined && typeof inlined === 'object' && !Array.isArray(inlined)) {
          const result: Record<string, unknown> = {
            ...stripReferencedComponentEnvelope(inlined as Record<string, unknown>, target.pointer),
          };
          for (const [key, value] of Object.entries(object)) {
            if (key === '$ref') continue;
            const inlinedValue = inlineReferences(
              value,
              rootDoc,
              scope,
              visited,
              keepLocalDefinition,
            );
            if (
              key in result &&
              result[key] &&
              typeof result[key] === 'object' &&
              !Array.isArray(result[key]) &&
              inlinedValue &&
              typeof inlinedValue === 'object' &&
              !Array.isArray(inlinedValue)
            ) {
              result[key] = {
                ...(result[key] as Record<string, unknown>),
                ...(inlinedValue as object),
              };
            } else if (Array.isArray(result[key]) && Array.isArray(inlinedValue)) {
              const existing = result[key] as unknown[];
              result[key] = [...existing, ...inlinedValue.filter(item => !existing.includes(item))];
            } else {
              result[key] = inlinedValue;
            }
          }
          return result;
        }
        return inlined;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key,
      inlineReferences(value, rootDoc, scope, visited, keepLocalDefinition),
    ]),
  );
}
