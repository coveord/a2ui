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
import {readdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, it} from 'node:test';

import {Ajv2020} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {basicCatalog as v10BasicCatalog} from '../catalogs/basic/v1/catalog.js';
import {getKnownSchemaKeys} from '../resolution/data-context.js';
import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {extractRefFields} from '../resolution/ref-fields.js';
import {basicCatalog as v09BasicCatalog} from '../v0_9/basic_catalog/catalog.js';
import {STRICT_VALIDATION} from '../validation/integrity-checker.js';
import {PayloadValidator} from '../validation/payload-validator.js';
import {normalizeSchema} from './a2ui_schema.js';
import type {CatalogSchemaCompileContext, CatalogSchemaCompiler} from './catalog_definitions.js';
import type {JsonSchemaObject} from './spec_annotations.js';
import {Catalog, type CatalogApi} from './types.js';

/**
 * A compiler that validates with Ajv, recording what it compiles. It knows
 * nothing of A2UI: it compiles the JSON Schema it is given.
 */
function ajvCompiler(): CatalogSchemaCompiler & {
  readonly compiled: Array<{schema: JsonSchemaObject; context: CatalogSchemaCompileContext}>;
} {
  const ajv = new Ajv2020({strict: false, allErrors: true});
  addFormats.default(ajv);
  const compiled: Array<{schema: JsonSchemaObject; context: CatalogSchemaCompileContext}> = [];
  return {
    compiled,
    compile(schema, context) {
      compiled.push({schema, context});
      const validate = ajv.compile(schema);
      return {
        '~standard': {
          version: 1,
          vendor: 'ajv',
          validate: value =>
            validate(value)
              ? {value}
              : {
                  issues: (validate.errors ?? []).map(error => ({
                    message: error.message ?? 'is invalid',
                    path: error.instancePath.split('/').slice(1),
                  })),
                },
        },
      };
    },
  };
}

function repoPath(relativePath: string): string {
  return resolve(process.cwd(), '../../..', relativePath);
}

function readRepoJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(repoPath(relativePath), 'utf-8')) as Record<string, unknown>;
}

/** The parts of a spec test case file these tests read. */
interface SpecCaseFile {
  readonly tests?: ReadonlyArray<{
    readonly description: string;
    readonly valid?: unknown;
    readonly data?: {readonly updateComponents?: {readonly components?: unknown}};
  }>;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Set) return [...item].sort();
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return item;
  });
}

interface SpecCase {
  readonly description: string;
  readonly valid: boolean;
  readonly components: readonly Record<string, unknown>[];
}

/** The spec test cases whose payload is made only of the catalog's components. */
function specCases(casesDir: string, catalog: CatalogApi): SpecCase[] {
  const cases: SpecCase[] = [];
  for (const file of readdirSync(repoPath(casesDir))
    .filter(f => f.endsWith('.json'))
    .sort()) {
    const {tests = []} = readRepoJson(`${casesDir}/${file}`) as SpecCaseFile;
    for (const test of tests) {
      const components = test.data?.updateComponents?.components;
      if (!Array.isArray(components) || typeof test.valid !== 'boolean') continue;
      if (!components.every(c => catalog.components.has(c['component']))) continue;
      cases.push({description: `${file}: ${test.description}`, valid: test.valid, components});
    }
  }
  return cases;
}

function acceptsAll(validator: PayloadValidator, components: SpecCase['components']): boolean {
  try {
    for (const component of components) validator.validateComponent({...component});
    return true;
  } catch {
    return false;
  }
}

const CATALOGS = [
  {
    label: 'v0.9',
    code: v09BasicCatalog,
    document: 'specification/v0_9/catalogs/basic/catalog.json',
    cases: 'specification/v0_9/test/cases',
  },
  {
    label: 'v1.0',
    code: v10BasicCatalog,
    document: 'catalogs/basic/v1/catalog.json',
    cases: 'specification/v1_0/test/cases',
  },
];

