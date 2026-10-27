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

import {AccessibilityAttributesSchema, type SchemaBehavior} from '@a2ui/web_core_v1_0';
import {z} from 'zod';

import {extractRefDefName} from '../catalog/reference-map.js';

const behaviorCache = new WeakMap<z.ZodTypeAny, SchemaBehavior>();

function childRefKindOf(schema: z.ZodTypeAny): 'component-id' | 'child-list' | undefined {
  return (schema?._def as {a2uiChildRef?: 'component-id' | 'child-list'} | undefined)?.a2uiChildRef;
}

function unwrapZodSchema(type: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = type;
  while (current) {
    const def = current._def as {
      typeName?: string;
      innerType?: z.ZodTypeAny;
      schema?: z.ZodTypeAny;
      type?: z.ZodTypeAny;
      getter?: () => z.ZodTypeAny;
    };
    if (
      def.typeName === 'ZodOptional' ||
      def.typeName === 'ZodNullable' ||
      def.typeName === 'ZodDefault' ||
      def.typeName === 'ZodReadonly'
    ) {
      current = def.innerType as z.ZodTypeAny;
    } else if (def.typeName === 'ZodEffects') {
      current = def.schema as z.ZodTypeAny;
    } else if (def.typeName === 'ZodBranded') {
      current = def.type as z.ZodTypeAny;
    } else if (def.typeName === 'ZodLazy') {
      current = def.getter?.() as z.ZodTypeAny;
    } else {
      break;
    }
  }
  return current;
}

function getRefDefName(type: z.ZodTypeAny): string {
  let current: z.ZodTypeAny = type;
  let description = '';
  while (current) {
    const def = current._def as {
      typeName?: string;
      description?: string;
      innerType?: z.ZodTypeAny;
      schema?: z.ZodTypeAny;
      type?: z.ZodTypeAny;
      getter?: () => z.ZodTypeAny;
    };
    description = current.description ?? def.description ?? '';
    if (description) break;
    if (
      def.typeName === 'ZodOptional' ||
      def.typeName === 'ZodNullable' ||
      def.typeName === 'ZodDefault' ||
      def.typeName === 'ZodReadonly'
    ) {
      current = def.innerType as z.ZodTypeAny;
    } else if (def.typeName === 'ZodEffects') {
      current = def.schema as z.ZodTypeAny;
    } else if (def.typeName === 'ZodBranded') {
      current = def.type as z.ZodTypeAny;
    } else if (def.typeName === 'ZodLazy') {
      current = def.getter?.() as z.ZodTypeAny;
    } else {
      break;
    }
  }
  if (!description || !description.startsWith('REF:')) return '';
  return extractRefDefName(description.slice(4).split('|')[0]);
}

function isCheckableField(type: z.ZodTypeAny): boolean {
  const definitionName = getRefDefName(type);
  if (definitionName === 'Checkable' || definitionName === 'CheckRule') {
    return true;
  }

  const current = unwrapZodSchema(type);
  const def = current._def as {typeName?: string; type?: z.ZodTypeAny};
  return def.typeName === 'ZodArray' && getRefDefName(def.type as z.ZodTypeAny) === 'CheckRule';
}

function objectShape(type: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined {
  const def = type._def as {
    shape?: (() => Record<string, z.ZodTypeAny>) | Record<string, z.ZodTypeAny>;
  };
  return typeof def.shape === 'function' ? def.shape() : def.shape;
}

function isActionOption(option: z.ZodTypeAny): boolean {
  if (getRefDefName(option) === 'Action') return true;
  const current = unwrapZodSchema(option);
  const def = current._def as {typeName?: string};
  const shape = objectShape(current);
  return def.typeName === 'ZodObject' && Boolean(shape?.event);
}

function isDynamicOption(option: z.ZodTypeAny): boolean {
  const definitionName = getRefDefName(option);
  if (
    definitionName === 'DataBinding' ||
    definitionName === 'FunctionCall' ||
    definitionName.startsWith('Dynamic')
  ) {
    return true;
  }
  const current = unwrapZodSchema(option);
  const def = current._def as {typeName?: string};
  const shape = objectShape(current);
  if (def.typeName !== 'ZodObject' || !shape) return false;
  const hasComponentId = Object.values(shape).some(prop => getRefDefName(prop) === 'ComponentId');
  return (
    (Boolean(shape['@path']) ||
      Boolean(shape.path) ||
      Boolean(shape['@call']) ||
      Boolean(shape.call)) &&
    !hasComponentId
  );
}

function isChildListOption(option: z.ZodTypeAny): boolean {
  if (childRefKindOf(option) === 'child-list' || getRefDefName(option) === 'ChildList') {
    return true;
  }
  const current = unwrapZodSchema(option);
  const def = current._def as {typeName?: string};
  const shape = objectShape(current);
  return (
    def.typeName === 'ZodObject' &&
    Boolean(shape && Object.values(shape).some(prop => getRefDefName(prop) === 'ComponentId'))
  );
}

function isDynamicDef(definitionName: string, typeName?: string): boolean {
  return (
    (definitionName === 'DataBinding' ||
      definitionName === 'FunctionCall' ||
      definitionName.startsWith('Dynamic')) &&
    typeName !== 'ZodObject' &&
    typeName !== 'ZodArray'
  );
}

function matchUnionBehavior(options: readonly z.ZodTypeAny[]): SchemaBehavior | undefined {
  if (options.some(isActionOption)) return {type: 'ACTION'};
  if (options.some(isDynamicOption)) return {type: 'DYNAMIC'};
  if (options.some(isChildListOption)) return {type: 'STRUCTURAL'};
  return undefined;
}

function getFieldBehavior(type: z.ZodTypeAny): SchemaBehavior {
  const definitionName = getRefDefName(type);
  if (isCheckableField(type)) return {type: 'CHECKABLE'};
  if (definitionName === 'Action') return {type: 'ACTION'};

  const current = unwrapZodSchema(type);
  const def = current._def as {
    typeName?: string;
    options?: readonly z.ZodTypeAny[];
    type?: z.ZodTypeAny;
  };
  if (childRefKindOf(current) === 'child-list' || definitionName === 'ChildList') {
    return {type: 'STRUCTURAL'};
  }
  if (isDynamicDef(definitionName, def.typeName)) return {type: 'DYNAMIC'};
  if (def.typeName === 'ZodUnion') return matchUnionBehavior(def.options ?? []) ?? {type: 'STATIC'};
  if (def.typeName === 'ZodArray') {
    return {type: 'ARRAY', element: getFieldBehavior(def.type as z.ZodTypeAny)};
  }
  if (def.typeName === 'ZodObject') {
    return {
      type: 'OBJECT',
      shape: Object.fromEntries(
        Object.entries(objectShape(current) ?? {}).map(([key, value]) => [
          key,
          getFieldBehavior(value),
        ]),
      ),
    };
  }
  return {type: 'STATIC'};
}

/** Returns the runtime behavior tree encoded by a Zod component schema. */
export function getZodSchemaBehavior(schema: unknown): SchemaBehavior {
  if (!(schema instanceof z.ZodType)) {
    return {type: 'OBJECT', shape: {}};
  }
  const cached = behaviorCache.get(schema);
  if (cached) return cached;

  const behavior = getFieldBehavior(schema);
  const result =
    behavior.type === 'OBJECT' && !('accessibility' in behavior.shape)
      ? {
          ...behavior,
          shape: {
            ...behavior.shape,
            accessibility: getFieldBehavior(AccessibilityAttributesSchema),
          },
        }
      : behavior;
  behaviorCache.set(schema, result);
  return result;
}
