/*
 * Copyright 2026 Google LLC
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

import * as assert from 'node:assert';
import {describe, it} from 'node:test';

import {z} from 'zod/v3';
import {z as z4} from 'zod/v4';

import {A2uiCatalogError, A2uiValidationError} from '../errors.js';
import {MessageProcessor} from '../processing/message-processor.js';
import {getKnownSchemaKeys} from '../resolution/data-context.js';
import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {extractRefFields} from '../resolution/ref-fields.js';
import {
  AccessibilityAttributesSchema,
  ChildListSchema,
  ComponentIdSchema,
} from '../types/common-types.js';
import {basicCatalog as v09BasicCatalog} from '../v0_9/basic_catalog/catalog.js';
import {a2uiJsonSchemaOf} from './a2ui_json_schema.js';
import type {A2uiSchema, StandardJSONSchemaV1} from './a2ui_schema.js';
import {exclusiveUnion} from './exclusive_union.js';
import {basicCatalog} from '../catalogs/basic/v1/index.js';
import {Catalog, type ComponentApi, type FunctionApi} from './types.js';

/**
 * Adds Standard JSON Schema to a Zod 4 schema, as Zod 4.2 and later implement
 * it natively.
 */
function withZod4JsonSchema<T extends z4.ZodType>(schema: T): T & StandardJSONSchemaV1 {
  const converter = () => z4.toJSONSchema(schema, {target: 'draft-2020-12'});
  Object.assign(schema['~standard'], {jsonSchema: {input: converter, output: converter}});
  return schema as T & StandardJSONSchemaV1;
}

const ref = (name: string) => ({$ref: `common_types.json#/$defs/${name}`});

function plain<E extends ComponentApi | FunctionApi>(entry: E): E {
  const schema = entry.schema as z.ZodTypeAny;
  return {...entry, schema: schema.describe(schema.description as string)};
}

/** A Zod 4 component using the A2UI `$ref` conventions. */
const Zod4CardApi = {
  name: 'Card',
  schema: withZod4JsonSchema(
    z4
      .object({
        title: z4.union([z4.string(), z4.object({path: z4.string()})]).meta(ref('DynamicString')),
        child: z4.string().meta(ref('ComponentId')),
        children: z4.array(z4.string()).meta(ref('ChildList')),
        action: z4.object({event: z4.object({name: z4.string()})}).meta(ref('Action')),
        tabs: z4.array(
          z4.object({label: z4.string(), content: z4.string().meta(ref('ComponentId'))}),
        ),
        elevated: z4.boolean().optional(),
      })
      .strict(),
  ),
} satisfies ComponentApi;

