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

import {
  V10_CHILD_REF_OPTIONS,
  type CompleteComponentSchemaMetadata,
  type SchemaBehavior,
} from '@a2ui/web_core_v1_0';
import {z} from 'zod';

import {childRefKindOf, type ChildRefKind} from '../types/child-ref-helpers.js';
import {AccessibilityAttributesSchema} from '../types/common-types.js';

/** The parts of a Zod 4 schema definition this module reads. */
interface Def {
  readonly type: string;
  readonly innerType?: z.ZodType;
  readonly in?: z.ZodType;
  readonly getter?: () => z.ZodType;
  readonly shape?: Readonly<Record<string, z.ZodType>>;
  readonly catchall?: z.ZodType;
  readonly options?: readonly z.ZodType[];
  readonly element?: z.ZodType;
  readonly left?: z.ZodType;
  readonly right?: z.ZodType;
}

/** Definition types that wrap one inner schema without changing its shape. */
const WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'catch',
  'readonly',
  'nonoptional',
]);

function defOf(schema: z.ZodType): Def {
  return schema._zod.def as unknown as Def;
}

/** A schema with its wrappers removed, and what the wrappers said about it. */
interface Unwrapped {
  readonly schema: z.ZodType;
  readonly def: Def;
  /** Descriptions met from the outermost wrapper inwards. */
  readonly descriptions: readonly string[];
  readonly marker?: ChildRefKind;
}

/**
 * Removes optional, nullable, default, catch, readonly, pipe and lazy layers.
 */
function unwrap(schema: z.ZodType): Unwrapped {
  const descriptions: string[] = [];
  let marker: ChildRefKind | undefined;
  let current = schema;
  for (let depth = 0; depth < 32; depth++) {
    if (current.description) descriptions.push(current.description);
    marker ??= childRefKindOf(current);
    const def = defOf(current);
    const next = WRAPPERS.has(def.type)
      ? def.innerType
      : def.type === 'pipe'
        ? def.in
        : def.type === 'lazy'
          ? def.getter?.()
          : undefined;
    if (!next) return {schema: current, def, descriptions, marker};
    current = next;
  }
  return {schema: current, def: defOf(current), descriptions, marker};
}

/**
 * The definition name a description points at: the last segment of a `REF:`
 * pointer, or a bare definition name such as `ChildComponentId`.
 */
function definitionName(description: string): string {
  const pointer = description.startsWith('REF:') ? description.slice(4) : description;
  const target = pointer.split('|')[0].trim();
  const hash = target.lastIndexOf('#');
  const name = (hash === -1 ? target : target.slice(hash + 1)).split('/').filter(Boolean).pop();
  return name && /^[A-Za-z][A-Za-z0-9]*$/.test(name) ? name : '';
}

function definitionNames(field: Unwrapped): string[] {
  return field.descriptions.map(definitionName).filter(Boolean);
}

// --- Child references ---

type ChildKind = 'single' | 'list';

function childKindOf(field: Unwrapped): ChildKind | undefined {
  const names = definitionNames(field);
  if (
    field.marker === 'child-list' ||
    names.some(name => V10_CHILD_REF_OPTIONS.childListRefNames.has(name)) ||
    isTemplateUnion(field.def)
  ) {
    return 'list';
  }
  if (
    field.marker === 'component-id' ||
    names.some(name => V10_CHILD_REF_OPTIONS.childRefNames.has(name))
  ) {
    return 'single';
  }
  if (field.def.type === 'array' && field.def.element) {
    return childKindOf(unwrap(field.def.element)) === 'single' ? 'list' : undefined;
  }
  return undefined;
}

/** A union with a `{componentId, path}` option, the shape of a child list template. */
function isTemplateUnion(def: Def): boolean {
  return (
    def.type === 'union' &&
    (def.options ?? []).some(option => {
      const shape = defOf(option).shape;
      return Boolean(shape?.['componentId'] && shape['path']);
    })
  );
}

/** Keys of an array's object items that hold a single child id. */
function nestedChildKeys(def: Def): string[] {
  if (def.type !== 'array' || !def.element) return [];
  const item = unwrap(def.element);
  if (item.def.type !== 'object') return [];
  return Object.entries(item.def.shape ?? {})
    .filter(([, value]) => childKindOf(unwrap(value)) === 'single')
    .map(([key]) => key);
}

// --- Behavior ---

function isDynamicName(name: string): boolean {
  return name === 'DataBinding' || name === 'FunctionCall' || name.startsWith('Dynamic');
}

function isActionOption(option: z.ZodType): boolean {
  const field = unwrap(option);
  return (
    definitionNames(field).includes('Action') ||
    (field.def.type === 'object' && Boolean(field.def.shape?.['event']))
  );
}

function isDynamicOption(option: z.ZodType): boolean {
  const field = unwrap(option);
  if (definitionNames(field).some(isDynamicName)) return true;
  const shape = field.def.type === 'object' ? field.def.shape : undefined;
  if (!shape) return false;
  const holdsChild = Object.values(shape).some(value =>
    definitionNames(unwrap(value)).includes('ComponentId'),
  );
  return Boolean(shape['@path'] || shape['path'] || shape['@call'] || shape['call']) && !holdsChild;
}

