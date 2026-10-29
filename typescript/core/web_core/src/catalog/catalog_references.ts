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

import type {JsonSchemaObject} from './spec_annotations.js';

const CATALOG_DOCUMENT = 'catalog.json';

/** Whether `doc` is the document `name`, bare or as the last segment of a path. */
function isDocumentNamed(doc: string, name: string): boolean {
  return doc === name || doc.endsWith(`/${name}`);
}

/** Splits a `$ref` at its first `#` into its document and fragment. */
function splitRef(ref: string): {doc: string; fragment: string} {
  const hashIdx = ref.indexOf('#');
  return hashIdx < 0
    ? {doc: ref, fragment: ''}
    : {doc: ref.slice(0, hashIdx), fragment: ref.slice(hashIdx)};
}

/**
 * Whether the document part `doc` of a `$ref` is the document that contains
 * the reference: an empty `doc`, or a `catalog.json`, bare or as the last
 * segment of a path.
 */
function isOwnDocument(doc: string): boolean {
  return !doc || isDocumentNamed(doc, CATALOG_DOCUMENT);
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
  /** Key identifying the target for cycle detection and caching: the document's identity and pointer. */
  readonly key: string;
}

/**
 * Resolves the `$ref`s of a catalog document: a reference into the document
 * itself to its target, and one into the common types to nothing, since the
 * protocol owns that document. A reference into any other document is not
 * resolved: `parseCatalogSchema` rejects one from v1.0, and an earlier
 * catalog ignores it.
 */
export class RefScope {
  /**
   * Resolves `ref`, written in `currentDoc`, to the document and pointer it
   * targets, or returns `undefined` for a reference to the common types, to
   * another document, or without a JSON pointer fragment.
   */
  resolve(ref: string, currentDoc: Readonly<Record<string, unknown>>): RefTarget | undefined {
    const {doc, fragment} = splitRef(ref);
    if (!fragment.startsWith('#/') || !isOwnDocument(doc)) return undefined;
    return {doc: currentDoc, pointer: fragment, key: `${documentKey(currentDoc)}:${fragment}`};
  }
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

/**
 * A schema definition resolved against its catalog.
 *
 * The entry schema retains its named references. Every target it reaches in
 * its catalog is bundled under `$defs`; references to common types remain
 * external.
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
   * Whether a referenced component loses its envelope. Defaults to `true`.
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
 * under the same name. Other targets in the catalog, such as a component, are
 * copied under collision-free names and their references are rewritten to
 * those local definitions. Common-type references remain external because the
 * protocol owns their documents, and so does a reference into any other
 * document, which `parseCatalogSchema` rejects from v1.0.
 */
export function resolveDefinition(
  schema: JsonSchemaObject,
  rootDoc: Record<string, unknown>,
  options: ResolveDefinitionOptions = {},
): ResolvedDefinition {
  const {stripLocalComponentEnvelopes = true, isCommonTypeName = () => false} = options;
  const scope = new RefScope();
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
  // Names a bundled target that is not a root `$defs` entry after its
  // section, such as a component, never reusing a root definition name or
  // another bundled name.
  const rootPrefixes: Readonly<Record<string, string>> = {
    components: 'component',
    functions: 'function',
  };
  const bundledName = (target: RefTarget): string => {
    const prefix = rootPrefixes[target.pointer.split('/')[1] ?? ''] ?? 'root';
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
    if (!resolved) return result;

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
        : stripLocalComponentEnvelopes
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