describe('a2uiJsonSchemaOf', () => {
  it('writes the REF: markers of a Zod 3 schema as $refs', () => {
    const schema = z.object({
      label: z.string().describe('REF:common_types.json#/$defs/DynamicString|The label.'),
      size: z.number().describe('REF:#/$defs/Size').default(1).optional(),
    });
    assert.deepStrictEqual(a2uiJsonSchemaOf(schema), {
      type: 'object',
      properties: {
        label: {$ref: 'common_types.json#/$defs/DynamicString', description: 'The label.'},
        size: {$ref: '#/$defs/Size', default: 1},
      },
      required: ['label'],
      additionalProperties: false,
    });
  });

  it('writes Zod 3 child references as $refs, even when described anew', () => {
    const view = a2uiJsonSchemaOf(
      z.object({one: ComponentIdSchema.describe('The child.'), many: ChildListSchema}),
    );
    assert.deepStrictEqual((view['properties'] as Record<string, unknown>)['one'], {
      $ref: 'common_types.json#/$defs/ComponentId',
      description: 'The child.',
    });
    assert.strictEqual(
      ((view['properties'] as Record<string, Record<string, unknown>>)['many'] ?? {})['$ref'],
      'common_types.json#/$defs/ChildList',
    );
  });

  it('writes common-type references without converted constraints', () => {
    assert.deepStrictEqual(a2uiJsonSchemaOf(AccessibilityAttributesSchema), {
      $ref: 'common_types.json#/$defs/AccessibilityAttributes',
      description:
        'Attributes to enhance accessibility when using assistive technologies like screen readers or model understanding.',
    });
  });

  it('expands a reference only when requested for inspection', () => {
    const view = a2uiJsonSchemaOf(AccessibilityAttributesSchema, {expandReferences: true});
    assert.strictEqual(view['type'], 'object');
    assert.ok(view['properties']);
  });

  it('writes unannotated v0.9 Divider accessibility as a bare local reference', () => {
    const plainCatalog = new Catalog(
      'urn:plain-v09',
      v09BasicCatalog.protocolVersion,
      [...v09BasicCatalog.components.values()].map(plain),
      [...v09BasicCatalog.functions.values()].map(plain),
      {themeSchema: v09BasicCatalog.themeSchema},
    );
    const components = plainCatalog.validationSchema['components'] as Record<string, unknown>;
    const divider = components['Divider'] as Record<string, unknown>;
    const properties = divider['properties'] as Record<string, unknown>;
    assert.deepStrictEqual(properties['accessibility'], {
      $ref: '#/$defs/AccessibilityAttributes',
      description:
        'Attributes to enhance accessibility when using assistive technologies like screen readers.',
    });
  });

  it('matches every unannotated basic component accessibility schema after a document reload', () => {
    for (const builtin of [v09BasicCatalog, basicCatalog]) {
      const plainCatalog = new Catalog(
        `urn:plain-${builtin.protocolVersion}`,
        builtin.protocolVersion,
        [...builtin.components.values()].map(plain),
        [...builtin.functions.values()].map(plain),
        {themeSchema: builtin.themeSchema},
      );
      const reloaded = Catalog.fromJson(
        plainCatalog.toJson(),
        builtin.protocolVersion,
        plainCatalog.id,
      );
      const codeComponents = plainCatalog.validationSchema['components'] as Record<string, unknown>;
      const reloadedComponents = reloaded.validationSchema['components'] as Record<string, unknown>;
      for (const [name, schema] of Object.entries(codeComponents)) {
        const codeProperties = (schema as Record<string, unknown>)['properties'] as Record<
          string,
          unknown
        >;
        const reloadedProperties = (reloadedComponents[name] as Record<string, unknown>)[
          'properties'
        ] as Record<string, unknown>;
        assert.deepStrictEqual(
          codeProperties['accessibility'],
          reloadedProperties['accessibility'],
          `${builtin.protocolVersion} ${name}`,
        );
      }
    }
  });

  it('writes a Zod 3 exclusive union as oneOf', () => {
    const view = a2uiJsonSchemaOf(exclusiveUnion([z.string(), z.number()]));
    assert.deepStrictEqual(view, {oneOf: [{type: 'string'}, {type: 'number'}]});
  });

  it('converts a schema with its Standard JSON Schema converter', () => {
    const view = a2uiJsonSchemaOf(Zod4CardApi.schema);
    assert.strictEqual(view['$schema'], undefined);
    assert.deepStrictEqual(
      (view['properties'] as Record<string, Record<string, unknown>>)['child'],
      {type: 'string', $ref: 'common_types.json#/$defs/ComponentId'},
    );
    assert.ok(Object.isFrozen(view));
  });

  it('rejects a schema without any JSON Schema conversion', () => {
    const schema: A2uiSchema = {
      '~standard': {version: 1, vendor: 'test', validate: value => ({value})},
    };
    assert.throws(() => a2uiJsonSchemaOf(schema), A2uiCatalogError);
  });
});

