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

export * from './catalog/index.js';
export * from './state/index.js';
export * from './processing/index.js';
export * from './resolution/index.js';
export * from './validation/index.js';
export * from './reactivity/index.js';
export * from './expressions/index.js';
export * from './rpc/index.js';
export * from './schema/index.js';
export * from './standard_defs.js';
export * from './functions/system_functions.js';
export * from './errors.js';
export * from './common/events.js';
export * from './common/markdown.js';
export * from './common/semver.js';
export * from './common/uax31.js';
export {isSafeRegex, type SafeRegexOptions} from './common/safe_regex.js';
export * from './spec_versions.js';
export * from './universal/index.js';

import A2uiMessageSchemaRaw from './schemas/agent_to_renderer.json' with {type: 'json'};

export const Schemas = {A2uiMessageSchemaRaw};
export {toWebComponentImplementation} from './universal/to_web_component_implementation.js';
export {
  createAndImplementation,
  createFormatCurrencyImplementation,
  createFormatDateImplementation,
  createFormatNumberImplementation,
  createFormatStringImplementation,
  createNotImplementation,
  createOpenUrlImplementation,
  createOrImplementation,
  createPluralizeImplementation,
  isTruthyOrValid,
} from './common/basic_functions.js';
export {
  validateEmail,
  validateLength,
  validateNumeric,
  validateRegex,
  validateRequired,
} from './common/basic_functions.js';
