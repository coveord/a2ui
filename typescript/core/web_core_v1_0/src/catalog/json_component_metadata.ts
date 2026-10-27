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
 * @fileoverview Component metadata read from a JSON Schema definition.
 *
 * The child references and property behavior of a component written as JSON
 * Schema follow from the common type definitions its properties reference, so
 * they can be read from the JSON itself, with no schema library. Generated
 * catalogs and the catalogs a schema adapter loads from a document both use it.
 */

import type {
  CompleteComponentSchemaMetadata,
  DynamicFieldKind,
  SchemaBehavior,
} from './schema_metadata.js';

type JsonObject = Readonly<Record<string, unknown>>;

/** Definition names that hold a single child component id. */
const CHILD_REF_NAMES = new Set(['Child', 'ComponentId', 'ChildComponentId']);

/** Definition names that hold a list of children or a child template. */
const CHILD_LIST_NAMES = new Set(['ChildList', 'TemplateChildList']);

/** Top-level behaviors a component records in `dynamicFields`. */
const DYNAMIC_FIELD_KINDS = new Set(['DYNAMIC', 'ACTION', 'STRUCTURAL', 'CHECKABLE']);

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the definition name a `$ref` points at: what follows `#/$defs/`, or
 * else the last path segment (`#/$defs/DynamicString` gives `DynamicString`).
 *
 * @param ref A JSON Schema reference.
 */
export function refDefinitionName(ref: string): string {
  const defIndex = ref.indexOf('#/$defs/');
  if (defIndex !== -1) return ref.substring(defIndex + '#/$defs/'.length);
  const slashIndex = ref.lastIndexOf('/');
  return slashIndex === -1 ? ref : ref.substring(slashIndex + 1);
}

/** The definition a schema references, directly or through its first composed member. */
function schemaRefName(schema: unknown): string {
  if (!isObject(schema)) return '';
  if (typeof schema['$ref'] === 'string') return refDefinitionName(schema['$ref']);
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const members = schema[key];
    for (const member of Array.isArray(members) ? members : []) {
      const name = schemaRefName(member);
      if (name) return name;
    }
  }
  return '';
}

/**
 * Returns the runtime behavior of a JSON Schema property.
 *
 * @param schema The property's schema.
 * @param catalogDefs The catalog's own definitions.
 * @param commonDefs The common type definitions.
 */
export function behaviorForJsonSchema(
  schema: unknown,
  catalogDefs: JsonObject,
  commonDefs: JsonObject,
  seen: ReadonlySet<string> = new Set(),
): SchemaBehavior {
  const ref = schemaRefName(schema);
  if (ref === 'Action') return {type: 'ACTION'};
  if (ref === 'ChildList' || ref === 'TemplateChildList') return {type: 'STRUCTURAL'};
  if (ref === 'Checkable' || ref === 'CheckRule') return {type: 'CHECKABLE'};
  if (ref === 'DataBinding' || ref === 'FunctionCall' || ref.startsWith('Dynamic')) {
    return {type: 'DYNAMIC'};
  }

  if (ref && !seen.has(ref)) {
    const definition = catalogDefs[ref] ?? commonDefs[ref];
    if (definition) {
      return behaviorForJsonSchema(definition, catalogDefs, commonDefs, new Set(seen).add(ref));
    }
  }

  const node = isObject(schema) ? schema : {};
  const branches = node['oneOf'] ?? node['anyOf'] ?? node['allOf'];
  if (Array.isArray(branches)) {
    const behaviors = branches.map(branch =>
      behaviorForJsonSchema(branch, catalogDefs, commonDefs, seen),
    );
    for (const type of ['ACTION', 'DYNAMIC', 'STRUCTURAL', 'CHECKABLE']) {
      const match = behaviors.find(behavior => behavior.type === type);
      if (match) return match;
    }
    const object = behaviors.find(behavior => behavior.type === 'OBJECT');
    if (object) return object;
  }

  if (node['type'] === 'array') {
    const element = behaviorForJsonSchema(node['items'] ?? {}, catalogDefs, commonDefs, seen);
    return element.type === 'CHECKABLE' ? element : {type: 'ARRAY', element};
  }

  if (node['type'] === 'object' || node['properties']) {
    const properties = isObject(node['properties']) ? node['properties'] : {};
    return {
      type: 'OBJECT',
      shape: Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          behaviorForJsonSchema(value, catalogDefs, commonDefs, seen),
        ]),
      ),
    };
  }

  return {type: 'STATIC'};
}

/**
 * Returns the runtime metadata of a component from its JSON Schema properties.
 *
 * A property is a child reference when it references `Child`, `ComponentId` or
 * `ChildComponentId`, a child list when it references `ChildList` or
 * `TemplateChildList`, and both a child list and nested when its items are
 * objects with child reference properties.
 *
 * @param properties The component's properties, with its mixins' merged in.
 * @param catalogDefs The catalog's own definitions.
 * @param commonDefs The common type definitions.
 * @param propertyKeys The property names the component's schema declares, or
 *   `null` when it accepts any property.
 */
export function componentMetadataFromJson(
  properties: JsonObject,
  catalogDefs: JsonObject,
  commonDefs: JsonObject,
  propertyKeys: readonly string[] | null,
): CompleteComponentSchemaMetadata {
  const childRefs: string[] = [];
  const childLists: string[] = [];
  const nestedChildRefs: Record<string, string[]> = {};

  for (const [name, schema] of Object.entries(properties)) {
    const ref = schemaRefName(schema);
    if (CHILD_REF_NAMES.has(ref)) childRefs.push(name);
    if (CHILD_LIST_NAMES.has(ref)) childLists.push(name);

    const items = isObject(schema) ? schema['items'] : undefined;
    const itemProperties = isObject(items) ? items['properties'] : undefined;
    if (isObject(itemProperties)) {
      const nested = Object.entries(itemProperties)
        .filter(([, itemSchema]) => CHILD_REF_NAMES.has(schemaRefName(itemSchema)))
        .map(([key]) => key);
      if (nested.length > 0) {
        childLists.push(name);
        nestedChildRefs[name] = nested;
      }
    }
  }

  const shape: Record<string, SchemaBehavior> = Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => [
      name,
      behaviorForJsonSchema(schema, catalogDefs, commonDefs),
    ]),
  );
  if (!shape['accessibility'] && commonDefs['AccessibilityAttributes']) {
    shape['accessibility'] = behaviorForJsonSchema(
      commonDefs['AccessibilityAttributes'],
      catalogDefs,
      commonDefs,
    );
  }
  const dynamicFields = Object.fromEntries(
    Object.entries(shape)
      .filter(([, field]) => DYNAMIC_FIELD_KINDS.has(field.type))
      .map(([name, field]) => [name, field.type as DynamicFieldKind]),
  );

  return {
    behavior: {type: 'OBJECT', shape},
    ...(childRefs.length ? {childRefs} : {}),
    ...(childLists.length ? {childLists: [...new Set(childLists)]} : {}),
    ...(Object.keys(nestedChildRefs).length ? {nestedChildRefs} : {}),
    ...(Object.keys(dynamicFields).length ? {dynamicFields} : {}),
    propertyKeys,
  };
}
