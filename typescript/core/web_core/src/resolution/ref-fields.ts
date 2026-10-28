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
  arrayItems,
  CHILD_LIST_DEF_NAMES,
  COMPONENT_ID_DEF_NAMES,
  coreJsonSchema,
  inspectionSchemaOf,
  objectProperties,
  refDefName,
  unionBranches,
} from '../catalog/a2ui_json_schema.js';
import type {EntrySchema} from '../catalog/a2ui_schema.js';
import type {JsonSchemaObject} from '../catalog/spec_annotations.js';

/**
 * Classification reads the JSON Schema view of a component's schema, in
 * which a property holding a child reference refers to the `ComponentId` or
 * `ChildList` definition, or to an alias of one, such as `Child`. `ComponentIdSchema` and `ChildListSchema` carry
 * such a reference even when described anew.
 */
/**
 * Describes how a component schema property references child components.
 */
export type RefKind =
  | {
      /** The property holds a single child component id. */
      readonly kind: 'single';
    }
  | {
      /** The property holds a `ChildList` (static id array or template). */
      readonly kind: 'list';
    }
  | {
      /**
       * The property holds an array of plain objects in which `keys` are
       * single child references (e.g. a tab strip's `items[].child`).
       */
      readonly kind: 'nested';
      readonly keys: ReadonlySet<string>;
    };

/** Child-referencing properties of a component schema, keyed by property name. */
export type RefFields = ReadonlyMap<string, RefKind>;

const EMPTY_REF_FIELDS: RefFields = new Map();

const refFieldsCache = new WeakMap<object, RefFields>();

/**
 * Extracts the child-referencing properties and their kinds from a component schema.
 *
 * @param schema Component schema to inspect.
 * @returns Map of child-referencing property names to their reference kinds.
 */
export function extractRefFields(schema: EntrySchema): RefFields {
  const cached = refFieldsCache.get(schema);
  if (cached) {
    return cached;
  }

  const shape = objectProperties(coreJsonSchema(inspectionSchemaOf(schema)));
  if (!shape) {
    refFieldsCache.set(schema, EMPTY_REF_FIELDS);
    return EMPTY_REF_FIELDS;
  }

  const fields = new Map<string, RefKind>();
  for (const [key, value] of Object.entries(shape)) {
    const field = coreJsonSchema(value);
    if (refersTo(value, CHILD_LIST_DEF_NAMES) || isChildListUnion(field)) {
      fields.set(key, {kind: 'list'});
      continue;
    }
    if (refersTo(value, COMPONENT_ID_DEF_NAMES)) {
      fields.set(key, {kind: 'single'});
      continue;
    }
    const element = arrayItems(field);
    if (element === undefined) continue;
    // A plain array of component ids: the reference sits on the element
    // rather than the property (z.array(ComponentIdSchema)).
    if (refersTo(element, COMPONENT_ID_DEF_NAMES)) {
      fields.set(key, {kind: 'list'});
      continue;
    }
    const elementShape = objectProperties(coreJsonSchema(element));
    if (elementShape) {
      const subKeys = new Set<string>();
      for (const [subKey, subValue] of Object.entries(elementShape)) {
        if (refersTo(subValue, COMPONENT_ID_DEF_NAMES)) {
          subKeys.add(subKey);
        }
      }
      if (subKeys.size > 0) {
        fields.set(key, {kind: 'nested', keys: subKeys});
      }
    }
  }

  const result: RefFields = fields;
  refFieldsCache.set(schema, result);
  return result;
}

/** Whether a node, or the schema it wraps, refers to one of the definitions `defNames`. */
function refersTo(node: JsonSchemaObject, defNames: ReadonlySet<string>): boolean {
  return defNames.has(refDefName(node)) || defNames.has(refDefName(coreJsonSchema(node)));
}

/** Matches the binder's STRUCTURAL detection for `ChildList`-shaped unions. */
function isChildListUnion(node: JsonSchemaObject): boolean {
  return (
    unionBranches(node)?.some(branch => {
      const shape = objectProperties(branch);
      return Boolean(shape?.['componentId'] && shape['path']);
    }) ?? false
  );
}
