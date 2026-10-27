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

import * as assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {describe, it} from 'node:test';

import {parseZodCatalog} from '@a2ui/schema-zod';
import {MessageProcessor} from '@a2ui/web_core_v1_0';

import {basicCatalog} from './catalog.js';

/** The published basic catalog document, from the repository root. */
const PUBLISHED = JSON.parse(
  readFileSync(new URL('../../../../../catalogs/basic/v1/catalog.json', import.meta.url), 'utf8'),
);

describe('basicCatalog', () => {
  it('returns the published document from toJson', () => {
    assert.deepStrictEqual(basicCatalog.toJson(), PUBLISHED);
  });

  it('keeps the document-level fields of the published document', () => {
    assert.strictEqual(basicCatalog.id, PUBLISHED.catalogId);
    assert.strictEqual(basicCatalog.title, PUBLISHED.title);
    assert.strictEqual(basicCatalog.instructions, PUBLISHED.instructions);
  });

  it('inlines its document in renderer capabilities', () => {
    const capabilities = new MessageProcessor([basicCatalog]).getClientCapabilities({
      versions: ['v1.0'],
      includeInlineCatalogs: true,
    });

    assert.ok(JSON.stringify(capabilities).includes(PUBLISHED.catalogId));
  });

  it('builds the same validation schema as the Zod 3 adapter does from the published document', () => {
    // The published document declares no theme; the catalog adds its own
    // `BasicCatalogThemeSchema`, which the validation schema writes as `theme`.
    const {theme, ...defs} = basicCatalog.validationSchema['$defs'] as Record<string, unknown>;

    assert.deepStrictEqual(
      {...basicCatalog.validationSchema, $defs: defs},
      parseZodCatalog(PUBLISHED).validationSchema,
    );
    assert.deepStrictEqual(Object.keys((theme as {properties: object}).properties).sort(), [
      'agentDisplayName',
      'iconUrl',
      'primaryColor',
    ]);
  });
});
