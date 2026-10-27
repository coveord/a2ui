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
import {objectSchema} from '../test/test_schemas.js';
import {
  JsonComponentApi,
  JsonFunctionApi,
  linkLoadedEntry,
  loadCatalogDocument,
  runtimeComponentSchema,
  type CatalogEntryConverters,
  type CatalogLoadContext,
} from './catalog_loading.js';
import type {PeerCatalogSource} from './catalog_refs.js';

const DOCUMENT = {
  catalogId: 'https://example.com/loaded.json',
  protocolVersion: '1.0',
  title: 'Loaded',
  components: {
    Label: {
      type: 'object',
      allOf: [{$ref: 'common_types.json#/$defs/ComponentCommon'}],
      properties: {
        component: {const: 'Label'},
        text: {$ref: 'common_types.json#/$defs/DynamicString'},
        child: {$ref: 'common_types.json#/$defs/ComponentId'},
      },
      required: ['component', 'text'],
    },
    Hidden: {type: 'object', properties: {component: {const: 'Hidden'}}},
  },
  functions: {
    shout: {
      type: 'object',
      description: 'Shouts.',
      returnType: 'string',
      properties: {
        '@call': {const: 'shout'},
        'args': {type: 'object', properties: {value: {type: 'string'}}, required: ['value']},
      },
      required: ['@call', 'args'],
    },
  },
  $defs: {
    anyComponent: {
      oneOf: [{$ref: '#/components/Label'}],
      discriminator: {propertyName: 'component'},
    },
    anyFunction: {oneOf: [{$ref: '#/functions/shout'}]},
  },
  extra: true,
};

/** Converters that record what they convert, with the peers they saw. */
function recordingConverters() {
  const seen: Array<{name: string; peers: readonly PeerCatalogSource[]}> = [];
  const converters: CatalogEntryConverters = {
    component: (name, _definition, context) => {
      seen.push({name, peers: context.peers});
      return objectSchema();
    },
    functionArgs: (name, args, context) => {
      seen.push({
        name: `${name}:${JSON.stringify(Object.keys(args?.['properties'] ?? {}))}`,
        peers: context.peers,
      });
      return objectSchema();
    },
    theme: () => objectSchema(),
  };
  return {seen, converters};
}

describe('loadCatalogDocument', () => {
  it('loads the entries the unions permit, and the document fields', () => {
    const loaded = loadCatalogDocument(DOCUMENT, {}, recordingConverters().converters);

    assert.strictEqual(loaded.id, 'https://example.com/loaded.json');
    assert.strictEqual(loaded.protocolVersion, '1.0');
    assert.deepStrictEqual(
      loaded.components.map(c => c.name),
      ['Label'],
    );
    assert.strictEqual(loaded.title, 'Loaded');
    assert.deepStrictEqual(loaded.unions, {anyComponent: true, anyFunction: true});
    assert.deepStrictEqual(loaded.extensionFields, {extra: true});
  });

  it('reads function metadata from the definition and converts on first use', () => {
    const {seen, converters} = recordingConverters();
    const [fn] = loadCatalogDocument(DOCUMENT, {}, converters).functions;

    assert.ok(fn instanceof JsonFunctionApi);
    assert.strictEqual(fn.returnType, 'string');
    assert.strictEqual(fn.description, 'Shouts.');
    assert.strictEqual(seen.length, 0);
    void fn.schema;
    assert.deepStrictEqual(
      seen.map(s => s.name),
      ['shout:["value"]'],
    );
  });

  it('rebuilds a loaded entry against peers', () => {
    const {seen, converters} = recordingConverters();
    const [label] = loadCatalogDocument(DOCUMENT, {}, converters).components;
    const peers = [{catalogId: 'https://example.com/peer.json'}];

    const linked = linkLoadedEntry(label, peers);
    void linked.schema;

    assert.ok(linked instanceof JsonComponentApi);
    assert.notStrictEqual(linked, label);
    assert.strictEqual(seen[0].peers, peers);
  });

  it('applies the overrides and rejects documents without an ID', () => {
    const loaded = loadCatalogDocument(
      DOCUMENT,
      {catalogId: 'override', protocolVersion: 'v1.0'},
      recordingConverters().converters,
    );
    assert.strictEqual(loaded.id, 'override');
    assert.strictEqual(loaded.protocolVersion, 'v1.0');

    assert.throws(
      () => loadCatalogDocument({components: {}}, {}, recordingConverters().converters),
      /Catalog ID must be specified/,
    );
  });

  it('requires UAX #31 identifiers from v1.0', () => {
    assert.throws(
      () =>
        loadCatalogDocument(
          {catalogId: 'c', protocolVersion: '1.0', components: {'bad-name': {}}},
          {},
          recordingConverters().converters,
        ),
      A2uiCatalogError,
    );
  });
});

describe('runtimeComponentSchema', () => {
  it('gives a closed, self-contained schema with runtime common types and JSON metadata', () => {
    let context: CatalogLoadContext | undefined;
    const converters: CatalogEntryConverters = {
      ...recordingConverters().converters,
      component: (_name, _definition, loadContext) => {
        context = loadContext;
        return objectSchema();
      },
    };
    void loadCatalogDocument(DOCUMENT, {}, converters).components[0].schema;

    const {schema, metadata} = runtimeComponentSchema('Label', context!);
    const defs = schema['$defs'] as Record<string, {anyOf?: unknown}>;

    // From v1.0, ComponentCommon contributes `accessibility` and `metadata`.
    assert.deepStrictEqual(Object.keys(schema['properties'] as object).sort(), [
      'accessibility',
      'child',
      'metadata',
      'text',
    ]);
    assert.deepStrictEqual(schema['required'], ['text']);
    assert.strictEqual(schema['additionalProperties'], false);
    // The runtime DataBinding accepts `path` as well as `@path`.
    assert.ok(Array.isArray(defs['DataBinding'].anyOf));
    assert.deepStrictEqual(metadata.childRefs, ['child']);
    assert.deepStrictEqual([...(metadata.propertyKeys ?? [])].sort(), [
      'accessibility',
      'child',
      'metadata',
      'text',
    ]);
  });
});
