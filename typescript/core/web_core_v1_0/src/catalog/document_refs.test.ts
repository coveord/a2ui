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

import {hasCrossDocumentRefs} from './document_refs.js';

describe('hasCrossDocumentRefs', () => {
  it('finds a reference into another catalog document, however deep', () => {
    assert.strictEqual(
      hasCrossDocumentRefs({components: {A: {allOf: [{$ref: 'peer.json#/$defs/Base'}]}}}),
      true,
    );
    assert.strictEqual(
      hasCrossDocumentRefs([{$ref: 'https://example.com/other/catalog.json#/x'}]),
      true,
    );
  });

  it('ignores local, common types and bare catalog.json references', () => {
    assert.strictEqual(
      hasCrossDocumentRefs({
        a: {$ref: '#/$defs/Local'},
        b: {$ref: 'common_types.json#/$defs/DynamicString'},
        c: {$ref: 'https://a2ui.org/specification/v1_0/common_types.json#/$defs/Action'},
        d: {$ref: 'catalog.json#/$defs/Theme'},
      }),
      false,
    );
  });
});
