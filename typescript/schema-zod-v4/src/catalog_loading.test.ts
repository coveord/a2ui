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
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';

import {parseZodCatalog} from '@a2ui/schema-zod';
import {
  linkCatalogs,
  MessageProcessor,
  validateStandardSchema,
  type Catalog,
  type CatalogApi,
} from '@a2ui/web_core_v1_0';

import {parseZod4Catalog} from './catalog_adapter.js';

/** The repository root, found from this file. */
function repositoryRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'conformance', 'test_data'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Repository root not found.');
    dir = parent;
  }
  return dir;
}

const ROOT = repositoryRoot();
const CATALOGS = join(ROOT, 'conformance', 'test_data', 'catalogs');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The v1.0 catalog documents both adapters load on their own. */
const DOCUMENTS = [
  ...readdirSync(CATALOGS)
    .filter(file => file.endsWith('_v1_0.json') && !file.startsWith('cross_ref'))
    .map(file => join(CATALOGS, file)),
  join(ROOT, 'catalogs', 'basic', 'v1', 'catalog.json'),
];

/** Property values that tell the runtime common types apart. */
const VALUES: unknown[] = [
  's',
  1,
  true,
  null,
  [],
  ['a'],
  {},
  {'path': '/a'},
  {'@path': '/a'},
  {'@path': 1},
  {'@call': 'formatString', 'args': {value: 'x'}},
  {'@call': 'f', 'bogus': 1},
  {componentId: 'c', path: '/p'},
  {event: {name: 'e'}},
  {functionCall: {'@call': 'openUrl', 'args': {url: 'u'}}},
  {condition: {'@path': '/a'}, message: 'm'},
];

/**
 * Functions whose arguments the specification requires to name `min` or
 * `max`. The Zod 3 loader ignores that requirement; the Zod 4 adapter enforces
 * it, so a call that names neither is the one expected difference.
 */
const MIN_OR_MAX = new Set(['length', 'numeric']);

/** Asserts that both catalogs accept the same values for every entry. */
function assertSameValidation(zod4: CatalogApi, zod3: CatalogApi): void {
  for (const [name, component] of zod3.components) {
    const converted = zod4.components.get(name)!.schema;
    const keys = Object.keys((component.schema as {shape?: object}).shape ?? {});
    for (const sample of [{}, ...keys.flatMap(key => VALUES.map(value => ({[key]: value})))]) {
      assert.strictEqual(
        validateStandardSchema(converted, sample).issues === undefined,
        validateStandardSchema(component.schema, sample).issues === undefined,
        `${zod3.id} ${name} ${JSON.stringify(sample)}`,
      );
    }
  }
  for (const [name, fn] of zod3.functions) {
    const converted = zod4.functions.get(name)!.schema;
    const keys = Object.keys((fn.schema as {shape?: object}).shape ?? {});
    for (const sample of [{}, ...keys.flatMap(key => VALUES.map(value => ({[key]: value})))]) {
      const zod3Accepts = validateStandardSchema(fn.schema, sample).issues === undefined;
      const expected =
        zod3Accepts && !(MIN_OR_MAX.has(name) && !('min' in sample || 'max' in sample));
      assert.strictEqual(
        validateStandardSchema(converted, sample).issues === undefined,
        expected,
        `${zod3.id} ${name} ${JSON.stringify(sample)}`,
      );
    }
  }
}

describe('zod4CatalogSchemaAdapter loading', () => {
  for (const path of DOCUMENTS) {
    it(`loads ${path.slice(ROOT.length + 1)} as the Zod 3 adapter does`, () => {
      const document = readJson(path);
      const zod4 = parseZod4Catalog(document);
      const zod3 = parseZodCatalog(document);

      assert.deepStrictEqual(zod4.toJson(), zod3.toJson());
      assert.deepStrictEqual(zod4.validationSchema, zod3.validationSchema);
      for (const name of zod3.components.keys()) {
        const metadata4 = zod4.getComponentMetadata(name)!;
        const metadata3 = zod3.getComponentMetadata(name)!;
        assert.deepStrictEqual(
          [metadata4.childRefs ?? [], metadata4.childLists ?? [], metadata4.nestedChildRefs ?? {}],
          [metadata3.childRefs ?? [], metadata3.childLists ?? [], metadata3.nestedChildRefs ?? {}],
          name,
        );
        assert.deepStrictEqual(
          [...(metadata4.propertyKeys ?? [])].sort(),
          [...(metadata3.propertyKeys ?? [])].sort(),
          name,
        );
      }
      assertSameValidation(zod4, zod3);
    });
  }

  it('resolves cross-catalog references once linked to the peer', () => {
    const cross = readJson(join(CATALOGS, 'cross_ref_catalog_v1_0.json'));
    const peer = readJson(join(CATALOGS, 'simplified_catalog_v1_0.json'));
    const [zod4] = linkCatalogs([parseZod4Catalog(cross), parseZod4Catalog(peer)]);
    const [zod3] = linkCatalogs([parseZodCatalog(cross), parseZodCatalog(peer)]);

    assert.deepStrictEqual(zod4.validationSchema, zod3.validationSchema);
    assertSameValidation(zod4, zod3);
  });

  it('fails an entry whose cross-catalog reference has no peer, as the Zod 3 adapter does', () => {
    const cross = readJson(join(CATALOGS, 'cross_ref_catalog_v1_0.json'));

    assert.throws(() => parseZod4Catalog(cross).components.get('CustomText')!.schema);
    assert.throws(() => parseZodCatalog(cross).components.get('CustomText')!.schema);
  });

  it('processes messages for a loaded catalog', () => {
    const catalog = parseZod4Catalog(
      readJson(join(ROOT, 'catalogs', 'basic', 'v1', 'catalog.json')),
    );
    const processor = new MessageProcessor([catalog as Catalog<any>]);

    processor.processMessages([
      {version: 'v1.0', createSurface: {surfaceId: 's', catalogId: catalog.id}},
      {
        version: 'v1.0',
        updateComponents: {
          surfaceId: 's',
          components: [
            {id: 'root', component: 'Column', children: ['greeting']},
            {id: 'greeting', component: 'Text', text: {path: '/name'}},
          ],
        },
      },
    ]);

    const model = processor.model.getSurface('s')!.componentsModel;
    assert.deepStrictEqual(model.get('greeting')?.componentTree, {
      id: 'greeting',
      component: 'Text',
      text: {path: '/name'},
    });
    assert.deepStrictEqual(catalog.getComponentMetadata('Column')?.childLists, ['children']);
  });
});
