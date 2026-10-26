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

/** A JSON Schema object as written in a catalog document. */
export type JsonSchemaObject = Readonly<Record<string, unknown>>;

/** A catalog definition mixed into a schema by a schema adapter. */
export type SpecMixin = string | object;

/** Catalog-document detail a schema implementation cannot represent directly. */
export interface SpecAnnotation {
  readonly allOf?: readonly JsonSchemaObject[];
  readonly closure?: 'additionalProperties' | 'unevaluatedProperties' | 'none';
  readonly defName?: string;
  readonly keywords?: JsonSchemaObject;
  readonly mixins?: readonly SpecMixin[];
  readonly required?: readonly string[];
}

const annotations = new WeakMap<object, SpecAnnotation>();

/** Returns document annotations associated with a schema object. */
export function getSchemaAnnotation(schema: unknown): SpecAnnotation | undefined {
  return typeof schema === 'object' && schema !== null ? annotations.get(schema) : undefined;
}

/** Associates document annotations with a schema object. */
export function setSchemaAnnotation(schema: object, annotation: SpecAnnotation): void {
  annotations.set(schema, annotation);
}