describe('Zod 4 component schemas', () => {
  it('bind their properties', () => {
    const behavior = scrapeSchemaBehavior(Zod4CardApi.schema);
    assert.strictEqual(behavior.type, 'OBJECT');
    const {accessibility, ...shape} = behavior.type === 'OBJECT' ? behavior.shape : {};
    assert.strictEqual(accessibility?.type, 'OBJECT');
    assert.deepStrictEqual(shape, {
      title: {type: 'DYNAMIC'},
      child: {type: 'STATIC'},
      children: {type: 'STRUCTURAL'},
      action: {type: 'ACTION'},
      tabs: {
        type: 'ARRAY',
        element: {type: 'OBJECT', shape: {label: {type: 'STATIC'}, content: {type: 'STATIC'}}},
      },
      elevated: {type: 'STATIC'},
    });
  });

  it('declare their child references', () => {
    assert.deepStrictEqual(
      [...extractRefFields(Zod4CardApi.schema)],
      [
        ['child', {kind: 'single'}],
        ['children', {kind: 'list'}],
        ['tabs', {kind: 'nested', keys: new Set(['content'])}],
      ],
    );
    const refs = new Catalog('test-cat', '1.0', [Zod4CardApi]).componentRefMap['Card'];
    assert.deepStrictEqual([...(refs?.singleRefs ?? [])], ['child']);
    assert.deepStrictEqual([...(refs?.listRefs ?? [])].sort(), ['children', 'tabs']);
  });

  it('declare their keys', () => {
    assert.deepStrictEqual(
      [...(getKnownSchemaKeys(Zod4CardApi.schema) ?? [])],
      ['title', 'child', 'children', 'action', 'tabs', 'elevated'],
    );
  });

  it('serialize into the catalog document', () => {
    const doc = new Catalog('test-cat', '1.0', [Zod4CardApi], [], {
      commonTypesUri: 'https://a2ui.org/specification/v1_0/common_types.json',
    }).toJson();
    const card = (doc['components'] as Record<string, Record<string, unknown>>)['Card'];
    const properties = card?.['properties'] as Record<string, unknown>;
    assert.deepStrictEqual(properties['child'], {
      $ref: 'https://a2ui.org/specification/v1_0/common_types.json#/$defs/ComponentId',
    });
    assert.deepStrictEqual(properties['elevated'], {type: 'boolean'});
  });

  it('validate the components a message processor receives', () => {
    const proc = new MessageProcessor([new Catalog('zod4-cat', '0.9', [Zod4CardApi])]);
    proc.processMessages([
      {version: 'v0.9', createSurface: {surfaceId: 's1', catalogId: 'zod4-cat'}},
    ]);
    const card = {
      id: 'root',
      component: 'Card',
      title: {path: '/title'},
      child: 'body',
      children: [],
      action: {event: {name: 'open'}},
      tabs: [],
    };
    proc.processMessages([
      {version: 'v0.9', updateComponents: {surfaceId: 's1', components: [card as never]}},
    ]);
    assert.ok(proc.model.getSurface('s1')?.componentsModel.get('root'));
    assert.throws(
      () =>
        proc.processMessages([
          {
            version: 'v0.9',
            updateComponents: {
              surfaceId: 's1',
              components: [{...card, id: 'other', elevated: 'yes'} as never],
            },
          },
        ]),
      A2uiValidationError,
    );
  });
});

describe('Basic catalog component schemas', () => {
  it('declare their child references, including the v1.0 `Child` alias of `ComponentId`', () => {
    const refFields = Object.fromEntries(
      [...basicCatalog.components]
        .map(([name, api]) => [
          name,
          [...extractRefFields(api.schema)].map(([key, ref]) =>
            ref.kind === 'nested' ? [key, ref.kind, [...ref.keys]] : [key, ref.kind],
          ),
        ])
        .filter(([, fields]) => fields.length > 0),
    );
    assert.deepStrictEqual(refFields, {
      Row: [['children', 'list']],
      Column: [['children', 'list']],
      List: [['children', 'list']],
      Card: [['child', 'single']],
      Tabs: [['tabs', 'nested', ['child']]],
      Modal: [
        ['trigger', 'single'],
        ['content', 'single'],
      ],
      Button: [['child', 'single']],
    });
  });
});
