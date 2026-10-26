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

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly PropertyKey[];
}

export type StandardSchemaResult<Output> =
  | {readonly value: Output; readonly issues?: undefined}
  | {readonly value?: undefined; readonly issues: readonly StandardSchemaIssue[]};

export interface StandardSchema<Input = unknown, Output = Input> {
  readonly ['~standard']: {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: {
      readonly input: Input;
      readonly output: Output;
    };
  };
}

export type StandardSchemaInput<Schema extends StandardSchema> =
  Schema['~standard']['types'] extends {readonly input: infer Input} ? Input : unknown;

export type StandardSchemaOutput<Schema extends StandardSchema> =
  Schema['~standard']['types'] extends {readonly output: infer Output} ? Output : unknown;

export function isStandardSchema(value: unknown): value is StandardSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~standard' in value &&
    typeof (value as StandardSchema)['~standard']?.validate === 'function'
  );
}

export function validateStandardSchema<Schema extends StandardSchema>(
  schema: Schema,
  value: unknown,
): StandardSchemaResult<StandardSchemaOutput<Schema>> {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new TypeError(
      'Asynchronous Standard Schema validation is not supported in this context.',
    );
  }
  return result as StandardSchemaResult<StandardSchemaOutput<Schema>>;
}
