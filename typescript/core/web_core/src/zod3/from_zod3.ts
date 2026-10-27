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

import type {StandardJSONSchemaV1} from '@standard-schema/spec';
import type {z} from 'zod/v3';

import type {A2uiStandardSchema} from '../catalog/a2ui_schema.js';
import {zodToUnbundledJson} from '../catalog/schema_serializer.js';
import {A2uiCatalogError} from '../errors.js';

/** The JSON Schema versions `fromZod3` writes. */
const SUPPORTED_TARGETS: ReadonlySet<string> = new Set(['draft-2020-12']);

/**
 * Returns a Zod 3 schema as an `A2uiSchema`: a Standard Schema that validates
 * with the Zod schema itself, and a Standard JSON Schema that writes it as
 * `Catalog.toJson()` writes an entry defined in code. A child reference whose
 * description was replaced is still written as a reference to its common
 * type.
 *
 * Checks that JSON Schema cannot express, such as a `refine`, are not in the
 * JSON Schema, but still run in `validate`.
 *
 * @deprecated Transitional: write new entries with a library that implements
 * Standard JSON Schema, such as Zod 4.
 * @param schema The Zod 3 schema.
 * @returns The schema as an `A2uiSchema`.
 */
export function fromZod3<S extends z.ZodTypeAny>(schema: S): A2uiStandardSchema<z.output<S>> {
  const toJson = (options: StandardJSONSchemaV1.Options): Record<string, unknown> => {
    if (!SUPPORTED_TARGETS.has(options.target)) {
      throw new A2uiCatalogError(
        `fromZod3 writes JSON Schema draft-2020-12, not '${options.target}'.`,
      );
    }
    return zodToUnbundledJson(schema, new Set());
  };
  return {
    '~standard': {
      version: 1,
      vendor: 'zod',
      validate: value => schema['~standard'].validate(value),
      jsonSchema: {input: toJson, output: toJson},
    },
  } as A2uiStandardSchema<z.output<S>>;
}