for (const {label, code, document, cases} of CATALOGS) {
  const json = readRepoJson(document);
  const compiled = Catalog.fromJson(json, code.protocolVersion, code.id, {
    schemaCompiler: ajvCompiler(),
  });
  const builtIn = Catalog.fromJson(json, code.protocolVersion, code.id);

  describe(`the ${label} basic catalog compiled with Ajv`, () => {
    it('binds and finds child references as the code catalog does', () => {
      assert.strictEqual(canonical(compiled.componentRefMap), canonical(code.componentRefMap));
      for (const [name, component] of code.components) {
        const schema = compiled.components.get(name)!.schema;
        for (const view of [scrapeSchemaBehavior, extractRefFields, getKnownSchemaKeys]) {
          assert.strictEqual(
            canonical(view(schema)),
            canonical(view(component.schema)),
            `${name} ${view.name}`,
          );
        }
      }
    });

    // A case the built-in compiler gets wrong as well is reported as a todo,
    // as in the loader parity tests.
    const validator = new PayloadValidator(compiled, STRICT_VALIDATION);
    const builtInValidator = new PayloadValidator(builtIn, STRICT_VALIDATION);
    for (const specCase of specCases(cases, compiled)) {
      const builtInAgrees = acceptsAll(builtInValidator, specCase.components) === specCase.valid;
      it(
        `${specCase.valid ? 'accepts' : 'rejects'} ${specCase.description}`,
        {todo: builtInAgrees ? false : 'the built-in compiler gets this case wrong too'},
        () => {
          assert.strictEqual(acceptsAll(validator, specCase.components), specCase.valid);
        },
      );
    }
  });
}

describe('Catalog.fromJson with a schema compiler', () => {
  const json = readRepoJson('catalogs/basic/v1/catalog.json');

  it('compiles each entry on first use, with what it compiles for', () => {
    const compiler = ajvCompiler();
    const catalog = Catalog.fromJson(json, undefined, undefined, {schemaCompiler: compiler});
    assert.strictEqual(compiler.compiled.length, 0);

    const text = catalog.components.get('Text')!.schema;
    void catalog.functions.get('formatString')!.schema;
    assert.deepStrictEqual(
      compiler.compiled.map(({context}) => context),
      [
        {kind: 'component', name: 'Text', protocolVersion: '1.0'},
        {kind: 'functionArgs', name: 'formatString', protocolVersion: '1.0'},
      ],
    );
    assert.strictEqual(text['~standard'].vendor, 'ajv');
  });

  it('compiles the theme as it loads the catalog', () => {
    const compiler = ajvCompiler();
    const catalog = Catalog.fromJson(
      {
        catalogId: 'urn:themed',
        components: {},
        theme: {type: 'object', properties: {primaryColor: {type: 'string'}}},
      },
      '0.9',
      undefined,
      {schemaCompiler: compiler},
    );
    assert.deepStrictEqual(
      compiler.compiled.map(({context}) => context),
      [{kind: 'theme', name: 'theme', protocolVersion: '0.9'}],
    );
    const validator = new PayloadValidator(catalog, STRICT_VALIDATION);
    assert.deepStrictEqual(validator.validateTheme({primaryColor: '#000', extra: 1}), {
      primaryColor: '#000',
      extra: 1,
    });
    assert.throws(() => validator.validateTheme({primaryColor: 1}), /primaryColor: must be string/);
  });

  it('hands the compiler a self-contained JSON Schema of the object', () => {
    const compiler = ajvCompiler();
    const catalog = Catalog.fromJson(json, undefined, undefined, {schemaCompiler: compiler});
    const button = catalog.components.get('Button')!.schema;
    const {schema} = compiler.compiled.at(-1)!;

    assert.deepStrictEqual(Object.keys(schema['properties'] as object).sort(), [
      'action',
      'checks',
      'child',
      'variant',
      'weight',
    ]);
    assert.strictEqual(schema['additionalProperties'], false);
    const text = JSON.stringify(schema);
    assert.ok(!text.includes('common_types.json'), 'common types are bundled');
    assert.ok(!text.includes('catalog.json#'), 'catalog references are bundled');
    const defs = schema['$defs'] as Record<string, unknown>;
    assert.ok(defs['CheckRule'] && defs['anyFunction'] && defs['function_formatString']);
    // The compiled schema writes the JSON Schema it was compiled from.
    assert.deepStrictEqual(normalizeSchema(button), schema);
  });

  it('loads Zod schemas without a compiler, as before', () => {
    const text = Catalog.fromJson(json).components.get('Text')!.schema;
    assert.strictEqual(text['~standard'].vendor, 'zod');
  });
});
