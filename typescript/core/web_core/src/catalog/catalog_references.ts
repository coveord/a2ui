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
export function throwUnresolvableRef(ref: string): never {
  throw new A2uiCatalogError(`Unresolvable schema reference: '${ref}'`);
}
