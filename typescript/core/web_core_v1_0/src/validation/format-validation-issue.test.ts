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

import {formatValidationIssue} from './format-validation-issue.js';

describe('formatValidationIssue', () => {
  it('formats structural validation details without a schema-library dependency', () => {
    assert.strictEqual(
      formatValidationIssue({
        code: 'invalid_enum_value',
        options: ['body', 'caption'],
        path: ['variant'],
        received: 'title',
      }),
      "variant: Invalid enum value. Expected body | caption, received 'title'",
    );
    assert.strictEqual(
      formatValidationIssue({code: 'unrecognized_keys', keys: ['extra'], path: []}),
      "root: Unrecognized key(s) in object: 'extra'",
    );
  });

  it('formats nested union diagnostics recursively', () => {
    assert.strictEqual(
      formatValidationIssue({
        code: 'invalid_union',
        path: ['value'],
        unionErrors: [
          {
            issues: [
              {code: 'invalid_type', expected: 'string', received: 'number', path: ['value']},
            ],
          },
        ],
      }),
      'value: Expected string, received number',
    );
  });
});
