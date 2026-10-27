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

import * as assert from 'node:assert';

import {
  extractRefFields,
  getKnownSchemaKeys,
  scrapeSchemaBehavior,
  type ComponentApi,
} from '@a2ui/web_core/v1_0';

/**
 * Returns `value` as JSON with object keys sorted and sets listed in order, so
 * that two values compare equal whatever order they were built in.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Set) return [...item].sort();
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return item;
  });
}

/**
 * Asserts that a component loaded with `Catalog.fromJson` binds as its code
 * counterpart does: the same binder behavior, child reference fields and
 * known property keys.
 *
 * @param loaded The component loaded from the published catalog.
 * @param code The component defined in code.
 */
export function assertBindsAlike(loaded: ComponentApi, code: ComponentApi): void {
  for (const inspect of [scrapeSchemaBehavior, extractRefFields, getKnownSchemaKeys]) {
    assert.strictEqual(
      canonical(inspect(loaded.schema)),
      canonical(inspect(code.schema)),
      `${inspect.name} differs for ${code.name}`,
    );
  }
}
