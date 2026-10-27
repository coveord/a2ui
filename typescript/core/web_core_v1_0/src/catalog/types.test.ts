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
import {describe, it} from 'node:test';

import {A2uiCatalogError, A2uiExpressionError} from '../errors.js';
import {MessageProcessor} from '../processing/message-processor.js';
import {objectSchema, testSchemaAdapter} from '../test/test_schemas.js';
import {Catalog, ComponentApi, createFunctionImplementation, linkCatalogs} from './types.js';

describe('Catalog Types', () => {
  it('creates a catalog with functions', () => {
    const mockComponent = {
      name: 'MockComp',
      schema: objectSchema(),
    } satisfies ComponentApi;

    const mockFunc = createFunctionImplementation(
      {
        name: 'mockFunc',
        returnType: 'string',
        schema: objectSchema(),
      },
      () => 'result',
    );

    const catalog = new Catalog('test-cat', '1.0', [mockComponent], [mockFunc]);

    assert.strictEqual(catalog.id, 'test-cat');
    assert.strictEqual(catalog.components.size, 1);
    assert.strictEqual(catalog.components.get('MockComp'), mockComponent);

    assert.ok(catalog.functions);
    assert.strictEqual(catalog.functions.size, 1);
    assert.strictEqual(catalog.functions.get('mockFunc'), mockFunc);
  });

  it('throws A2uiExpressionError when function is not found', () => {
    const catalog = new Catalog('test-cat', '1.0', []);
    const ctx = {} as any;

    assert.throws(
      () => catalog.invoker('nonExistent', {}, ctx),
      (err: any) => {
        return (
          err instanceof A2uiExpressionError &&
          err.message.includes('Function not found') &&
          err.expression === 'nonExistent'
        );
      },
    );
  });

  it('throws A2uiExpressionError when argument validation fails', () => {
    const mockFunc = createFunctionImplementation(
      {
        name: 'test',
        returnType: 'string',
        schema: objectSchema(['requiredField']),
      },
      () => 'result',
    );
    const catalog = new Catalog('test-cat', '1.0', [], [mockFunc]);
    const ctx = {} as any;

    assert.throws(
      () => catalog.invoker('test', {}, ctx),
      (err: any) => {
        return (
          err instanceof A2uiExpressionError &&
          err.message.includes('Validation failed') &&
          err.expression === 'test' &&
          Array.isArray(err.details)
        );
      },
    );
  });
});

describe('Catalog schema adapter', () => {
  it('fails schema operations clearly when the catalog has no adapter', () => {
    const catalog = new Catalog('no-adapter', '1.0');

    assert.throws(
      () => catalog.toJson(),
      (err: unknown) =>
        err instanceof A2uiCatalogError &&
        err.message.includes("Catalog 'no-adapter'") &&
        err.message.includes("'serializeCatalog'") &&
        err.message.includes('CatalogOptions.schemaAdapter'),
    );
  });

  it('fails clearly when the adapter lacks the operation', () => {
    const catalog = new Catalog('partial', '1.0', [], [], {schemaAdapter: testSchemaAdapter()});

    assert.throws(() => catalog.validationSchema, /'generateValidationSchema'/);
  });

  it("uses the catalog's own adapter", () => {
    const document = {catalogId: 'own'};
    const catalog = new Catalog('own', '1.0', [], [], {
      schemaAdapter: testSchemaAdapter({serializeCatalog: () => document}),
    });

    assert.deepStrictEqual(catalog.toJson(), document);
  });

  it('returns the published document it carries, without an adapter', () => {
    const document = {catalogId: 'published', components: {}};
    const catalog = new Catalog('published', '1.0', [], [], {document});

    assert.deepStrictEqual(catalog.toJson(), document);
    assert.notStrictEqual(catalog.toJson(), document);
  });

  it('drops the published document on catalogs derived with withEntries', () => {
    const catalog = new Catalog('published', '1.0', [], [], {
      document: {catalogId: 'published'},
      schemaAdapter: testSchemaAdapter({retainedDefs: defs => defs}),
    });

    assert.throws(() => catalog.withEntries([], []).toJson(), /'serializeCatalog'/);
  });

  it('keeps the adapter on catalogs derived with withEntries', () => {
    const schemaAdapter = testSchemaAdapter({retainedDefs: defs => defs});
    const catalog = new Catalog('derived', '1.0', [], [], {schemaAdapter});

    assert.strictEqual(catalog.withEntries([], []).schemaAdapter, schemaAdapter);
  });

  it('parses documents with the adapter passed to fromJson', () => {
    const parsed = new Catalog('parsed', '1.0');
    const schemaAdapter = testSchemaAdapter({
      parseCatalog: ({catalogId}) => {
        assert.strictEqual(catalogId, 'override');
        return parsed;
      },
    });

    assert.strictEqual(Catalog.fromJson({}, {schemaAdapter, catalogId: 'override'}), parsed);
    assert.throws(
      () => Catalog.fromJson({}, {schemaAdapter: testSchemaAdapter()}),
      /cannot parse catalog documents/,
    );
  });

  it('refuses to link catalogs that use different adapters', () => {
    const a = new Catalog('a', '1.0', [], [], {schemaAdapter: testSchemaAdapter()});
    const b = new Catalog('b', '1.0', [], [], {schemaAdapter: testSchemaAdapter()});

    assert.throws(
      () => linkCatalogs([a, b]),
      (err: unknown) =>
        err instanceof A2uiCatalogError && err.message.includes('must share one schema adapter'),
    );
  });
});

describe('MessageProcessor protocol schema adapter', () => {
  const message = {version: 'v1.0', deleteSurface: {surfaceId: 'missing'}};

  it('fails clearly when neither the options nor the catalogs supply an adapter', () => {
    const processor = new MessageProcessor([new Catalog('plain', '1.0')]);

    assert.throws(
      () => processor.processMessages([message]),
      (err: unknown) =>
        err instanceof A2uiCatalogError &&
        err.message.includes('MessageProcessorOptions.schemaAdapter'),
    );
  });

  it('validates messages with the adapter in its options', () => {
    const versions: string[] = [];
    const schemaAdapter = testSchemaAdapter({
      getProtocolSchema: version => {
        versions.push(version);
        return objectSchema();
      },
    });
    const processor = new MessageProcessor([], undefined, {schemaAdapter});

    processor.processMessages([message]);

    assert.deepStrictEqual(versions, ['v1.0']);
  });

  it("falls back to the catalogs' adapter", () => {
    let calls = 0;
    const schemaAdapter = testSchemaAdapter({
      getProtocolSchema: () => {
        calls++;
        return objectSchema();
      },
    });
    const processor = new MessageProcessor([new Catalog('own', '1.0', [], [], {schemaAdapter})]);

    processor.processMessages([message]);

    assert.strictEqual(calls, 1);
  });
});
