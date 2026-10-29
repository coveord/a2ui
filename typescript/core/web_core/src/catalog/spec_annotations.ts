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

import {z} from 'zod/v3';

/**
 * A JSON Schema object, as written in a catalog document.
 */
export type JsonSchemaObject = Readonly<Record<string, unknown>>;

/**
 * A mixin that a component's definition composes with `allOf`: the name of a
 * common type (`'ComponentCommon'`, `'Checkable'`), referenced in the
 * catalog's common types document, or a model named with {@link specDef},
 * which the catalog document declares under `$defs`.
 */
export type SpecMixin = string | z.ZodTypeAny;

/**
 * What a catalog document writes about a Zod schema that the schema itself
 * does not express. `Catalog.toJson` reads it when it computes the document
 * of a catalog defined in code; it never changes validation.
 */
export interface SpecAnnotation {
  /**
   * Schemas that follow the schema's own in an `allOf`, such as an
   * `if`/`then` format rule.
   */
  readonly allOf?: readonly JsonSchemaObject[];
  /**
   * Keywords the document writes beside the ones derived from the schema,
   * such as `format`, or an object's `anyOf` of `required` lists.
   */
  readonly keywords?: JsonSchemaObject;
  /**
   * The keyword that closes an object schema. By default a strict object is
   * closed with `additionalProperties`, and any other object is left open.
   * The value is `true` for a passthrough object and `false` otherwise.
   */
  readonly closure?: 'additionalProperties' | 'unevaluatedProperties' | 'none';
  /**
   * The order of an object's `required` list, when it is not the order of
   * the object's properties.
   */
  readonly required?: readonly string[];
  /**
   * The mixins a component's definition composes with `allOf`, in order.
   * Set on a component's schema, it marks the component as one whose
   * definition `Catalog.toJson` computes in the layout of the catalog's
   * protocol version; the schema's own properties are those no mixin
   * declares.
   */
  readonly mixins?: readonly SpecMixin[];
  /** The name under which a catalog document declares the model in `$defs`. */
  readonly defName?: string;
  /** The canonical model declared in `$defs` by {@link specDef}. */
  readonly defModel?: z.ZodTypeAny;
}

const annotations = new WeakMap<object, SpecAnnotation>();

/**
 * The annotations by the definition of the annotated schema, for converters
 * such as `zod-to-json-schema` that see definitions only.
 */
const annotationsByDef = new WeakMap<object, SpecAnnotation>();

function cloneWithDefAnnotation<T extends z.ZodTypeAny>(
  schema: T,
  nextAnnotation: SpecAnnotation,
  description: string | undefined = schema.description,
): T {
  const copy = z.ZodType.prototype.describe.call(schema, description as string) as T;
  annotations.set(copy, nextAnnotation);
  annotationsByDef.set(copy._def, nextAnnotation);
  copy.describe = (nextDescription: string) =>
    cloneWithDefAnnotation(copy, annotations.get(copy) ?? nextAnnotation, nextDescription);
  return copy;
}

/**
 * Returns a copy of a Zod schema that carries what a catalog document writes
 * about it beyond the schema itself.
 *
 * The copy validates exactly as `schema` does and has its type, so it can be
 * used wherever `schema` is. Annotating a copy keeps a shared schema, such as
 * a common type, free of the annotations of one of its uses.
 *
 * @deprecated For Zod 3 schemas only. With Zod 4, annotate with
 *     `.meta(specMeta(annotation))`.
 * @param schema The schema to annotate.
 * @param annotation What the document writes about it.
 * @returns An annotated copy of `schema`.
 */
export function spec<T extends z.ZodTypeAny>(schema: T, annotation: SpecAnnotation): T {
  const copy = z.ZodType.prototype.describe.call(schema, schema.description as string) as T;
  const merged = {...annotations.get(schema), ...annotation};
  annotations.set(copy, merged);
  annotationsByDef.set(copy._def, merged);
  return copy;
}

/**
 * Returns a copy of a Zod model that a catalog document declares under
 * `$defs` as `name`, such as the `CatalogComponentCommon` mixin of the v0.9
 * basic catalog or its `theme`.
 *
 * @deprecated For Zod 3 schemas only. With Zod 4, name the model with
 *     `.meta(specMeta({defName: name}))`.
 * @param name The definition's name.
 * @param schema The definition's model.
 * @param annotation Anything else the document writes about the model.
 * @returns An annotated copy of `schema`.
 */
export function specDef<T extends z.ZodTypeAny>(
  name: string,
  schema: T,
  annotation: Omit<SpecAnnotation, 'defName' | 'defModel' | 'mixins'> = {},
): T {
  const copy = cloneWithDefAnnotation(schema, {
    ...annotations.get(schema),
    ...annotation,
    defName: name,
  });
  const annotated = {...annotations.get(copy), defName: name, defModel: copy};
  annotations.set(copy, annotated);
  annotationsByDef.set(copy._def, annotated);
  return copy;
}

