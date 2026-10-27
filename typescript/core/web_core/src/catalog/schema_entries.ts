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

import type {StandardSchemaV1} from '@standard-schema/spec';
import {z} from 'zod/v3';

import {A2uiCatalogError} from '../errors.js';
import {normalizeSchema, type A2uiSchema} from './a2ui_schema.js';
import {JsonComponentApi, JsonFunctionApi} from './json_entries.js';
import {parseCatalogSchema} from './schema_loader.js';
import type {A2uiReturnType, ComponentApi, FunctionApi} from './types.js';

/** The ID of the one-entry document an entry is loaded from. */
const ENTRY_CATALOG_ID = 'urn:a2ui:entry';

/** Options of {@link createComponentApi}. */
export interface ComponentApiOptions {
  /** Name of the component as it appears in A2UI JSON (e.g. `'Button'`). */
  readonly name: string;
  /**
   * Schema of the component's properties, without envelope fields such as
   * `id` and `component`.
   */
  readonly schema: A2uiSchema;
  /** Protocol version of the catalogs the component goes into, such as `'1.0'`. */
  readonly protocolVersion: string;
  /** Optional allowed parent component types. */
  readonly allowedParents?: readonly string[];
  /** Optional allowed child component types. */
  readonly allowedChildren?: readonly string[];
}

/** Options of {@link createFunctionApi}. */
export interface FunctionApiOptions {
  /** Name of the function as it appears in A2UI JSON payloads. */
  readonly name: string;
  /** Schema of the function's arguments. */
  readonly schema: A2uiSchema;
  /** Protocol version of the catalogs the function goes into, such as `'1.0'`. */
  readonly protocolVersion: string;
  /** Return type identifier for the function. */
  readonly returnType: A2uiReturnType;
  /** Human-readable description of the function's purpose. */
  readonly description?: string;
  /** Allowed caller contexts for the function. */
  readonly allowedCallers?: 'rendererOnly' | 'agentOnly' | 'rendererOrAgent';
  /** Whether the function requires explicit user interaction before execution. */
  readonly requiresUserActivation?: boolean;
}

/**
 * Returns `derived`, the schema loaded from an entry's definition, also
 * running the library's own validation when `schema` is a library schema, so
 * that the checks JSON Schema cannot express, such as a `refine`, still run.
 *
 * @throws {A2uiCatalogError} When validating, if the library validates
 *   asynchronously, which A2UI's synchronous validation cannot wait for.
 */
function withLibraryChecks(derived: z.ZodTypeAny, schema: A2uiSchema): z.ZodTypeAny {
  const standard = (schema as Partial<StandardSchemaV1>)['~standard'];
  if (!standard) return derived;
  return derived.superRefine((value, ctx) => {
    const result = standard.validate(value);
    if (result instanceof Promise) {
      throw new A2uiCatalogError(
        `A schema from '${standard.vendor}' validates asynchronously, which A2UI does not support.`,
      );
    }
    for (const issue of result.issues ?? []) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: (issue.path ?? []).map(segment =>
          typeof segment === 'object'
            ? (segment.key as string | number)
            : (segment as string | number),
        ),
      });
    }
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Returns a component API whose schema is read from an `A2uiSchema`, for a
 * catalog author who writes the component with a schema library other than
 * Zod, or as JSON Schema.
 *
 * The schema's JSON Schema becomes the component's definition in the layout
 * of a catalog document (with the `component` constant), and the component is
 * loaded from it as `Catalog.fromJson` loads one, so a catalog writes the
 * definition in `toJson()` and validates and binds against it. A library
 * schema also validates with the library itself, so its checks that JSON
 * Schema cannot express still run.
 *
 * @param options The component's name, schema, protocol version and
 *   composition constraints.
 * @returns A schema-only component API.
 */
export function createComponentApi(options: ComponentApiOptions): ComponentApi {
  const {properties, required, additionalProperties, unevaluatedProperties, ...keywords} =
    normalizeSchema(options.schema);
  const closure = unevaluatedProperties ?? additionalProperties;
  const definition: Record<string, unknown> = {
    ...keywords,
    type: 'object',
    properties: {
      component: {const: options.name},
      ...(properties as Record<string, unknown> | undefined),
    },
    required: ['component', ...stringList(required)],
    ...(closure !== undefined ? {unevaluatedProperties: closure} : {}),
    ...(options.allowedParents?.length ? {allowedParents: [...options.allowedParents]} : {}),
    ...(options.allowedChildren?.length ? {allowedChildren: [...options.allowedChildren]} : {}),
  };
  const {components} = parseCatalogSchema(
    {catalogId: ENTRY_CATALOG_ID, components: {[options.name]: definition}},
    options.protocolVersion,
  );
  const loaded = components[0] as JsonComponentApi;
  return new JsonComponentApi(options.name, loaded.jsonSchema, () =>
    withLibraryChecks(loaded.schema, options.schema),
  );
}

/**
 * Returns a function API whose argument schema is read from an `A2uiSchema`.
 * See {@link createComponentApi}.
 *
 * The definition is the schema of a call to the function: its `call`
 * constant, its `args` and its `returnType`.
 *
 * @param options The function's name, argument schema, protocol version and
 *   call metadata.
 * @returns A schema-only function API.
 */
export function createFunctionApi(options: FunctionApiOptions): FunctionApi {
  const args = normalizeSchema(options.schema);
  const definition: Record<string, unknown> = {
    type: 'object',
    ...(options.description !== undefined ? {description: options.description} : {}),
    properties: {
      call: {const: options.name},
      args,
      returnType: {const: options.returnType},
    },
    required: stringList(args['required']).length > 0 ? ['call', 'args'] : ['call'],
    unevaluatedProperties: false,
    ...(options.allowedCallers !== undefined ? {allowedCallers: options.allowedCallers} : {}),
    ...(options.requiresUserActivation !== undefined
      ? {requiresUserActivation: options.requiresUserActivation}
      : {}),
  };
  const {functions} = parseCatalogSchema(
    {catalogId: ENTRY_CATALOG_ID, functions: {[options.name]: definition}},
    options.protocolVersion,
  );
  const loaded = functions[0] as JsonFunctionApi;
  return new JsonFunctionApi(options.name, loaded.jsonSchema, () =>
    withLibraryChecks(loaded.schema, options.schema),
  );
}
