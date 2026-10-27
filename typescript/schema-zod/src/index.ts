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

/** Stable identity used when this package registers its catalog schema adapter. */
export {
  inlinePeerAndLocalRefs,
  installZodCatalogSchemaAdapter,
  zodCatalogSchemaAdapter,
} from './catalog_adapter.js';
export {
  getSpecAnnotation,
  spec,
  specDef,
  type JsonSchemaObject,
  type SpecAnnotation,
  type SpecMixin,
} from './spec_annotations.js';
export {z} from 'zod';
export {formatZodIssue} from './format-zod-issue.js';
export {type ValidationResultInput} from './schema/catalog-definition.js';
export {
  ActionSchema,
  AccessibilityAttributesSchema,
  CheckRuleSchema,
  ChildListSchema,
  ChildSchema,
  CommonSchemas,
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

export const ZOD_SCHEMA_ADAPTER_NAME = '@a2ui/schema-zod';