/**
 * The JSON Schema keyword under which a schema written without Zod 3 carries
 * its annotation, such as with Zod 4's `.meta()`. A2UI reads it from the
 * schema's JSON Schema and never writes it to a catalog document.
 */
export const SPEC_KEYWORD = 'x-a2ui-spec';

/**
 * An annotation as a schema carries it in its JSON Schema: its mixins are
 * names, each that of one of the catalog's `defModels`, such as the v0.9
 * basic catalog's `CatalogComponentCommon`, or else of a common type, such as
 * `Checkable`.
 */
export type JsonSpecAnnotation = Omit<SpecAnnotation, 'mixins'> & {
  readonly mixins?: readonly string[];
};

/**
 * An annotation as `specMeta` takes it: a mixin is a common type's name, or a
 * model named with `specMeta({defName})` that the catalog document declares
 * under `$defs`.
 */
export type SpecMetaAnnotation = Omit<SpecAnnotation, 'mixins'> & {
  readonly mixins?: readonly (string | SpecMetaSchema)[];
  /**
   * The models, each named with `specMeta({defName})`, of the catalog
   * definitions the schema's properties refer to, such as the v1.0 basic
   * catalog's `Weight`. A property that is one of them is written as a
   * reference to its definition, which the catalog document declares under
   * `$defs`.
   */
  readonly defs?: readonly SpecMetaSchema[];
};

/** A schema that reports its metadata, as a Zod 4 schema does with `meta()`. */
interface SpecMetaSchema {
  meta(): Readonly<Record<string, unknown>> | undefined;
}

/**
 * The models of the annotations `specMeta` returned, by definition name: the
 * mixin models and the models of `defs`.
 */
const carriedModels = new WeakMap<object, ReadonlyMap<string, object>>();

/**
 * Returns the metadata that annotates a schema written with a library that
 * writes metadata into its JSON Schema, as `spec()` annotates a Zod 3
 * schema. With Zod 4:
 *
 * ```ts
 * z.object({...}).strict().meta(specMeta({mixins: ['Checkable']}))
 * ```
 *
 * A mixin model is written to the schema's JSON Schema as its name, and the
 * models of `defs` are left out of it. A2UI finds the models through the
 * schema's `meta()`, so a component reused in another catalog brings its
 * mixins and definitions along; with a library whose schemas have no
 * `meta()`, list the models in the catalog's `defModels` instead.
 *
 * @param annotation What the catalog document writes about the schema.
 */
export function specMeta(annotation: SpecMetaAnnotation): {
  readonly [SPEC_KEYWORD]: JsonSpecAnnotation;
} {
  const {defs, mixins: mixinsOrModels, ...rest} = annotation;
  const models = new Map<string, object>();
  const named = (model: SpecMetaSchema, kind: string): string => {
    const defName = specMetaOf(model)?.defName;
    if (defName === undefined) {
      throw new Error(`A ${kind} model must be named with specMeta({defName}).`);
    }
    models.set(defName, model);
    return defName;
  };
  for (const model of defs ?? []) named(model, 'definition');
  const mixins = mixinsOrModels?.map(mixin =>
    typeof mixin === 'string' ? mixin : named(mixin, 'mixin'),
  );
  const json: JsonSpecAnnotation = mixins === undefined ? rest : {...rest, mixins};
  if (models.size > 0) carriedModels.set(json, models);
  return {[SPEC_KEYWORD]: json};
}

/** Returns the `specMeta` annotation a schema reports through `meta()`. */
function specMetaOf(schema: unknown): JsonSpecAnnotation | undefined {
  const meta = (schema as Partial<SpecMetaSchema> | null)?.meta?.();
  const annotation = meta?.[SPEC_KEYWORD];
  return typeof annotation === 'object' && annotation !== null
    ? (annotation as JsonSpecAnnotation)
    : undefined;
}

/**
 * Returns the models a schema annotated with `specMeta` carries, by
 * definition name: its mixin models and the models of its `defs`.
 *
 * @internal
 * @param schema The annotated schema.
 */
export function getSpecModels(schema: unknown): ReadonlyMap<string, object> | undefined {
  const annotation = specMetaOf(schema);
  return annotation ? carriedModels.get(annotation) : undefined;
}

/**
 * Returns the annotation of a Zod schema itself, if any.
 *
 * @param schema A Zod schema.
 */
export function getSpecAnnotation(schema: unknown): SpecAnnotation | undefined {
  return typeof schema === 'object' && schema !== null ? annotations.get(schema) : undefined;
}

/**
 * Returns the annotation of the Zod schema a definition belongs to, if any.
 *
 * @internal
 * @param def The definition (`_def`) of a Zod schema.
 */
export function getSpecAnnotationOfDef(def: object): SpecAnnotation | undefined {
  return annotationsByDef.get(def);
}
