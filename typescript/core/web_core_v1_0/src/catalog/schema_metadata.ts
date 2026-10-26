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

/** Runtime behavior of a component property. */
export type SchemaBehavior =
  | {readonly type: 'DYNAMIC'}
  | {readonly type: 'ACTION'}
  | {readonly type: 'STRUCTURAL'}
  | {readonly type: 'CHECKABLE'}
  | {readonly type: 'STATIC'}
  | {readonly type: 'OBJECT'; readonly shape: Readonly<Record<string, SchemaBehavior>>}
  | {readonly type: 'ARRAY'; readonly element: SchemaBehavior};

/** Child-component reference fields declared by a component. */
export interface ComponentChildReferenceMetadata {
  readonly single?: readonly string[];
  readonly lists?: readonly string[];
  readonly nested?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Catalog-provided schema information required by the core at runtime.
 *
 * Catalog adapters derive this from their schema implementation. Core consumes
 * the data without depending on a schema library's private representation.
 */
export interface ComponentSchemaMetadata {
  readonly behavior?: SchemaBehavior;
  readonly childReferences?: ComponentChildReferenceMetadata;
}
