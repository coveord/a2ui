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

import {z} from 'zod';

const schemaKeysCache = new WeakMap<z.ZodTypeAny, Set<string> | null>();

/** Returns declared keys, or null when a Zod schema permits arbitrary keys. */
export function getZodKnownSchemaKeys(schema: unknown): Set<string> | null {
  if (!(schema instanceof z.ZodType)) {
    return null;
  }
  const cached = schemaKeysCache.get(schema);
  if (cached !== undefined || schemaKeysCache.has(schema)) {
    return cached ?? null;
  }

  const result = getZodSchemaKeys(schema);
  schemaKeysCache.set(schema, result);
  return result;
}

function getZodSchemaKeys(schema: z.ZodTypeAny): Set<string> | null {
  let current: z.ZodTypeAny | undefined = schema;
  while (current) {
    const def = current._def as {
      typeName?: string;
      unknownKeys?: string;
      shape?: (() => Record<string, z.ZodTypeAny>) | Record<string, z.ZodTypeAny>;
      schema?: z.ZodTypeAny;
      innerType?: z.ZodTypeAny;
      left?: z.ZodTypeAny;
      right?: z.ZodTypeAny;
      options?: readonly z.ZodTypeAny[];
    };
    if (def.typeName === 'ZodObject') {
      if (def.unknownKeys === 'passthrough') return null;
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      return shape ? new Set(Object.keys(shape)) : null;
    }
    if (def.typeName === 'ZodEffects') {
      current = def.schema;
      continue;
    }
    if (
      def.typeName === 'ZodOptional' ||
      def.typeName === 'ZodNullable' ||
      def.typeName === 'ZodDefault' ||
      def.typeName === 'ZodCatch'
    ) {
      current = def.innerType;
      continue;
    }
    if (def.typeName === 'ZodIntersection') {
      const leftKeys = getZodKnownSchemaKeys(def.left);
      const rightKeys = getZodKnownSchemaKeys(def.right);
      return leftKeys && rightKeys ? new Set([...leftKeys, ...rightKeys]) : null;
    }
    if (def.typeName === 'ZodUnion') {
      const keys = new Set<string>();
      for (const option of def.options ?? []) {
        const optionKeys = getZodKnownSchemaKeys(option);
        if (!optionKeys) return null;
        for (const key of optionKeys) keys.add(key);
      }
      return keys;
    }
    return null;
  }
  return null;
}
