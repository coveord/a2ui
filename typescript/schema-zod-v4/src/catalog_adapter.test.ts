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
import {describe, it} from 'node:test';

import {A2uiValidationError, Catalog, MessageProcessor} from '@a2ui/web_core_v1_0';
import {z} from 'zod';

import {zod4CatalogSchemaAdapter} from './catalog_adapter.js';
import {ChildListSchema, DynamicStringSchema} from './types/common-types.js';

const ColumnApi = {name: 'Column', schema: z.object({children: ChildListSchema}).strict()};
const TextApi = {name: 'Text', schema: z.object({text: DynamicStringSchema}).strict()};

function zod4Catalog() {
  return new Catalog('https://example.com/zod4.json', '1.0', [ColumnApi, TextApi], [], {
    schemaAdapter: zod4CatalogSchemaAdapter,
  });
}

function createSurface(processor: MessageProcessor, catalog: {readonly id: string}) {
  processor.processMessages([
    {version: 'v1.0', createSurface: {surfaceId: 's', catalogId: catalog.id}},
  ]);
}

describe('zod4CatalogSchemaAdapter', () => {
  it('describes a catalog of Zod 4 components', () => {
    const catalog = zod4Catalog();

    assert.deepStrictEqual(catalog.getComponentMetadata('Column')?.childLists, ['children']);
    assert.deepStrictEqual(catalog.componentRefMap['Column'].listRefs, new Set(['children']));
    const text = catalog.getComponentMetadata('Text')?.behavior;
    assert.strictEqual(text?.type === 'OBJECT' && text.shape['text'].type, 'DYNAMIC');
  });

  it('processes messages for a Zod 4 catalog', () => {
    const catalog = zod4Catalog();
    const processor = new MessageProcessor([catalog]);
    createSurface(processor, catalog);
    processor.processMessages([
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

    const components = processor.model.getSurface('s')!.componentsModel;
    assert.deepStrictEqual(components.get('root')?.componentTree, {
      id: 'root',
      component: 'Column',
      children: ['greeting'],
    });
  });

  it("reports Zod 4's own issues for invalid component properties", () => {
    const catalog = zod4Catalog();
    const processor = new MessageProcessor([catalog]);
    createSurface(processor, catalog);

    assert.throws(
      () =>
        processor.processMessages([
          {
            version: 'v1.0',
            updateComponents: {
              surfaceId: 's',
              components: [{id: 'root', component: 'Text', text: 'hi', size: 3}],
            },
          },
        ]),
      (err: unknown) => err instanceof A2uiValidationError && /size/.test(err.message),
    );
  });

  it('validates protocol messages with the Zod 4 protocol schema', () => {
    const processor = new MessageProcessor([zod4Catalog()]);

    assert.throws(
      () => processor.processMessages([{version: 'v1.0', createSurface: {catalogId: 'x'}}]),
      A2uiValidationError,
    );
  });

  it('validates the accessibility envelope field', () => {
    const catalog = zod4Catalog();
    const processor = new MessageProcessor([catalog]);
    createSurface(processor, catalog);

    assert.throws(
      () =>
        processor.processMessages([
          {
            version: 'v1.0',
            updateComponents: {
              surfaceId: 's',
              components: [
                {id: 'root', component: 'Text', text: 'hi', accessibility: {hidden: 'no'}},
              ],
            },
          },
        ]),
      A2uiValidationError,
    );
  });
});
