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
 * @fileoverview `$ref` resolution across a catalog document and its peers.
 *
 * Plain JSON Schema handling that every schema adapter shares: matching the
 * document part of a `$ref` to a peer catalog, resolving JSON pointers, and
 * inlining references to local and peer definitions.
 */

import {A2uiCatalogError} from '../errors.js';
import {V10_STANDARD_DEFS} from '../standard_defs.js';
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
export function splitRef(ref: string): {doc: string; fragment: string} {
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
  const cid = peer['catalogId'];
  const sid = peer['$id'];
  return {
    id: typeof cid === 'string' ? cid : undefined,
    schemaId: typeof sid === 'string' ? sid : undefined,
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
export function resolveRefDocument(doc: string, peers: readonly PeerCatalogSource[]): RefDocument {
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

/** Stable identities of the documents local `#/...` pointers resolve into. */
const documentIds = new WeakMap<object, number>();
let nextDocumentId = 0;

/** Returns a key that identifies `doc` for cycle detection and caching. */
export function documentKey(doc: object): number {
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
   * Key identifying the target for cycle detection and caching: the
   * document's identity and the pointer for a pointer into the current
   * document, and the reference itself for a peer.
   */
  readonly key: string;
  /** Whether the target is in a peer catalog rather than the current document. */
  readonly isPeer: boolean;
}

/**
 * The peer catalogs `$ref`s resolve against while converting or inlining one
 * schema, with each peer's document read once.
 */
export class PeerScope {
  private readonly documents = new Map<PeerCatalogSource, Readonly<Record<string, unknown>>>();

  constructor(readonly peers: readonly PeerCatalogSource[] = []) {}

  /** Returns the catalog document of a peer. */
  documentOf(peer: PeerCatalogSource): Readonly<Record<string, unknown>> {
    if (!isCatalogInstance(peer)) return peer;
    let doc = this.documents.get(peer);
    if (!doc) {
      doc = peer.toJson();
      this.documents.set(peer, doc);
    }
    return doc;
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
   * Throws if `ref` points into another catalog document that no peer
   * matches: such a reference is a catalog error, never a schema that accepts
   * any value.
   *
   * @throws {A2uiCatalogError} If `ref` is an unresolvable cross-catalog reference.
   */
  assertResolvable(ref: string): void {
    if (resolveRefDocument(splitRef(ref).doc, this.peers).kind === 'unresolved') {
      throwUnresolvableRef(ref);
    }
  }
}

/** Reports a reference whose target cannot be found as a catalog error. */
export function throwUnresolvableRef(ref: string): never {
  throw new A2uiCatalogError(`Unresolvable schema reference: '${ref}'`);
}

/**
 * Whether a property name is one of the component envelope fields (`id`,
 * `component`, `catalogId`), which route a component rather than configure it.
 * The validation schema leaves them out of a component for the same reason, and
 * `PayloadValidator` strips them before parsing a component.
 *
 * @param propName Property name to check.
 * @returns True if the property belongs to the envelope rather than the component.
 */
export function isComponentEnvelopeField(propName: string): boolean {
  return propName === 'id' || propName === 'component' || propName === 'catalogId';
}

function stripEnvelopeFromSubschema(node: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'unevaluatedProperties' || k === 'additionalProperties' || k === 'title') {
      continue;
    }
    cleaned[k] = v;
  }
  if (
    cleaned.properties &&
    typeof cleaned.properties === 'object' &&
    !Array.isArray(cleaned.properties)
  ) {
    const nextProps: Record<string, unknown> = {};
    for (const [pk, pv] of Object.entries(cleaned.properties as Record<string, unknown>)) {
      if (!isComponentEnvelopeField(pk)) {
        nextProps[pk] = pv;
      }
    }
    cleaned.properties = nextProps;
  }
  if (Array.isArray(cleaned.required)) {
    cleaned.required = cleaned.required.filter(
      (r): r is string => typeof r === 'string' && !isComponentEnvelopeField(r),
    );
  }
  if (Array.isArray(cleaned.allOf)) {
    const specific: unknown[] = [];
    const inherited: unknown[] = [];
    for (const item of cleaned.allOf) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const itemObj = item as Record<string, unknown>;
        const itemProps = itemObj.properties;
        const hasComp =
          Boolean(itemProps) &&
          typeof itemProps === 'object' &&
          !Array.isArray(itemProps) &&
          'component' in (itemProps as Record<string, unknown>);
        const strippedItem = stripEnvelopeFromSubschema(itemObj);
        if (hasComp) {
          specific.push(strippedItem);
        } else {
          inherited.push(strippedItem);
        }
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
  if (parts.length !== 2) return node;
  return stripEnvelopeFromSubschema(node);
}

/**
 * Resolves a `$ref` into a peer catalog to its target, without the component
 * envelope when the target is a whole component.
 */
export function resolvePeerTarget(
  target: RefTarget,
): {doc: Record<string, unknown>; target: Record<string, unknown>} | undefined {
  const doc = target.doc as Record<string, unknown>;
  const raw = resolveJsonPointer(doc, target.pointer);
  return raw ? {doc, target: stripReferencedComponentEnvelope(raw, target.pointer)} : undefined;
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
 *     pointers of `rootDoc` (pointers inside a peer document are always
 *     inlined). `visited`: keys of the references already being inlined.
 */
export function inlinePeerAndLocalRefs(
  node: unknown,
  rootDoc: Record<string, unknown>,
  peers: readonly PeerCatalogSource[] = [],
  options: {inlineLocalDefs?: boolean; visited?: Set<string>} = {},
): unknown {
  return inlineRefs(
    node,
    rootDoc,
    new PeerScope(peers),
    options.inlineLocalDefs ?? true,
    options.visited ?? new Set<string>(),
  );
}

function inlineRefs(
  node: unknown,
  rootDoc: Readonly<Record<string, unknown>>,
  scope: PeerScope,
  inlineLocalDefs: boolean,
  visited: Set<string>,
): unknown {
  if (Array.isArray(node)) {
    return node.map(item => inlineRefs(item, rootDoc, scope, inlineLocalDefs, visited));
  }
  if (!node || typeof node !== 'object') {
    return node;
  }

  const obj = node as Record<string, unknown>;
  if (typeof obj.$ref === 'string') {
    let target = scope.resolve(obj.$ref, rootDoc);
    if (target && !target.isPeer) {
      const defName = target.pointer.split('/').pop() ?? '';
      const isPreservedCommonType =
        target.pointer.startsWith('#/$defs/') && Object.hasOwn(V10_STANDARD_DEFS, defName);
      if (isPreservedCommonType || (!inlineLocalDefs && target.pointer.startsWith('#/$defs/'))) {
        target = undefined;
      }
    }

    if (target && !visited.has(target.key)) {
      const resolvedTarget = resolveJsonPointer(
        target.doc as Record<string, unknown>,
        target.pointer,
      );
      if (resolvedTarget) {
        const nextVisited = new Set(visited);
        nextVisited.add(target.key);
        const inlinedTarget = inlineRefs(
          resolvedTarget,
          target.doc,
          scope,
          target.isPeer ? true : inlineLocalDefs,
          nextVisited,
        );
        if (inlinedTarget && typeof inlinedTarget === 'object' && !Array.isArray(inlinedTarget)) {
          const stripped = stripReferencedComponentEnvelope(
            inlinedTarget as Record<string, unknown>,
            target.pointer,
          );
          const res: Record<string, unknown> = {...stripped};
          for (const [k, v] of Object.entries(obj)) {
            if (k === '$ref') continue;
            const inlinedVal = inlineRefs(v, rootDoc, scope, inlineLocalDefs, visited);
            if (
              k in res &&
              res[k] &&
              typeof res[k] === 'object' &&
              !Array.isArray(res[k]) &&
              inlinedVal &&
              typeof inlinedVal === 'object' &&
              !Array.isArray(inlinedVal)
            ) {
              res[k] = {
                ...(res[k] as Record<string, unknown>),
                ...(inlinedVal as Record<string, unknown>),
              };
            } else if (Array.isArray(res[k]) && Array.isArray(inlinedVal)) {
              const existing = res[k] as unknown[];
              res[k] = [...existing, ...inlinedVal.filter(item => !existing.includes(item))];
            } else {
              res[k] = inlinedVal;
            }
          }
          return res;
        }
        return inlinedTarget;
      }
    }
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = inlineRefs(v, rootDoc, scope, inlineLocalDefs, visited);
  }
  return out;
}

/**
 * Resolves a JSON Pointer within a root JSON document.
 *
 * Follows RFC 6901 pointer unescaping (~1 -> /, ~0 -> ~).
 *
 * @param rootDoc Root JSON document to resolve within.
 * @param pointer RFC 6901 JSON pointer string.
 * @returns The resolved document subtree, or undefined if not found.
 */
export function resolveJsonPointer(
  rootDoc: Record<string, unknown>,
  pointer: string,
): Record<string, unknown> | undefined {
  if (!pointer.startsWith('#/')) return undefined;
  const segments = pointer
    .slice(2)
    .split('/')
    .map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));

  let curr: unknown = rootDoc;
  for (const seg of segments) {
    if (curr && typeof curr === 'object' && seg in curr) {
      curr = (curr as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof curr === 'object' && curr !== null ? (curr as Record<string, unknown>) : undefined;
}

/**
 * Checks whether an object schema represents a shorthand parameter map (a map
 * of parameter names to subschemas), rather than a full JSON Schema object or
 * reference combinator.
 */
export function isShorthandParameterMap(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return false;
  }
  const s = schema as Record<string, unknown>;
  return (
    Object.keys(s).length > 0 &&
    s.properties === undefined &&
    typeof s.type !== 'string' &&
    !('$ref' in s) &&
    !('allOf' in s) &&
    !('oneOf' in s) &&
    !('anyOf' in s) &&
    !('not' in s) &&
    Object.values(s).every(v => v !== null && (typeof v === 'object' || typeof v === 'boolean'))
  );
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
      const hash = value.indexOf('#');
      const doc = hash < 0 ? value : value.slice(0, hash);
      if (doc && doc !== CATALOG_DOCUMENT && !isDocumentNamed(doc, COMMON_TYPES_DOCUMENT)) {
        return true;
      }
    } else if (hasCrossDocumentRefs(value)) {
      return true;
    }
  }
  return false;
}
