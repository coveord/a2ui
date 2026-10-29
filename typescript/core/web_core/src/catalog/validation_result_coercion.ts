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
  coreJsonSchema,
  inspectionSchemaOf,
  objectProperties,
  refDefName,
} from './a2ui_json_schema.js';
import type {InspectableSchema} from './a2ui_schema.js';
import type {JsonSchemaObject} from './spec_annotations.js';

/**
 * The validity a v1.0 `ValidationResult` object carries, or `undefined` when
 * `value` is not one: an object whose `valid` member is a boolean.
 */
export function validityOf(value: unknown): boolean | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const valid = (value as {valid?: unknown}).valid;
  return typeof valid === 'boolean' ? valid : undefined;
}

/**
 * Whether `schema` is the common `DynamicBoolean` type, possibly wrapped.
 *
 * The type is recognized by the definition its JSON Schema view refers to, so
 * a schema defined in code and one loaded from a catalog document are treated
 * alike.
 */
export function isDynamicBooleanSchema(schema: InspectableSchema): boolean {
  return isDynamicBooleanNode(inspectionSchemaOf(schema));
}

function isDynamicBooleanNode(node: JsonSchemaObject): boolean {
  return refDefName(coreJsonSchema(node)) === 'DynamicBoolean';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerces the `ValidationResult` objects in `value` that `schema` types as
 * `DynamicBoolean` to their `valid` boolean.
 *
 * From v1.0 the validation functions return a `ValidationResult` rather than
 * a boolean, and the specification defines `DynamicBoolean` as a boolean, a
 * binding, or a call returning a boolean or a validation result object,
 * coerced to its `valid` boolean. A resolved argument that is such an object
 * is therefore read by its validity wherever the schema asks for a
 * `DynamicBoolean`, and left alone everywhere else: an object is always
 * truthy in JavaScript, so an uncoerced `{valid: false}` would read as true.
 *
 * Reads the schema's JSON Schema view (see `inspectionSchemaOf`), through
 * object properties, array items and wrappers such as optionality. Returns
 * `value` itself when nothing is coerced.
 *
 * @param schema The schema of `value`, such as a function's argument schema.
 * @param value The resolved value to coerce.
 * @returns `value`, with every `ValidationResult` in a `DynamicBoolean`
 *   position replaced by its validity.
 */
export function coerceValidationResults(schema: InspectableSchema, value: unknown): unknown {
  return coerceNode(inspectionSchemaOf(schema), value);
}

function coerceNode(node: JsonSchemaObject, value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (isDynamicBooleanNode(node)) {
    return validityOf(value) ?? value;
  }
  const core = coreJsonSchema(node);
  const items = arrayItems(core);
  if (items && Array.isArray(value)) {
    let changed = false;
    const coercedItems = value.map(item => {
      const coerced = coerceNode(items, item);
      changed ||= coerced !== item;
      return coerced;
    });
    return changed ? coercedItems : value;
  }
  const properties = objectProperties(core);
  if (properties && isPlainObject(value)) {
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const propertySchema = properties[key];
      const coerced = propertySchema ? coerceNode(propertySchema, item) : item;
      changed ||= coerced !== item;
      result[key] = coerced;
    }
    return changed ? result : value;
  }
  return value;
}
