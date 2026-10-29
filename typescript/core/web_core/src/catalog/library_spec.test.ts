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
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, it} from 'node:test';

import {z} from 'zod/v4';

import {basicCatalog} from '../catalogs/basic/v1/catalog.js';
import {getKnownSchemaKeys} from '../resolution/data-context.js';
import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {extractRefFields} from '../resolution/ref-fields.js';
import {STRICT_VALIDATION} from '../validation/integrity-checker.js';
import {PayloadValidator} from '../validation/payload-validator.js';
import {a2uiJsonSchemaOf, specAnnotationOf, specJsonSchemaOf} from './a2ui_json_schema.js';
import {componentSchemaOf} from './entry_schema.js';
import {SPEC_KEYWORD, specMeta} from './spec_annotations.js';
import {Catalog, type ComponentApi} from './types.js';

// v1.0 common types written with Zod 4. Each names its definition with a
// `$ref`, which Zod 4 writes into its JSON Schema.
const DataBinding = z
  .object({'@path': z.string().optional(), 'path': z.string().optional()})
  .meta({$ref: '#/$defs/DataBinding'});
const FunctionCall = z
  .looseObject({'@call': z.string().optional(), 'call': z.string().optional()})
  .meta({$ref: '#/$defs/FunctionCall'});
const DynamicString = z
  .union([z.string(), DataBinding, FunctionCall])
  .meta({$ref: '#/$defs/DynamicString'});
const ComponentId = z.string().meta({$ref: '#/$defs/ComponentId'});
const CheckRule = z
  .object({condition: z.union([z.boolean(), DataBinding, FunctionCall]), message: z.string()})
  .meta({$ref: '#/$defs/CheckRule'});
const ChildList = z
  .union([z.array(ComponentId), z.strictObject({componentId: ComponentId, path: z.string()})])
  .meta({$ref: '#/$defs/ChildList'});

const WEIGHT =
  "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.";

// Three v1.0 basic components written by hand with Zod 4, as the generated
// ones are.
const TextApi: ComponentApi = {
  name: 'Text',
  schema: z
    .strictObject({
      text: DynamicString.describe(
        'The text content to display. While simple Markdown formatting is supported (i.e. without HTML, images, or links), utilizing dedicated UI components is generally preferred for a richer and more structured presentation.',
      ),
      variant: z
        .enum(['caption', 'body'])
        .default('body')
        .describe('A hint for the base text style.')
        .optional(),
      weight: z.number().describe(WEIGHT).optional(),
    })
    .meta(specMeta({mixins: []})),
};

const ColumnApi: ComponentApi = {
  name: 'Column',
  schema: z
    .strictObject({
      children: ChildList.describe(
        'Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.',
      ),
      justify: z
        .enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch'])
        .default('start')
        .describe(
          "Defines the arrangement of children along the main axis (vertically). Use 'spaceBetween' to push items to the edges (e.g. header at top, footer at bottom), or 'start'/'end'/'center' to pack them together.",
        )
        .optional(),
      align: z
        .enum(['center', 'end', 'start', 'stretch'])
        .default('stretch')
        .describe(
          "Defines the alignment of children along the cross axis (horizontally). This is similar to the CSS 'align-items' property.",
        )
        .optional(),
      weight: z.number().describe(WEIGHT).optional(),
    })
    .describe(
      'A layout component that arranges its children vertically. To create a grid layout, nest Rows within this Column.',
    )
    .meta(specMeta({mixins: []})),
};

const TextFieldApi: ComponentApi = {
  name: 'TextField',
  schema: z
    .strictObject({
      // Declared here too, as the generated component does; the
      // document writes it through the Checkable mixin instead.
      checks: z
        .array(CheckRule)
        .describe('A list of validation check rules to perform on the component.')
        .optional(),
      label: DynamicString.describe('The text label for the input field.'),
      value: DynamicString.describe('The value of the text field.').optional(),
      placeholder: DynamicString.describe('The placeholder text for the input field.').optional(),
      variant: z
        .enum(['longText', 'number', 'shortText', 'obscured'])
        .default('shortText')
        .describe('The type of input field to display.')
        .optional(),
      weight: z.number().describe(WEIGHT).optional(),
    })
    .meta(specMeta({mixins: ['Checkable']})),
};

const zod4Catalog = new Catalog('urn:zod4-basic', '1.0', [TextApi, ColumnApi, TextFieldApi], [], {
  commonTypesUri: 'common_types.json',
});

const published = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../../catalogs/basic/v1/catalog.json'), 'utf-8'),
) as {components: Record<string, unknown>};

describe('catalog entries annotated with specMeta', () => {
  it('write the definitions of the published catalog', () => {
    const components = zod4Catalog.toJson()['components'] as Record<string, unknown>;
    for (const name of ['Text', 'Column', 'TextField']) {
      assert.deepStrictEqual(components[name], published.components[name], name);
    }
  });

  it('bind and find child references as the generated basic catalog does', () => {
    for (const api of [TextApi, ColumnApi, TextFieldApi]) {
      const written = componentSchemaOf(zod4Catalog, api);
      const generated = componentSchemaOf(basicCatalog, basicCatalog.components.get(api.name)!);
      for (const view of [scrapeSchemaBehavior, extractRefFields, getKnownSchemaKeys]) {
        assert.deepStrictEqual(view(written), view(generated), `${api.name} ${view.name}`);
      }
    }
  });

  it('validate with the document and with the Zod 4 schema', () => {
    const validator = new PayloadValidator(zod4Catalog, STRICT_VALIDATION);
    validator.validateComponent({id: 't', component: 'Text', text: {path: '/greeting'}});
    validator.validateComponent({
      id: 'f',
      component: 'TextField',
      label: 'Name',
      checks: [{condition: true, message: 'Required.'}],
    });
    assert.throws(
      () => validator.validateComponent({id: 't', component: 'Text', text: 'x', size: 1}),
      /Validation failed for component 'Text'/,
    );
  });
});

