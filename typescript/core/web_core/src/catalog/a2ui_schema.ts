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

import type {StandardJSONSchemaV1, StandardSchemaV1, StandardTypedV1} from '@standard-schema/spec';
import type {z} from 'zod/v3';

import {A2uiCatalogError} from '../errors.js';
import {formatZodIssue} from '../processing/format-zod-issue.js';
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

/**
 * The schema of a catalog entry or theme: an `A2uiSchema`, or a schema written
 * with the Zod 3 API of `zod/v3`.
 *
 * A2UI reads a Zod 3 schema as it always has, including its `spec()`
 * annotations. Accepting Zod 3 here is transitional: `fromZod3` presents one
 * as an `A2uiSchema`, which is the form to move to.
 *
 * @template Output The type of a value the schema accepts.
 */
export type EntrySchema<Output = unknown> =
  | A2uiSchema<Output>
  | z.ZodType<Output, z.ZodTypeDef, unknown>;

/**
 * The type of a value an `EntrySchema` accepts, as it outputs it: inferred
 * through Standard Schema for a library or Zod 3 schema, which gives what
 * `z.infer` gives, and `Record<string, unknown>` for a JSON Schema object.
 * A schema typed only as `EntrySchema` infers `any`, as `z.infer` does for
 * `z.ZodTypeAny`.
 */
export type InferEntrySchema<S> = S extends StandardTypedV1
  ? unknown extends StandardTypedV1.InferOutput<S>
    ? any // eslint-disable-line @typescript-eslint/no-explicit-any
    : StandardTypedV1.InferOutput<S>
  : Record<string, unknown>;

/** A schema whose Standard Schema validator can validate a protocol payload. */
export type A2uiValidator<Output = unknown> = StandardSchemaV1<unknown, Output>;

/** A validation issue emitted by a synchronous Standard Schema validator. */
export interface A2uiSchemaIssue {
  readonly message: string;
  readonly path?: readonly unknown[];
}

/** The result emitted by a synchronous Standard Schema validator. */
export interface A2uiSchemaResult<Output> {
  readonly value?: Output;
  readonly issues?: readonly A2uiSchemaIssue[];
}

/**
 * Validates a value against a schema synchronously.
 *
 * @throws {A2uiCatalogError} If the schema validates asynchronously, which
 *     A2UI does not support because protocol payloads are processed synchronously.
 */
export function validateA2uiSchema<Output>(
  schema: A2uiValidator<Output>,
  value: unknown,
): A2uiSchemaResult<Output> {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new A2uiCatalogError(
      `Schema from '${schema['~standard'].vendor}' validated asynchronously, which A2UI does not support.`,
    );
  }
  return result as A2uiSchemaResult<Output>;
}

/**
 * Formats a validation issue as `<path>: <message>`, with `root` for an
 * issue without a path.
 */
export function formatA2uiSchemaIssue(issue: A2uiSchemaIssue): string {
  if (isZodIssue(issue)) return formatZodIssue(issue);
  const path = issue.path?.map(issuePathSegment) ?? [];
  return `${path.join('.') || 'root'}: ${issue.message}`;
}

function issuePathSegment(segment: unknown): string {
  if (typeof segment === 'object' && segment !== null && 'key' in segment) {
    return String((segment as {key: unknown}).key);
  }
  return String(segment);
}

function isZodIssue(issue: A2uiSchemaIssue): issue is A2uiSchemaIssue & z.ZodIssue {
  return typeof (issue as {code?: unknown}).code === 'string' && Array.isArray(issue.path);
}

/**
 * The key under which `fromZod3` keeps the Zod 3 schema it presents, so that
 * A2UI reads the schema itself rather than its JSON Schema.
 */
export const ZOD3_SOURCE: unique symbol = Symbol.for('a2ui.zod3Source');

/** Whether `value` is a schema written with the Zod 3 API. */
function isZod3Schema(value: unknown): value is z.ZodTypeAny {
  const def = isObject(value) ? value['_def'] : undefined;
  return isObject(def) && typeof def['typeName'] === 'string';
}

/**
 * Returns the Zod 3 schema an entry's schema is, or presents through
 * `fromZod3`, or `undefined` for any other schema, such as a Zod 4 one.
 *
 * @param schema An entry's or theme's schema.
 */
export function zod3SchemaOf(schema: unknown): z.ZodTypeAny | undefined {
  if (isZod3Schema(schema)) return schema;
  const source = isObject(schema) ? (schema as Record<symbol, unknown>)[ZOD3_SOURCE] : undefined;
  return isZod3Schema(source) ? source : undefined;
}

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
