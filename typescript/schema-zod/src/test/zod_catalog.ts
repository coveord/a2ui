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

import {
  Catalog,
  isStandardSchema,
  type CatalogOptions,
  type ComponentApi,
  type FunctionApi,
  type FunctionImplementation,
  type ProtocolVersion,
  type StandardSchema,
} from '@a2ui/web_core_v1_0';

import {zodCatalogSchemaAdapter} from '../catalog_adapter.js';

/**
 * A `Catalog` whose schemas are Zod schemas, for tests.
 *
 * Takes the same arguments as `Catalog` and adds `zodCatalogSchemaAdapter` to
 * its options, so tests written against `new Catalog(...)` keep their
 * arguments.
 */
export class ZodCatalog<
  T extends ComponentApi,
  F extends FunctionApi = FunctionImplementation,
> extends Catalog<T, F> {
  constructor(
    id: string,
    protocolVersion: ProtocolVersion | string,
    components: T[] = [],
    functions: F[] = [],
    themeSchemaOrOptions?: StandardSchema<any, any> | CatalogOptions,
    instructions?: string,
  ) {
    const options: CatalogOptions = isStandardSchema(themeSchemaOrOptions)
      ? {themeSchema: themeSchemaOrOptions}
      : ((themeSchemaOrOptions ?? {}) as CatalogOptions);
    super(
      id,
      protocolVersion,
      components,
      functions,
      {schemaAdapter: zodCatalogSchemaAdapter, ...options},
      instructions,
    );
  }
}
