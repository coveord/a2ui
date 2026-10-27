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

import {createFunctionImplementation, FunctionImplementation} from '../catalog/types.js';
import type {StandardSchema} from '../catalog/standard_schema.js';
import {A2uiValidationError} from '../errors.js';
import {resolveContextIndex} from '../resolution/data-context.js';

interface IndexArgs {
  readonly offset?: unknown;
}

const IndexArgsSchema: StandardSchema<Record<string, unknown>, IndexArgs> = {
  '~standard': {
    version: 1,
    vendor: '@a2ui/web_core_v1_0',
    validate: value => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {issues: [{message: 'Expected object for @index arguments.'}]};
      }
      const offset = (value as Record<string, unknown>)['offset'];
      if (offset === undefined) return {value: {}};
      if (typeof offset === 'number') return {value: {offset}};
      if (typeof offset === 'string' || typeof offset === 'boolean' || offset === null) {
        const number = Number(offset);
        return Number.isNaN(number)
          ? {issues: [{message: 'Expected a numeric @index offset.'}]}
          : {value: {offset: number}};
      }
      if (
        typeof offset === 'object' &&
        offset !== null &&
        ('@path' in offset || 'path' in offset || '@call' in offset || 'call' in offset)
      ) {
        return {value: {offset}};
      }
      return {issues: [{message: 'Expected a numeric or dynamic @index offset.'}]};
    },
  },
};

/**
 * System function definition for computing iteration indices in array contexts.
 *
 * Evaluates the 0-based iteration index with an optional numerical offset.
 */
export const IndexApi = {
  /** Name of the system function. */
  name: '@index' as const,
  /** Declared return type for catalog type checking. */
  returnType: 'number' as const,
  /** Scope of callers permitted to invoke this function. */
  allowedCallers: 'rendererOnly' as const,
  /** Standard Schema validating optional numeric or dynamic offsets. */
  schema: IndexArgsSchema,
  /** The only argument `@index` accepts. */
  argumentKeys: ['offset'] as const,
};

/**
 * Implementation of the `@index` system function.
 *
 * Returns the 0-based iteration index of the enclosing collection template,
 * plus an optional offset.
 *
 * @throws {A2uiValidationError} If called outside a collection template iteration scope.
 */
export const IndexImplementation = createFunctionImplementation(IndexApi, (args, context) => {
  const offset = typeof args.offset === 'number' && Number.isFinite(args.offset) ? args.offset : 0;
  const index = resolveContextIndex(context);

  if (index === undefined || !Number.isFinite(index)) {
    throw new A2uiValidationError(
      '@index function can only be evaluated inside a collection template iteration scope.',
    );
  }
  return index + offset;
});

/**
 * Standard v1.0 system function implementations.
 */
export const SYSTEM_FUNCTIONS: FunctionImplementation[] = [IndexImplementation];
