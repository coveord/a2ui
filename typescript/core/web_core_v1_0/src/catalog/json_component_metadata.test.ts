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

import {componentMetadataFromJson} from './json_component_metadata.js';
import {V10_STANDARD_DEFS} from '../standard_defs.js';

describe('componentMetadataFromJson', () => {
  it('reads child references, nested references and behavior from the referenced definitions', () => {
    const metadata = componentMetadataFromJson(
      {
        child: {$ref: '#/$defs/ComponentId'},
        children: {$ref: 'common_types.json#/$defs/ChildList'},
        tabs: {
          type: 'array',
          items: {type: 'object', properties: {child: {$ref: '#/$defs/Child'}}},
        },
        label: {$ref: '#/$defs/DynamicString'},
        action: {$ref: '#/$defs/Action'},
        size: {type: 'number'},
      },
      {},
      V10_STANDARD_DEFS,
      ['child', 'children', 'tabs', 'label', 'action', 'size'],
    );

    assert.deepStrictEqual(metadata.childRefs, ['child']);
    assert.deepStrictEqual(metadata.childLists, ['children', 'tabs']);
    assert.deepStrictEqual(metadata.nestedChildRefs, {tabs: ['child']});
    assert.deepStrictEqual(metadata.dynamicFields, {
      children: 'STRUCTURAL',
      label: 'DYNAMIC',
      action: 'ACTION',
    });
    const shape = metadata.behavior.type === 'OBJECT' ? metadata.behavior.shape : {};
    assert.strictEqual(shape['size'].type, 'STATIC');
    assert.strictEqual(shape['accessibility'].type, 'OBJECT');
    assert.deepStrictEqual(metadata.propertyKeys, [
      'child',
      'children',
      'tabs',
      'label',
      'action',
      'size',
    ]);
  });
});
