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

/** Runtime behavior that can be assigned to a top-level component property. */
export type DynamicFieldKind = Extract<
  SchemaBehavior,
  {readonly type: 'DYNAMIC' | 'ACTION' | 'STRUCTURAL' | 'CHECKABLE'}
>['type'];

/**
 * Catalog-provided schema information required by the core at runtime.
 *
 * A catalog either ships it with each component, as generated catalogs do, or
 * has its schema adapter derive it once per component (see
 * `Catalog.getComponentMetadata`). Core reads this data instead of inspecting
 * a schema library's private representation.
 *
 * Absent `childRefs`, `childLists` and `nestedChildRefs` mean the component
 * has no such properties.
 */
export interface ComponentSchemaMetadata {
  /** Properties holding a single child component id. */
  readonly childRefs?: readonly string[];
  /** Properties holding a child list or template, including those in `nestedChildRefs`. */
  readonly childLists?: readonly string[];
  /** Keys of the list items that hold child component ids, by list property. */
  readonly nestedChildRefs?: Readonly<Record<string, readonly string[]>>;
  /** Behavior of top-level properties, overriding `behavior`. */
  readonly dynamicFields?: Readonly<Record<string, DynamicFieldKind>>;
  /** Complete behavior tree of the component's properties. */
  readonly behavior?: SchemaBehavior;
  /**
   * Property names the component schema declares, or `null` when it accepts
   * any property.
   */
  readonly propertyKeys?: readonly string[] | null;
}

/** Component metadata with every field core reads at runtime. */
export interface CompleteComponentSchemaMetadata extends ComponentSchemaMetadata {
  readonly behavior: SchemaBehavior;
  readonly propertyKeys: readonly string[] | null;
}

/**
 * Whether metadata holds every field core reads at runtime.
 *
 * @param metadata The metadata to check.
 */
export function isCompleteComponentMetadata(
  metadata: ComponentSchemaMetadata | undefined,
): metadata is CompleteComponentSchemaMetadata {
  return metadata?.behavior !== undefined && metadata.propertyKeys !== undefined;
}
