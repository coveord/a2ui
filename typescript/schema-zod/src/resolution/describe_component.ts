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

import {V10_CHILD_REF_OPTIONS, type CompleteComponentSchemaMetadata} from '@a2ui/web_core_v1_0';
import {z} from 'zod';

import {inspectComponentChildRefs} from '../catalog/reference-map.js';
import {getZodKnownSchemaKeys} from './known_schema_keys.js';
import {extractRefFields, type RefKind} from './ref-fields.js';
import {getZodSchemaBehavior} from './schema_behavior.js';

/**
 * Reads the runtime metadata of a component's Zod schema.
 *
 * Child references combine two readings of the schema: the resolver's, by
 * marker and `REF:` pointer, and the integrity checks', which also accepts a
 * bare definition name such as `describe('ChildComponentId')`. Where both
 * read a property, the resolver's kind wins. A list property whose items hold
 * child ids is listed in both `childLists` and `nestedChildRefs`, as in
 * generated catalogs.
 *
 * @param schema The component's Zod schema.
 * @returns The schema's complete runtime metadata.
 */
export function describeZodComponent(schema: unknown): CompleteComponentSchemaMetadata {
  const refs = new Map<string, RefKind>();
  const inspected = inspectComponentChildRefs(schema, V10_CHILD_REF_OPTIONS);
  for (const key of inspected.singleRefs) refs.set(key, {kind: 'single'});
  for (const key of inspected.listRefs) refs.set(key, {kind: 'list'});
  for (const [key, keys] of Object.entries(inspected.nestedRefs ?? {})) {
    refs.set(key, {kind: 'nested', keys});
  }
  if (schema instanceof z.ZodType) {
    for (const [key, ref] of extractRefFields(schema)) refs.set(key, ref);
  }

  const childRefs: string[] = [];
  const childLists: string[] = [];
  const nestedChildRefs: Record<string, string[]> = {};
  for (const [key, ref] of refs) {
    if (ref.kind === 'single') {
      childRefs.push(key);
    } else {
      childLists.push(key);
      if (ref.kind === 'nested') nestedChildRefs[key] = [...ref.keys];
    }
  }
  const keys = getZodKnownSchemaKeys(schema);
  return {
    behavior: getZodSchemaBehavior(schema),
    propertyKeys: keys ? [...keys] : null,
    ...(childRefs.length > 0 ? {childRefs} : {}),
    ...(childLists.length > 0 ? {childLists} : {}),
    ...(Object.keys(nestedChildRefs).length > 0 ? {nestedChildRefs} : {}),
  };
}
