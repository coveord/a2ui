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
import {describe, it} from 'node:test';

import {A2uiCatalogError} from '../errors.js';
import {
  hasCrossDocumentRefs,
  inlineSchemaReferences,
  PeerScope,
  resolveJsonPointer,
  resolvePeerTarget,
} from './catalog_references.js';

describe('catalog references', () => {
  it('detects references into peer catalogs but not standard common types', () => {
    assert.strictEqual(
      hasCrossDocumentRefs({$ref: 'https://example.com/catalog.json#/$defs/Shared'}),
      true,
    );
    assert.strictEqual(
      hasCrossDocumentRefs({$ref: 'common_types.json#/$defs/DynamicString'}),
      false,
    );
    assert.strictEqual(hasCrossDocumentRefs({$ref: 'catalog.json#/$defs/Local'}), false);
  });

  it('resolves escaped JSON Pointer segments', () => {
    const document = {$defs: {'a/b': {'~key': {type: 'string'}}}};
    assert.deepStrictEqual(resolveJsonPointer(document, '#/$defs/a~1b/~0key'), {type: 'string'});
    assert.strictEqual(resolveJsonPointer(document, '#/$defs/missing'), undefined);
  });

  it('strips a referenced peer component envelope and preserves allOf precedence', () => {
    const peer = {
      catalogId: 'peer.json',
      components: {
        Field: {
          allOf: [
            {properties: {shared: {type: 'string'}}, required: ['shared']},
            {
              properties: {
                component: {const: 'Field'},
                id: {type: 'string'},
                value: {type: 'string'},
              },
              required: ['component', 'id', 'value'],
              additionalProperties: false,
            },
          ],
        },
      },
    };
    const target = new PeerScope([peer]).resolve('peer.json#/components/Field', {
      catalogId: 'local',
    });
    assert.deepStrictEqual(resolvePeerTarget(target!), {
      doc: peer,
      target: {
        allOf: [
          {properties: {value: {type: 'string'}}, required: ['value']},
          {properties: {shared: {type: 'string'}}, required: ['shared']},
        ],
      },
    });
  });

  it('inlines peer-local references and leaves recursive local references finite', () => {
    const peer = {
      catalogId: 'peer.json',
      $defs: {
        Outer: {type: 'object', properties: {value: {$ref: '#/$defs/Inner'}}},
        Inner: {type: 'string'},
      },
    };
    assert.deepStrictEqual(
      inlineSchemaReferences({$ref: 'peer.json#/$defs/Outer'}, {catalogId: 'local'}, [peer]),
      {type: 'object', properties: {value: {type: 'string'}}},
    );

    const recursive = {$defs: {Node: {type: 'object', properties: {next: {$ref: '#/$defs/Node'}}}}};
    assert.deepStrictEqual(inlineSchemaReferences({$ref: '#/$defs/Node'}, recursive), {
      type: 'object',
      properties: {next: {$ref: '#/$defs/Node'}},
    });
  });

  it('resolves references using the documented peer matching rule', () => {
    const local = {catalogId: 'https://example.com/local.json'};
    const exact = {catalogId: 'exact.json'};
    const nested = {catalogId: 'https://example.com/catalogs/nested.json'};
    const short = {catalogId: 'short.json'};
    const named = {$id: 'https://example.com/named.json'};
    const catalogNamed = {$id: 'https://example.com/catalog.json'};
    const cases = [
      {
        label: 'an empty document part resolves locally',
        ref: '#/$defs/Local',
        peers: [],
        expected: local,
      },
      {
        label: 'the bare common types document is not a catalog reference',
        ref: 'common_types.json#/$defs/Value',
        peers: [],
        expected: undefined,
      },
      {
        label: 'a common types path suffix is not a catalog reference',
        ref: 'https://a2ui.org/v1/common_types.json#/$defs/Value',
        peers: [],
        expected: undefined,
      },
      {
        label: 'a bare catalog document resolves locally before checking peers',
        ref: 'catalog.json#/$defs/Local',
        peers: [catalogNamed],
        expected: local,
      },
      {
        label: 'an exact catalog ID matches a peer',
        ref: 'exact.json#/$defs/Shared',
        peers: [exact],
        expected: exact,
      },
      {
        label: 'a peer catalog ID ending in the reference document matches',
        ref: 'nested.json#/$defs/Shared',
        peers: [nested],
        expected: nested,
      },
      {
        label: 'a reference document ending in the peer catalog ID matches',
        ref: 'https://example.com/catalogs/short.json#/$defs/Shared',
        peers: [short],
        expected: short,
      },
      {
        label: 'an unmatched path ending in catalog.json resolves locally',
        ref: 'missing/catalog.json#/$defs/Local',
        peers: [],
        expected: local,
      },
      {
        label: 'a matching final path segment resolves a peer',
        ref: 'other/path/named.json#/$defs/Shared',
        peers: [named],
        expected: named,
      },
      {
        label: 'an unknown catalog document is unresolved',
        ref: 'missing.json#/$defs/Shared',
        peers: [],
        expected: undefined,
        throws: true,
      },
    ] as const;

    for (const testCase of cases) {
      const {label, ref, peers, expected} = testCase;
      const throws = 'throws' in testCase && testCase.throws;
      const scope = new PeerScope(peers);
      const target = scope.resolve(ref, local);
      if (expected) {
        assert.strictEqual(target?.doc, expected, label);
        assert.strictEqual(target?.pointer, ref.slice(ref.indexOf('#')), label);
        assert.strictEqual(target?.isPeer, expected !== local, label);
      } else {
        assert.strictEqual(target, undefined, label);
      }
      if (throws) assert.throws(() => scope.assertResolvable(ref), A2uiCatalogError, label);
      else assert.doesNotThrow(() => scope.assertResolvable(ref), label);
    }
  });
});