function fieldBehavior(schema: z.ZodType): SchemaBehavior {
  const field = unwrap(schema);
  const names = definitionNames(field);
  const {def} = field;
  if (
    names.includes('Checkable') ||
    names.includes('CheckRule') ||
    (def.type === 'array' &&
      def.element &&
      definitionNames(unwrap(def.element)).includes('CheckRule'))
  ) {
    return {type: 'CHECKABLE'};
  }
  if (names.includes('Action')) return {type: 'ACTION'};
  if (field.marker === 'child-list' || names.includes('ChildList')) return {type: 'STRUCTURAL'};
  if (names.some(isDynamicName) && def.type !== 'object' && def.type !== 'array') {
    return {type: 'DYNAMIC'};
  }
  if (def.type === 'union') {
    const options = def.options ?? [];
    if (options.some(isActionOption)) return {type: 'ACTION'};
    if (options.some(isDynamicOption)) return {type: 'DYNAMIC'};
    if (
      options.some(
        option => childKindOf(unwrap(option)) === 'list' || isTemplateUnion(defOf(option)),
      )
    ) {
      return {type: 'STRUCTURAL'};
    }
    return {type: 'STATIC'};
  }
  if (def.type === 'array' && def.element) {
    return {type: 'ARRAY', element: fieldBehavior(def.element)};
  }
  if (def.type === 'object') {
    return {
      type: 'OBJECT',
      shape: Object.fromEntries(
        Object.entries(def.shape ?? {}).map(([key, value]) => [key, fieldBehavior(value)]),
      ),
    };
  }
  return {type: 'STATIC'};
}

// --- Declared keys ---

/**
 * Returns the property names a Zod 4 schema declares, or `null` when it
 * accepts any property or its keys cannot be determined.
 *
 * @param schema The schema to read.
 */
export function getZod4KnownSchemaKeys(schema: unknown): Set<string> | null {
  if (!(schema instanceof z.ZodType)) return null;
  const {def} = unwrap(schema);
  if (def.type === 'object') {
    const catchall = def.catchall ? defOf(def.catchall).type : undefined;
    return catchall && catchall !== 'never' ? null : new Set(Object.keys(def.shape ?? {}));
  }
  if (def.type === 'intersection' && def.left && def.right) {
    const left = getZod4KnownSchemaKeys(def.left);
    const right = getZod4KnownSchemaKeys(def.right);
    return left && right ? new Set([...left, ...right]) : null;
  }
  if (def.type === 'union') {
    const keys = new Set<string>();
    for (const option of def.options ?? []) {
      const optionKeys = getZod4KnownSchemaKeys(option);
      if (!optionKeys) return null;
      for (const key of optionKeys) keys.add(key);
    }
    return keys;
  }
  return null;
}

// --- Component metadata ---

const metadataCache = new WeakMap<z.ZodType, CompleteComponentSchemaMetadata>();

/**
 * Reads the runtime metadata of a component's Zod 4 schema.
 *
 * A property is a child reference when its schema carries the
 * `markChildRef` marker, a `REF:` pointer to a child definition, or a bare
 * definition name such as `describe('ChildComponentId')`. A list property
 * whose items hold child ids is listed in both `childLists` and
 * `nestedChildRefs`, as in generated catalogs.
 *
 * @param schema The component's Zod 4 schema.
 * @returns The schema's complete runtime metadata.
 */
export function describeZod4Component(schema: unknown): CompleteComponentSchemaMetadata {
  if (!(schema instanceof z.ZodType)) {
    return {behavior: {type: 'OBJECT', shape: {}}, propertyKeys: null};
  }
  const cached = metadataCache.get(schema);
  if (cached) return cached;

  const childRefs: string[] = [];
  const childLists: string[] = [];
  const nestedChildRefs: Record<string, string[]> = {};
  const {def} = unwrap(schema);
  for (const [key, value] of Object.entries(def.type === 'object' ? (def.shape ?? {}) : {})) {
    const field = unwrap(value);
    const nested = nestedChildKeys(field.def);
    if (nested.length > 0) {
      childLists.push(key);
      nestedChildRefs[key] = nested;
      continue;
    }
    const kind = childKindOf(field);
    if (kind === 'single') childRefs.push(key);
    if (kind === 'list') childLists.push(key);
  }

  const behavior = fieldBehavior(schema);
  const keys = getZod4KnownSchemaKeys(schema);
  const metadata: CompleteComponentSchemaMetadata = {
    behavior:
      behavior.type === 'OBJECT' && !('accessibility' in behavior.shape)
        ? {
            ...behavior,
            shape: {...behavior.shape, accessibility: fieldBehavior(AccessibilityAttributesSchema)},
          }
        : behavior,
    propertyKeys: keys ? [...keys] : null,
    ...(childRefs.length > 0 ? {childRefs} : {}),
    ...(childLists.length > 0 ? {childLists} : {}),
    ...(Object.keys(nestedChildRefs).length > 0 ? {nestedChildRefs} : {}),
  };
  metadataCache.set(schema, metadata);
  return metadata;
}
