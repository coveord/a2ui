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

/**
 * A2UI Web Core Library.
 *
 * Provides core catalog-agnostic state management, data binding, expression evaluation,
 * message processing, and validation infrastructure for A2UI renderers and clients.
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
export * from './functions/validation_functions_api.js';
export * from './functions/validation_functions.js';
export * from './errors.js';
export * from './common/events.js';
export * from './common/markdown.js';
export * from './common/semver.js';
export * from './common/uax31.js';
export * from './catalogs/basic/v1/index.js';
export {
  A2uiController,
  A2uiLitElement,
  isWebComponentImplementation,
  registerUniversalElement,
  renderA2uiNode,
  type A2uiChildRef,
  type A2uiWebComponentElement,
  type ResolvedChildList,
  type WebComponentImplementation,
} from './universal/index.js';
export * from './spec_versions.js';
export {isSafeRegex, type SafeRegexOptions} from './common/safe_regex.js';

import A2uiMessageSchemaRaw from './schemas/agent_to_renderer.json' with {type: 'json'};

export const Schemas = {A2uiMessageSchemaRaw};
