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

import * as assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, it} from 'node:test';

import {BasicCatalogThemeSchema} from '@a2ui/web_core/basic_catalog_shared';
import {
  Catalog,
  JsonComponentApi,
  MessageProcessor,
  type ComponentApi,
  type FunctionApi,
} from '@a2ui/web_core/v1_0';
import {z} from 'zod';

import {basicCatalog} from './catalog.js';
import {A2uiText, BASIC_COMPONENTS} from './components/index.js';
import {BASIC_FUNCTIONS} from './functions/basic_functions.js';

const PUBLISHED_PATH = 'catalogs/basic/v1/catalog.json';

function readRepoJson(relativePath: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), '../../..', relativePath), 'utf-8'));
}

/**
 * Returns a copy of an entry whose schema carries no specification
 * annotation, so that the catalog generates its definition from Zod.
 */
function plain<E extends ComponentApi | FunctionApi>(entry: E): E {
  return {...entry, schema: entry.schema.describe(entry.schema.description as string)};
}

function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
  } else if (node && typeof node === 'object') {
    const ref = (node as Record<string, unknown>).$ref;
    if (typeof ref === 'string') refs.push(ref);
    for (const value of Object.values(node)) collectRefs(value, refs);
  }
  return refs;
}

describe('v1 basic catalog document', () => {
  it('returns the published document', () => {
    assert.deepStrictEqual(basicCatalog.toJson(), readRepoJson(PUBLISHED_PATH));
  });

  it('computes the definitions of its models in another code-defined catalog', () => {
    const published = readRepoJson(PUBLISHED_PATH);
    const out = new Catalog(
      'https://example.com/reused',
      '1.0',
      [...basicCatalog.components.values()],
      [...basicCatalog.functions.values()],
    ).toJson();
    assert.deepStrictEqual(out.components, published.components);
    assert.deepStrictEqual(out.functions, published.functions);
    assert.deepStrictEqual(out.$defs, published.$defs);
  });

  it('serializes unannotated copies of its entries unbundled, with both unions', () => {
    const codeDefined = new Catalog(
      basicCatalog.id,
      '1.0',
      [...basicCatalog.components.values()].map(plain),
      [...basicCatalog.functions.values()].map(plain),
    );
    const out = codeDefined.toJson();
    assert.strictEqual(out.catalogId, basicCatalog.id);
    assert.strictEqual(out.protocolVersion, '1.0');
    assert.strictEqual(out.theme, undefined);
    assert.deepStrictEqual(Object.keys(out.$defs as object).sort(), [
      'anyComponent',
      'anyFunction',
    ]);
    const functions = out.functions as Record<string, any>;
    assert.ok(!('@index' in functions), 'system functions are not part of the document');
    assert.deepStrictEqual(functions.formatNumber.properties['@call'], {const: 'formatNumber'});
    assert.strictEqual(functions.formatNumber.returnType, 'string');
    for (const ref of collectRefs(out)) {
      assert.ok(
        ref.startsWith('common_types.json#/$defs/') ||
          ref.startsWith('#/components/') ||
          ref.startsWith('#/functions/'),
        `unexpected reference '${ref}'`,
      );
    }
    const text = (out.components as Record<string, any>).Text;
    assert.deepStrictEqual(text.properties.component, {const: 'Text'});
    assert.ok(text.required.includes('component'));
    assert.ok(!('id' in text.properties));
  });

  it('keeps no JSON definition on its entries, which are generated models', () => {
    const entry = basicCatalog.components.get('Text')!;
    assert.ok(!(entry instanceof JsonComponentApi));
    assert.ok(!('definition' in entry) && !('jsonSchema' in entry));
    assert.strictEqual(entry.schema, A2uiText.schema);
    assert.strictEqual(entry.tagName, A2uiText.tagName);
  });
});

describe('v1 basic entries in an inline catalog', () => {
  it('are sent as the catalog toJson() document', () => {
    const cat = new Catalog('https://example.com/cat', '1.0', BASIC_COMPONENTS, BASIC_FUNCTIONS, {
      themeSchema: BasicCatalogThemeSchema,
    });
    const proc = new MessageProcessor([cat]);
    const caps = proc.getRendererCapabilities({versions: ['v1.0'], includeInlineCatalogs: true});
    const inlineCat = (caps['v1.0'] as any).inlineCatalogs?.[0] as Record<string, any>;

    assert.deepStrictEqual(Object.keys(inlineCat.$defs).sort(), ['anyComponent', 'anyFunction']);
    assert.strictEqual(inlineCat.protocolVersion, '1.0');
    assert.strictEqual(inlineCat.theme, undefined);
    assert.strictEqual(
      inlineCat.components.Text.properties.text.$ref,
      'common_types.json#/$defs/DynamicString',
    );
    assert.deepStrictEqual(inlineCat, cat.toJson());
  });
});

