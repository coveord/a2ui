/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'node:assert';
import {describe, it} from 'node:test';

import {A2uiValidationError} from '../../errors.js';
import {InternalCreateSurfaceOp} from '../operations.js';
import {VersionAdapterFactory} from './factory.js';

describe('VersionAdapterFactory', () => {
  it('resolves v1.0 createSurface messages', () => {
    const payload = {
      version: 'v1.0',
      createSurface: {
        surfaceId: 'surface',
        catalogId: 'basic',
        components: [{id: 'root', component: 'Column'}],
        dataModel: {name: 'A2UI'},
        sendDataModel: true,
      },
    };

    const adapter = VersionAdapterFactory.resolveFromPayload(payload);
    const operation = adapter.extractOperations(payload)[0] as InternalCreateSurfaceOp;

    assert.strictEqual(adapter.version, 'v1.0');
    assert.strictEqual(operation.type, 'createSurface');
    assert.strictEqual(operation.surfaceId, 'surface');
    assert.deepStrictEqual(operation.components, payload.createSurface.components);
    assert.deepStrictEqual(operation.dataModel, payload.createSurface.dataModel);
  });

  it('rejects messages without an action', () => {
    assert.throws(
      () => VersionAdapterFactory.getAdapter('v1.0').extractOperations({version: 'v1.0'}),
      error => error instanceof A2uiValidationError,
    );
  });

  it('rejects unsupported versions', () => {
    assert.throws(
      () => VersionAdapterFactory.getAdapter('v2.0'),
      error => error instanceof A2uiValidationError,
    );
  });
});