describe('the JSON Schema of a schema annotated with specMeta', () => {
  const schema = z
    .object({a: z.string()})
    .meta(specMeta({mixins: ['Checkable'], keywords: {minProperties: 1}}));

  it('carries the annotation in its spec view, and writes its keywords', () => {
    const view = specJsonSchemaOf(schema);
    assert.deepStrictEqual(specAnnotationOf(view), {
      mixins: ['Checkable'],
      keywords: {minProperties: 1},
    });
    assert.strictEqual(view['minProperties'], 1);
    assert.ok(!(SPEC_KEYWORD in view));
  });

  it('leaves the annotation out of the JSON Schema view, and writes its keywords', () => {
    const view = a2uiJsonSchemaOf(schema);
    assert.ok(!(SPEC_KEYWORD in view));
    assert.strictEqual(view['minProperties'], 1);
  });
});

describe('the catalog mixins of components annotated with specMeta', () => {
  const Common = z
    .object({weight: z.number().optional()})
    .meta(specMeta({defName: 'CatalogComponentCommon'}));
  const badgeSchema = (mixin: string | typeof Common) =>
    z
      .strictObject({...Common.shape, label: z.string()})
      .meta(specMeta({mixins: ['ComponentCommon', mixin]}));
  const expectedBadge = {
    type: 'object',
    allOf: [
      {$ref: 'common_types.json#/$defs/ComponentCommon'},
      {$ref: '#/$defs/CatalogComponentCommon'},
      {
        type: 'object',
        properties: {component: {const: 'Badge'}, label: {type: 'string'}},
        required: ['component', 'label'],
      },
    ],
    unevaluatedProperties: false,
  };

  it('writes a mixin model the component carries, in any catalog', () => {
    const catalog = new Catalog('badges', '0.9', [{name: 'Badge', schema: badgeSchema(Common)}]);
    const doc = catalog.toJson();
    assert.deepStrictEqual((doc['components'] as Record<string, unknown>)['Badge'], expectedBadge);
    assert.deepStrictEqual((doc['$defs'] as Record<string, unknown>)['CatalogComponentCommon'], {
      type: 'object',
      properties: {weight: {type: 'number'}},
    });
  });

  it('writes a mixin named after one of the catalog models', () => {
    const catalog = new Catalog(
      'badges',
      '0.9',
      [{name: 'Badge', schema: badgeSchema('CatalogComponentCommon')}],
      [],
      {defModels: [Common]},
    );
    const doc = catalog.toJson();
    assert.deepStrictEqual((doc['components'] as Record<string, unknown>)['Badge'], expectedBadge);
    assert.ok('CatalogComponentCommon' in (doc['$defs'] as Record<string, unknown>));
  });

  it('rejects a mixin model without a definition name', () => {
    assert.throws(
      () => specMeta({mixins: [z.object({weight: z.number()})]}),
      /must be named with specMeta\(\{defName\}\)/,
    );
  });
});

describe('the JSON Schema of a Zod 4 schema on a cycle', () => {
  it('writes a schema that names its definition as that reference', () => {
    const Value: z.ZodType = z
      .union([z.string(), z.lazy(() => Call)])
      .meta({$ref: '#/$defs/Value', description: 'A value.'});
    const Call = z
      .object({call: z.string(), args: z.record(z.string(), Value).optional()})
      .meta({$ref: '#/$defs/Call'});
    assert.deepStrictEqual(a2uiJsonSchemaOf(z.object({value: Value}))['properties'], {
      value: {$ref: '#/$defs/Value', description: 'A value.'},
    });
  });
});

describe('an exclusive union written with z.xor', () => {
  const Sized = {
    name: 'Sized',
    schema: z
      .strictObject({size: z.xor([z.enum(['s', 'm']), z.string().max(1)])})
      .meta(specMeta({mixins: ['ComponentCommon']})),
  };
  const catalog = new Catalog('sized', '1.0', [Sized]);

  it('is written as oneOf, even when its branches overlap', () => {
    const sized = (catalog.toJson()['components'] as Record<string, unknown>)['Sized'] as {
      allOf: {properties?: Record<string, unknown>}[];
    };
    assert.deepStrictEqual(sized.allOf[1].properties?.['size'], {
      oneOf: [
        {type: 'string', enum: ['s', 'm']},
        {type: 'string', maxLength: 1},
      ],
    });
  });

  it('rejects a value more than one branch accepts', () => {
    const validator = new PayloadValidator(catalog, STRICT_VALIDATION);
    validator.validateComponent({id: 'a', component: 'Sized', size: 'x'});
    assert.throws(
      () => validator.validateComponent({id: 'b', component: 'Sized', size: 's'}),
      /size: Invalid input: more than one option matched/,
    );
  });
});
