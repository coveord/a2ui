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

import {hasCrossDocumentRefs, PeerScope} from './catalog_references.js';

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

  it('resolves a peer catalog by its catalog ID and reads its document once', () => {
    const peer = {
      catalogId: 'https://example.com/peer.json',
      $defs: {Shared: {type: 'string'}},
    };
    const scope = new PeerScope([peer]);
    const target = scope.resolve('peer.json#/$defs/Shared', {catalogId: 'local'});

    assert.deepStrictEqual(target, {
      doc: peer,
      pointer: '#/$defs/Shared',
      key: 'peer.json#/$defs/Shared',
      isPeer: true,
    });
  });
});
