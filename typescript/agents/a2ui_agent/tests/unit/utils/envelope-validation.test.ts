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

import {describe, it, expect} from 'vitest';

import {A2uiValidationError} from '../../../src/internal/web-core.js';
import {validateEnvelope} from '../../../src/utils/envelope-validation.js';

describe('validateEnvelope', () => {
  it('accepts a valid envelope', () => {
    expect(() =>
      validateEnvelope({version: 'v1.0', deleteSurface: {surfaceId: 's1'}}, 'v1.0'),
    ).not.toThrow();
  });

  it('names a missing property as required', () => {
    expect(() =>
      validateEnvelope({version: 'v0.9', createSurface: {catalogId: 'c'}}, 'v0.9'),
    ).toThrow(/'surfaceId' is a required property/);
  });

  it('names a missing property that accepts any value as required', () => {
    expect(() =>
      validateEnvelope({version: 'v1.0', updateDataModel: {surfaceId: 's1'}}, 'v1.0'),
    ).toThrow(/'value' is a required property/);
  });

  it('reports a wrong type at its path', () => {
    expect(() =>
      validateEnvelope({version: 'v0.9', createSurface: {surfaceId: 1, catalogId: 'c'}}, 'v0.9'),
    ).toThrow(
      new A2uiValidationError(
        "Validation failed: Invalid input: expected string, received number at 'createSurface.surfaceId'",
      ),
    );
  });
});
