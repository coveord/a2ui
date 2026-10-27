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

import type {z} from 'zod/v3';
import type {OverrideCallback} from 'zod-to-json-schema';

import {childRefKindOf, type ChildRefKind} from '../types/child-ref-helpers.js';
import {exclusiveUnionOverride} from './exclusive_union.js';

/** The common types definition that each kind of child reference is written as. */
const CHILD_REF_DEFS: Readonly<Record<ChildRefKind, string>> = {
  'component-id': 'ComponentId',
  'child-list': 'ChildList',
};

/**
 * The `zod-to-json-schema` override for the schemas of catalog entries.
 *
 * A child reference whose `REF:` description was replaced, as
 * `ComponentIdSchema.describe('The child.')` does, is written as a `REF:`
 * marker to its common type, from the child reference marker the schema
 * keeps, so that a catalog loaded from the document still sees the child.
 * An optional child reference is written at its `ZodOptional`, which carries
 * the same description and would otherwise write it over the marker.
 * Unions are written as `exclusiveUnionOverride` writes them.
 */
export const entrySchemaOverride: OverrideCallback = (def, refs, seen, forceResolution) => {
  let inner = def as z.ZodOptionalDef;
  while (inner.typeName === 'ZodOptional') inner = inner.innerType._def as z.ZodOptionalDef;
  const kind = childRefKindOf({_def: inner} as never);
  const description = def.description;
  if (kind && !(typeof description === 'string' && description.startsWith('REF:'))) {
    const marker = `REF:#/$defs/${CHILD_REF_DEFS[kind]}`;
    return {description: description === undefined ? marker : `${marker}|${description}`};
  }
  return exclusiveUnionOverride(def, refs, seen, forceResolution);
};
