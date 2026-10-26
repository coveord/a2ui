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

/** Child reference properties for a single component type. */
export interface ComponentChildRefs {
  /** Property names holding single child component references. */
  readonly singleRefs: ReadonlySet<string>;
  /** Property names holding child list references or dynamic templates. */
  readonly listRefs: ReadonlySet<string>;
  /** Nested child-reference fields keyed by their containing list property. */
  readonly nestedRefs?: Readonly<Record<string, ReadonlySet<string>>>;
}

/** Map of component type names to child reference properties. */
export type ComponentRefMap = Record<string, ComponentChildRefs>;

/** Result of checking whether a schema represents a child reference or list. */
export interface ChildRefAnalysis {
  readonly isChild: boolean;
  readonly isChildList: boolean;
}

/** Names that a catalog recognizes as child-reference definitions. */
export interface ChildRefAnalysisOptions {
  readonly childRefNames: ReadonlySet<string>;
  readonly childListRefNames: ReadonlySet<string>;
  readonly childPropertyNames?: ReadonlySet<string>;
}
