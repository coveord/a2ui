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

const COMMON_TYPES_DOCUMENT = 'common_types.json';
const CATALOG_DOCUMENT = 'catalog.json';

/** Whether `doc` is the document `name`, bare or as the last segment of a path. */
function isDocumentNamed(doc: string, name: string): boolean {
  return doc === name || doc.endsWith(`/${name}`);
}

/**
 * Whether a JSON document contains a `$ref` into another catalog document: one
 * whose document part is neither empty, nor the common types document, nor a
 * bare `catalog.json`.
 *
 * @param node A catalog document or a part of one.
 */
export function hasCrossDocumentRefs(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasCrossDocumentRefs);
  if (!node || typeof node !== 'object') return false;
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const hash = value.indexOf('#');
      const doc = hash < 0 ? value : value.slice(0, hash);
      if (doc && doc !== CATALOG_DOCUMENT && !isDocumentNamed(doc, COMMON_TYPES_DOCUMENT)) {
        return true;
      }
    } else if (hasCrossDocumentRefs(value)) {
      return true;
    }
  }
  return false;
}
