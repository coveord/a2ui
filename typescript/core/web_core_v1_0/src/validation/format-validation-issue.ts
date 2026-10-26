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

/** Structural validation issue fields used by supported schema implementations. */
export interface ValidationIssue {
  readonly code?: string;
  readonly expected?: unknown;
  readonly keys?: readonly unknown[];
  readonly message?: string;
  readonly options?: readonly unknown[];
  readonly path?: readonly PropertyKey[];
  readonly received?: unknown;
  readonly unionErrors?: readonly {readonly issues: readonly ValidationIssue[]}[];
}

/** Formats a structural validation issue into a stable human-readable diagnostic. */
export function formatValidationIssue(issue: ValidationIssue): string {
  const path = issue.path?.map(String).join('.') || 'root';

  switch (issue.code) {
    case 'invalid_union': {
      const unionIssues = issue.unionErrors?.flatMap(error => error.issues);
      return unionIssues?.length
        ? unionIssues.map(formatValidationIssue).join('; ')
        : `${path}: Invalid union`;
    }
    case 'unrecognized_keys':
      return `${path}: Unrecognized key(s) in object: ${(issue.keys ?? [])
        .map(key => `'${String(key)}'`)
        .join(', ')}`;
    case 'invalid_enum_value':
      return `${path}: Invalid enum value. Expected ${(issue.options ?? []).map(String).join(' | ')}, received '${String(issue.received)}'`;
    case 'invalid_type':
      return `${path}: Expected ${String(issue.expected)}, received ${String(issue.received)}`;
    default:
      return issue.message
        ? `${path}: ${issue.message}`
        : `${path}: Validation error (${issue.code ?? 'unknown'})`;
  }
}
