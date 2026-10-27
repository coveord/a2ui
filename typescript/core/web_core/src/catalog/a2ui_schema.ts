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

import type {StandardJSONSchemaV1, StandardSchemaV1} from '@standard-schema/spec';

import {A2uiCatalogError} from '../errors.js';
import type {JsonSchemaObject} from './spec_annotations.js';

/**
 * A schema from any library that implements both Standard Schema and Standard
 * JSON Schema, such as Zod 4, Valibot or ArkType.
 *
 * @template Output The type of a value the schema accepts.
 */
export type A2uiStandardSchema<Output = unknown> = StandardSchemaV1<unknown, Output> &
  StandardJSONSchemaV1<unknown, Output>;

/**
 * A schema that A2UI accepts for a catalog entry: a library schema that can
 * write itself as JSON Schema, or a JSON Schema object.
 *
 * A2UI reads either as JSON Schema, the language of catalog documents, so the
 * library a catalog author uses does not reach the core.
 *
 * @template Output The type of a value the schema accepts.
 */
export type A2uiSchema<Output = unknown> = A2uiStandardSchema<Output> | JsonSchemaObject;

/** The JSON Schema version catalog documents are written in. */
const TARGET = 'draft-2020-12';

/** Keywords that place a schema as a document, which an entry's definition does not keep. */
const DOCUMENT_KEYWORDS = ['$schema', '$id'];

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns an `A2uiSchema` as a JSON Schema object, without `$schema` or `$id`.
 *
 * A library schema writes its input as JSON Schema draft 2020-12 through
 * Standard JSON Schema. A JSON Schema object is copied as is.
 *
 * @param schema The schema to read.
 * @returns The schema's JSON Schema.
 * @throws {A2uiCatalogError} If `schema` implements Standard Schema without
 *   Standard JSON Schema, or is not an object.
 */
export function normalizeSchema(schema: A2uiSchema): JsonSchemaObject {
  if (!isObject(schema)) {
    throw new A2uiCatalogError('A schema must be a JSON Schema object or a library schema.');
  }
  const props = schema['~standard'];
  let json: unknown = schema;
  if (props !== undefined) {
    const vendor = String(isObject(props) ? props['vendor'] : undefined);
    const converter = isObject(props) ? props['jsonSchema'] : undefined;
    if (!isObject(converter) || typeof converter['input'] !== 'function') {
      throw new A2uiCatalogError(
        `A schema from '${vendor}' implements Standard Schema but not Standard JSON Schema, which A2UI needs to read it as JSON Schema.`,
      );
    }
    json = (converter as unknown as StandardJSONSchemaV1.Converter).input({target: TARGET});
    if (!isObject(json)) {
      throw new A2uiCatalogError(`A schema from '${vendor}' wrote no JSON Schema object.`);
    }
  }
  const result: Record<string, unknown> = {...(json as Record<string, unknown>)};
  for (const keyword of DOCUMENT_KEYWORDS) delete result[keyword];
  return result;
}
