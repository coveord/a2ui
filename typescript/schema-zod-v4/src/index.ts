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

/**
 * Zod 4 schema adapter for A2UI catalogs.
 *
 * Exports the adapter, the `z` it is built for, and the v1.0 common type
 * schemas that catalog components compose.
 */
export {
  parseZod4Catalog,
  ZOD4_SCHEMA_ADAPTER_NAME,
  zod4CatalogSchemaAdapter,
} from './catalog_adapter.js';
export {describeZod4Component, getZod4KnownSchemaKeys} from './resolution/describe_component.js';
export {z} from 'zod';
export {type ValidationResultInput} from './schema/catalog-definition.js';
export {childRefKindOf, markChildRef, type ChildRefKind} from './types/child-ref-helpers.js';
export {
  ActionSchema,
  AccessibilityAttributesSchema,
  CheckRuleSchema,
  ChildListSchema,
  ChildSchema,
  CommonSchemas,
  ComponentIdSchema,
  DataBindingSchema,
  DynamicBooleanSchema,
  DynamicNumberSchema,
  DynamicStringListSchema,
  DynamicStringSchema,
  DynamicValueSchema,
  FunctionCallSchema,
  type DataBinding,
  type FunctionCall,
} from './types/common-types.js';
