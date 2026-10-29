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

import {basicCatalog as v10BasicCatalog} from '../catalogs/basic/v1/catalog.js';
import {getKnownSchemaKeys} from '../resolution/data-context.js';
import {scrapeSchemaBehavior} from '../resolution/generic-binder.js';
import {extractRefFields} from '../resolution/ref-fields.js';
import {basicCatalog as v09BasicCatalog} from '../v0_9/basic_catalog/catalog.js';
import {STRICT_VALIDATION} from '../validation/integrity-checker.js';
import {PayloadValidator} from '../validation/payload-validator.js';
import {Catalog, type CatalogApi} from './types.js';

function repoPath(relativePath: string): string {
  return resolve(process.cwd(), '../../..', relativePath);
}

function readRepoJson(relativePath: string): any {
  return JSON.parse(readFileSync(repoPath(relativePath), 'utf-8'));
}

/**
 * Returns `value` as JSON with object keys sorted and sets listed in order, so
 * that two values compare equal whatever order they were built in.
 */
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

/**
 * The spec test cases of a protocol version whose payload is an
 * `updateComponents` message made only of the catalog's components.
 */
function specCases(casesDir: string, catalog: CatalogApi): SpecCase[] {
  const cases: SpecCase[] = [];
  for (const file of readdirSync(repoPath(casesDir))
    .filter(f => f.endsWith('.json'))
    .sort()) {
    const {tests = []} = readRepoJson(`${casesDir}/${file}`);
    for (const test of tests) {
      const components = test.data?.updateComponents?.components;
      if (!Array.isArray(components) || typeof test.valid !== 'boolean') continue;
      if (!components.every(c => catalog.components.has(c.component))) continue;
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
  const loaded = Catalog.fromJson(readRepoJson(document), code.protocolVersion, code.id);

  describe(`Catalog.fromJson of the ${label} basic catalog`, () => {
    it('finds the same child references as the code catalog', () => {
      assert.strictEqual(canonical(loaded.componentRefMap), canonical(code.componentRefMap));
    });

    for (const [name, component] of code.components) {
      it(`binds ${name} as the code catalog does`, () => {
        const schema = loaded.components.get(name)!.schema;
        assert.strictEqual(
          canonical(scrapeSchemaBehavior(schema)),
          canonical(scrapeSchemaBehavior(component.schema)),
        );
        assert.strictEqual(
          canonical(extractRefFields(schema)),
          canonical(extractRefFields(component.schema)),
        );
        assert.strictEqual(
          canonical(getKnownSchemaKeys(schema)),
          canonical(getKnownSchemaKeys(component.schema)),
        );
      });
    }

    // A case the code catalog gets wrong as well is a gap of the validator, not
    // of the loader, so it is reported as a todo rather than failing.
    const validator = new PayloadValidator(loaded, STRICT_VALIDATION);
    const codeValidator = new PayloadValidator(code, STRICT_VALIDATION);
    for (const specCase of specCases(cases, loaded)) {
      const codeAgrees = acceptsAll(codeValidator, specCase.components) === specCase.valid;
      it(
        `${specCase.valid ? 'accepts' : 'rejects'} ${specCase.description}`,
        {todo: codeAgrees ? false : 'the code catalog gets this case wrong too'},
        () => {
          assert.strictEqual(acceptsAll(validator, specCase.components), specCase.valid);
        },
      );
    }
  });
}
