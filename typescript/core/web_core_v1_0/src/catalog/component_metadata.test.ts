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

import {A2uiCatalogError} from '../errors.js';
import {MessageProcessor} from '../processing/message-processor.js';
import type {ComponentNode} from '../resolution/component-node.js';
import {NodeResolver} from '../resolution/node-resolver.js';
import {peekValue} from '../reactivity/signals.js';
import {objectSchema, testSchemaAdapter} from '../test/test_schemas.js';
import type {CompleteComponentSchemaMetadata} from './schema_metadata.js';
import {Catalog, type ComponentApi} from './types.js';

const COLUMN_METADATA: CompleteComponentSchemaMetadata = {
  behavior: {type: 'OBJECT', shape: {children: {type: 'STRUCTURAL'}}},
  childLists: ['children'],
  propertyKeys: ['children'],
};

const TEXT_METADATA: CompleteComponentSchemaMetadata = {
  behavior: {type: 'OBJECT', shape: {text: {type: 'DYNAMIC'}}},
  propertyKeys: ['text'],
};

const column: ComponentApi = {
  name: 'Column',
  schema: objectSchema(),
  schemaMetadata: COLUMN_METADATA,
};
const text: ComponentApi = {
  name: 'Text',
  schema: objectSchema(['text']),
  schemaMetadata: TEXT_METADATA,
};

describe('Catalog.getComponentMetadata', () => {
  it('uses complete metadata the component carries, without a schema adapter', () => {
    const catalog = new Catalog('metadata-only', '1.0', [column]);

    assert.strictEqual(catalog.getComponentMetadata('Column'), COLUMN_METADATA);
    assert.strictEqual(catalog.getComponentMetadata('Missing'), undefined);
  });

  it('asks the adapter once, and lets the fields the component carries win', () => {
    let calls = 0;
    const schemaAdapter = testSchemaAdapter({
      describeComponent: () => {
        calls++;
        return {behavior: {type: 'OBJECT', shape: {}}, propertyKeys: null, childRefs: ['derived']};
      },
    });
    const partial: ComponentApi = {
      name: 'Partial',
      schema: objectSchema(),
      schemaMetadata: {childRefs: ['authored']},
    };
    const catalog = new Catalog('derived', '1.0', [partial], [], {schemaAdapter});

    const metadata = catalog.getComponentMetadata('Partial');
    assert.deepStrictEqual(metadata?.childRefs, ['authored']);
    assert.strictEqual(metadata?.propertyKeys, null);
    assert.strictEqual(catalog.getComponentMetadata('Partial'), metadata);
    assert.strictEqual(calls, 1);
  });

  it('names the component when it can neither read nor derive the metadata', () => {
    const catalog = new Catalog('bare', '1.0', [{name: 'Bare', schema: objectSchema()}]);

    assert.throws(
      () => catalog.getComponentMetadata('Bare'),
      (err: unknown) =>
        err instanceof A2uiCatalogError &&
        err.message.includes("Component 'Bare' in catalog 'bare'") &&
        err.message.includes("'describeComponent'"),
    );
  });

  it('derives the metadata again for a linked copy, whose entries may differ', () => {
    let calls = 0;
    const schemaAdapter = testSchemaAdapter({
      linkEntry: entry => ({...entry}),
      describeComponent: () => {
        calls++;
        return {behavior: {type: 'OBJECT', shape: {}}, propertyKeys: []};
      },
    });
    const bare: ComponentApi = {name: 'Bare', schema: objectSchema()};
    const catalog = new Catalog('origin', '1.0', [bare], [], {schemaAdapter});
    const peer = new Catalog('peer', '1.0', [], [], {schemaAdapter});

    catalog.getComponentMetadata('Bare');
    catalog.withPeerCatalogs([peer]).getComponentMetadata('Bare');

    assert.strictEqual(calls, 2);
  });

  it('builds the reference map from the metadata', () => {
    const tabs: ComponentApi = {
      name: 'Tabs',
      schema: objectSchema(),
      schemaMetadata: {
        behavior: {type: 'OBJECT', shape: {}},
        propertyKeys: ['tabs', 'header'],
        childRefs: ['header'],
        childLists: ['tabs'],
        nestedChildRefs: {tabs: ['child']},
      },
    };
    const catalog = new Catalog('refs', '1.0', [tabs]);

    assert.deepStrictEqual(catalog.componentRefMap, {
      Tabs: {
        singleRefs: new Set(['header']),
        listRefs: new Set(['tabs']),
        nestedRefs: {tabs: new Set(['child'])},
      },
    });
  });
});

describe('rendering a catalog with metadata and no schema adapter', () => {
  it('resolves child references from the metadata', () => {
    const catalog = new Catalog('metadata-only', '1.0', [column, text]);
    const protocolAdapter = testSchemaAdapter({getProtocolSchema: () => objectSchema()});
    const processor = new MessageProcessor([catalog], undefined, {schemaAdapter: protocolAdapter});

    processor.processMessages([
      {version: 'v1.0', createSurface: {surfaceId: 's', catalogId: catalog.id}},
      {
        version: 'v1.0',
        updateComponents: {
          surfaceId: 's',
          components: [
            {id: 'root', component: 'Column', children: ['greeting']},
            {id: 'greeting', component: 'Text', text: 'hi'},
          ],
        },
      },
    ]);
    const resolver = new NodeResolver(processor.model.getSurface('s')!);
    const root = peekValue(resolver.rootNode)!;
    const {children} = peekValue(root.props) as {children: Array<ComponentNode>};

    assert.strictEqual(root.type, 'Column');
    assert.deepStrictEqual(
      children.map(child => [
        child.type,
        (peekValue(child.props) as {text: {value: string}}).text.value,
      ]),
      [['Text', 'hi']],
    );
    resolver.dispose();
  });
});