describe('v1 basic entries in a composite catalog', () => {
  const Custom: ComponentApi = {name: 'Custom', schema: z.object({label: z.string()}).strict()};

  for (const withUri of [false, true]) {
    it(`resolves every reference${withUri ? ' given their common types URI' : ''}`, () => {
      const composite = new Catalog(
        'https://example.com/composite',
        '1.0',
        [...basicCatalog.components.values(), Custom],
        [...basicCatalog.functions.values()],
        withUri ? {commonTypesUri: basicCatalog.commonTypesUri} : undefined,
      );
      const doc = composite.toJson();
      for (const ref of collectRefs(doc)) {
        if (!ref.startsWith('#/')) continue;
        const target = ref
          .slice(2)
          .split('/')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], doc);
        assert.ok(target !== undefined, `reference '${ref}' resolves in toJson`);
      }
      // The models compute their definitions in any v1.0 catalog.
      const published = basicCatalog.toJson();
      assert.deepStrictEqual(
        (doc.components as Record<string, unknown>).Text,
        (published.components as Record<string, unknown>).Text,
      );

      const validationText = (composite.validationSchema.components as Record<string, any>).Text;
      assert.ok('weight' in validationText.properties, 'validationSchema keeps weight');
      assert.deepStrictEqual(
        validationText,
        (basicCatalog.validationSchema.components as Record<string, unknown>).Text,
      );

      const reloaded = Catalog.fromJson(doc, '1.0');
      const shape = (reloaded.components.get('Text')!.schema as z.AnyZodObject).shape;
      assert.ok('weight' in shape, 'fromJson(toJson()) keeps weight');
      assert.ok(reloaded.components.get('Text')!.schema.safeParse({text: 'hi', weight: 1}).success);
    });
  }
});

describe('v1 basic catalog Zod schemas', () => {
  type Summary = Record<string, unknown>;

  /** The names, properties, required lists and function metadata of a validation schema. */
  function summarize(schema: Record<string, unknown>): {
    components: Record<string, Summary>;
    functions: Record<string, Summary>;
  } {
    const components: Record<string, Summary> = {};
    for (const [name, comp] of Object.entries((schema.components ?? {}) as Record<string, any>)) {
      components[name] = {
        properties: Object.keys(comp.properties ?? {}).sort(),
        required: [...(comp.required ?? [])].sort(),
      };
    }
    const functions: Record<string, Summary> = {};
    for (const [name, fn] of Object.entries((schema.functions ?? {}) as Record<string, any>)) {
      const args = fn.properties?.args ?? {};
      functions[name] = {
        returnType: fn.returnType ?? fn.properties?.returnType?.const,
        allowedCallers: fn.allowedCallers,
        requiresUserActivation: fn.requiresUserActivation,
        args: Object.keys(args.properties ?? {}).sort(),
        argsRequired: [...(args.required ?? [])].sort(),
      };
    }
    return {components, functions};
  }

  it('keeps the Zod schemas in line with the published document', () => {
    // Copies of the entries without their annotations are generated from Zod.
    const fromZod = new Catalog(
      basicCatalog.id,
      basicCatalog.protocolVersion,
      [...basicCatalog.components.values()].map(plain),
      [...basicCatalog.functions.values()].map(plain),
      {themeSchema: basicCatalog.themeSchema},
    );
    const published = summarize(basicCatalog.validationSchema);
    const zod = summarize(fromZod.validationSchema);
    assert.deepStrictEqual(
      Object.keys(zod.components).sort(),
      Object.keys(published.components).sort(),
    );
    assert.deepStrictEqual(
      Object.keys(zod.functions).sort(),
      Object.keys(published.functions).sort(),
    );
    for (const section of ['components', 'functions'] as const) {
      for (const [name, expected] of Object.entries(published[section])) {
        assert.deepStrictEqual(zod[section][name], expected, `${section} ${name}`);
      }
    }
  });
});
