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

import type {CatalogSchemaAdapter} from '../catalog/schema_adapter.js';
import type {StandardSchema} from '../catalog/standard_schema.js';

/**
 * Returns a Standard Schema for an object whose listed fields are strings.
 *
 * Core tests use it where a component or function needs a schema but not a
 * schema library. Each call returns a distinct schema.
 *
 * @param stringFields Fields the object must hold as strings.
 */
export function objectSchema<T extends Record<string, unknown> = Record<string, unknown>>(
  stringFields: readonly string[] = [],
): StandardSchema<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'a2ui-core-test',
      validate: value => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return {issues: [{message: 'Expected an object.'}]};
        }
        const issues = stringFields
          .filter(field => typeof (value as Record<string, unknown>)[field] !== 'string')
          .map(field => ({message: 'Expected a string.', path: [field]}));
        return issues.length > 0 ? {issues} : {value: value as T};
      },
    },
  };
}

/**
 * Returns a schema adapter that implements only the given operations.
 *
 * @param operations The adapter members the test needs.
 */
export function testSchemaAdapter(
  operations: Omit<Partial<CatalogSchemaAdapter>, 'name'> = {},
): CatalogSchemaAdapter {
  return {name: 'core-test-adapter', ...operations};
}
