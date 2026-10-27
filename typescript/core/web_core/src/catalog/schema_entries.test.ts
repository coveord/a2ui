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

import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {PayloadValidator} from '../validation/payload-validator.js';
import {componentSchemaOf} from './entry_schema.js';
import {createComponentApi, createFunctionApi} from './schema_entries.js';
import {Catalog, type ComponentApi, type FunctionApi} from './types.js';

const BADGE_SCHEMA = {
  type: 'object',
  description: 'A labelled badge around one child.',
  properties: {
    label: {$ref: 'common_types.json#/$defs/DynamicString'},
    child: {$ref: 'common_types.json#/$defs/ComponentId'},
  },
  required: ['label'],
  additionalProperties: false,
};

function badgeCatalog(): {catalog: Catalog<ComponentApi>; badge: ComponentApi} {
  const badge = createComponentApi({
    name: 'Badge',
    schema: BADGE_SCHEMA,
    protocolVersion: '1.0',
    allowedChildren: ['Text'],
  });
  return {catalog: new Catalog('badge-catalog', '1.0', [badge]), badge};
}

describe('createComponentApi', () => {
  it('writes the schema as the component definition', () => {
    const {catalog} = badgeCatalog();
    const definition = (catalog.toJson()['components'] as any).Badge;
    assert.deepStrictEqual(definition.properties.component, {const: 'Badge'});
    assert.deepStrictEqual(definition.required, ['component', 'label']);
    assert.strictEqual(definition.unevaluatedProperties, false);
    assert.deepStrictEqual(definition.allowedChildren, ['Text']);
    assert.strictEqual(definition.description, 'A labelled badge around one child.');
  });

  it('binds and validates against the schema', () => {
    const {catalog, badge} = badgeCatalog();
    const behavior = scrapeSchemaBehavior(componentSchemaOf(catalog, badge));
    assert.strictEqual(behavior.type === 'OBJECT' && behavior.shape['label'].type, 'DYNAMIC');
    assert.ok(catalog.componentRefMap['Badge'].singleRefs.has('child'));

    const validator = new PayloadValidator(catalog, {allowUnknownElements: false});
    validator.validateComponent({id: 'b', component: 'Badge', label: {path: '/l'}, child: 'c'});
    assert.throws(() => validator.validateComponent({id: 'b', component: 'Badge'}));
    assert.throws(() =>
      validator.validateComponent({id: 'b', component: 'Badge', label: 'x', extra: 1}),
    );
  });

  it('binds an implementation spread from it as it binds the component', () => {
    const {badge} = badgeCatalog();
    const implementation = {...badge, tagName: 'a2ui-badge'};
    const catalog = new Catalog('badge-catalog', '1.0', [implementation]);
    assert.deepStrictEqual(
      scrapeSchemaBehavior(componentSchemaOf(catalog, implementation)),
      scrapeSchemaBehavior(badge.schema),
    );
    assert.ok(catalog.componentRefMap['Badge'].singleRefs.has('child'));
  });
});

describe('createFunctionApi', () => {
  const shout: FunctionApi = createFunctionApi({
    name: 'shout',
    schema: {
      type: 'object',
      properties: {value: {$ref: 'common_types.json#/$defs/DynamicString'}},
      required: ['value'],
      additionalProperties: false,
    },
    protocolVersion: '1.0',
    returnType: 'string',
    description: 'Upper-cases a string.',
  });

  it('reads its metadata from the options', () => {
    assert.strictEqual(shout.name, 'shout');
    assert.strictEqual(shout.returnType, 'string');
    assert.strictEqual(shout.description, 'Upper-cases a string.');
  });

  it('validates arguments against the schema', () => {
    const catalog = new Catalog('fn-catalog', '1.0', [], [shout]);
    const validator = new PayloadValidator(catalog, {allowUnknownElements: false});
    validator.validateFunction('shout', {value: 'hi'});
    assert.throws(() => validator.validateFunction('shout', {}));
    assert.throws(() => validator.validateFunction('shout', {value: 'hi', extra: 1}));
  });
});
