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

import type {z} from 'zod';

import {
  getSchemaAnnotation,
  loadedDefinition,
  type CatalogInterface,
  type ComponentApi,
  type FunctionApi,
  type JsonSchemaObject,
  type ReproducedDefinitions,
} from '@a2ui/web_core_v1_0/catalog';
import {isSpecComponentSchema, isSpecFunctionSchema, SpecShaper} from './spec_shape.js';

/**
 * Returns the catalog document definitions that a catalog's Zod models
 * reproduce: the components and functions annotated with `spec()`, the
 * definitions their mixins and the catalog's `defModels` name, and an
 * annotated theme.
 *
 * @param catalog The catalog whose models to reproduce.
 * @throws {Error} If a `defModels` entry is not named with `specDef()`.
 */
export function reproduceZodDefinitions(
  catalog: CatalogInterface<ComponentApi, FunctionApi>,
): ReproducedDefinitions {
  const shaper = new SpecShaper(catalog.protocolVersion, catalog.commonTypesUri);
  const components = new Map<string, JsonSchemaObject>();
  const models = new Map<string, z.ZodTypeAny>();
  for (const [name, comp] of catalog.components) {
    if (loadedDefinition(comp) || !isSpecComponentSchema(comp.schema)) continue;
    const {schema, catalogDefs} = shaper.componentSchema(
      name,
      comp.schema as never,
      comp.allowedParents,
      comp.allowedChildren,
    );
    components.set(name, schema);
    for (const [defName, defModel] of catalogDefs) models.set(defName, defModel);
  }
  for (const defModel of catalog.defModels ?? []) {
    const defName = getSchemaAnnotation(defModel)?.defName;
    if (defName === undefined) {
      throw new Error('A catalog definition model must be named with specDef().');
    }
    models.set(defName, defModel as unknown as z.ZodTypeAny);
  }

  const defs = new Map<string, JsonSchemaObject>();
  for (const [defName, defModel] of models) {
    if (!(defName in (catalog.defs ?? {}))) defs.set(defName, shaper.defSchema(defModel));
  }
  const themeSchema = catalog.themeSchema as unknown as z.ZodTypeAny | undefined;
  const theme =
    themeSchema && (getSchemaAnnotation(themeSchema) || catalog.themeLocation === 'styles')
      ? shaper.defSchema(themeSchema)
      : undefined;

  return {
    components,
    defs,
    ...(theme ? {theme} : {}),
    functionDefinition: (name, fn, documentDefs) =>
      !loadedDefinition(fn) && isSpecFunctionSchema(fn.schema)
        ? shaper.functionSchema(name, fn as never, documentDefs)
        : undefined,
  };
}
