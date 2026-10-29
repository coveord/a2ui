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

import type {z} from 'zod/v4';

/** A Zod 4 validation issue. */
export type ZodIssue = z.core.$ZodIssue;

/**
 * Formats a single Zod issue into a human-readable diagnostic message. A
 * union's issue carries the issues of its branches under `errors`, with paths
 * relative to the union.
 *
 * Direct attribute extraction is used so that issue details (such as unrecognized
 * property keys) are preserved even when running in optimized/minified
 * production builds where Zod's internal error map messages may be obfuscated
 * or stripped.
 *
 * @param err Zod validation issue to format.
 * @return Human-readable formatted error message.
 */
export function formatZodIssue(err: ZodIssue): string {
  const path = err.path.map(String).join('.') || 'root';

  switch (err.code) {
    case 'invalid_union': {
      const unionIssues = err.errors
        .flat()
        .map(issue => ({...issue, path: [...err.path, ...issue.path]}) as ZodIssue);
      if (unionIssues.length > 0) {
        return unionIssues.map(formatZodIssue).join('; ');
      }
      // An exclusive union (`z.xor`) that more than one branch accepts reports
      // no branch issues, only its message.
      return `${path}: ${err.message}`;
    }

    case 'unrecognized_keys': {
      const keysStr = err.keys.map(k => `'${k}'`).join(', ');
      return `${path}: Unrecognized key(s) in object: ${keysStr}`;
    }

    default:
      return err.message ? `${path}: ${err.message}` : `${path}: Validation error (${err.code})`;
  }
}
