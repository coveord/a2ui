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

import {basicCatalog} from '../catalogs/basic/v1/index.js';
import {A2uiCatalogError} from '../errors.js';
import {basicCatalog as v09BasicCatalog} from '../v0_9/basic_catalog/catalog.js';
import {
  hasCrossDocumentRefs,
  inlineResolvedDefinition,
  inlineSchemaReferences,
  PeerScope,
  resolveDefinition,
  resolveJsonPointer,
  resolvePeerTarget,
} from './catalog_references.js';
import {inlinePeerAndLocalRefs} from './schema_loader.js';

describe('catalog references', () => {
  it('detects references into peer catalogs but not standard common types', () => {
    assert.strictEqual(
      hasCrossDocumentRefs({$ref: 'https://example.com/catalog.json#/$defs/Shared'}),
      true,
    );
    assert.strictEqual(
      hasCrossDocumentRefs({$ref: 'common_types.json#/$defs/DynamicString'}),
      false,
    );
    assert.strictEqual(hasCrossDocumentRefs({$ref: 'catalog.json#/$defs/Local'}), false);
  });

  it('resolves escaped JSON Pointer segments', () => {
    const document = {$defs: {'a/b': {'~key': {type: 'string'}}}};
    assert.deepStrictEqual(resolveJsonPointer(document, '#/$defs/a~1b/~0key'), {type: 'string'});
    assert.strictEqual(resolveJsonPointer(document, '#/$defs/missing'), undefined);
  });

  it('strips a referenced peer component envelope and preserves allOf precedence', () => {
    const peer = {
      catalogId: 'peer.json',
      components: {
        Field: {
          allOf: [
            {properties: {shared: {type: 'string'}}, required: ['shared']},
            {
              properties: {
                component: {const: 'Field'},
                id: {type: 'string'},
                value: {type: 'string'},
              },
              required: ['component', 'id', 'value'],
              additionalProperties: false,
            },
          ],
        },
      },
    };
    const target = new PeerScope([peer]).resolve('peer.json#/components/Field', {
      catalogId: 'local',
    });
    assert.deepStrictEqual(resolvePeerTarget(target!), {
      doc: peer,
      target: {
        allOf: [
          {properties: {value: {type: 'string'}}, required: ['value']},
          {properties: {shared: {type: 'string'}}, required: ['shared']},
        ],
      },
    });
  });

  it('inlines peer-local references and leaves recursive local references finite', () => {
    const peer = {
      catalogId: 'peer.json',
      $defs: {
        Outer: {type: 'object', properties: {value: {$ref: '#/$defs/Inner'}}},
        Inner: {type: 'string'},
      },
    };
    assert.deepStrictEqual(
      inlineSchemaReferences({$ref: 'peer.json#/$defs/Outer'}, {catalogId: 'local'}, [peer]),
      {type: 'object', properties: {value: {type: 'string'}}},
    );

    const recursive = {$defs: {Node: {type: 'object', properties: {next: {$ref: '#/$defs/Node'}}}}};
    assert.deepStrictEqual(inlineSchemaReferences({$ref: '#/$defs/Node'}, recursive), {
      type: 'object',
      properties: {next: {$ref: '#/$defs/Node'}},
    });
  });

  it('keeps peer-local definitions separate from root-local definitions', () => {
    const peer = {
      catalogId: 'peer.json',
      $defs: {
        Outer: {type: 'object', properties: {value: {$ref: '#/$defs/Inner'}}},
        Inner: {type: 'string'},
      },
    };
    const root = {catalogId: 'local', $defs: {Inner: {type: 'number'}}};
    const schema = {
      properties: {
        mine: {$ref: '#/$defs/Inner'},
        theirs: {$ref: 'peer.json#/$defs/Outer'},
      },
    };

    const resolved = resolveDefinition(schema, root, [peer]);
    assert.deepStrictEqual(inlineResolvedDefinition(resolved), {
      properties: {
        mine: {type: 'number'},
        theirs: {type: 'object', properties: {value: {type: 'string'}}},
      },
    });
    assert.deepStrictEqual(
      inlinePeerAndLocalRefs({$ref: 'peer.json#/$defs/Outer'}, root, [peer], {
        inlineLocalDefs: false,
      }),
      {type: 'object', properties: {value: {type: 'string'}}},
    );
  });

  it('resolves and inlines every basic catalog entry as the loader did', () => {
    // The basic catalogs reference only their own `$defs` and the common
    // types, with no sibling keywords beside a local `$ref`, so inlining one
    // replaces each local `$ref` by its definition.
    const inlineBareLocalRefs = (node: unknown, defs: Record<string, unknown>): unknown => {
      if (Array.isArray(node)) return node.map(item => inlineBareLocalRefs(item, defs));
      if (!node || typeof node !== 'object') return node;
      const object = node as Record<string, unknown>;
      const ref = object['$ref'];
      if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
        assert.deepStrictEqual(Object.keys(object), ['$ref'], ref);
        return inlineBareLocalRefs(defs[ref.slice('#/$defs/'.length)], defs);
      }
      return Object.fromEntries(
        Object.entries(object).map(([key, value]) => [key, inlineBareLocalRefs(value, defs)]),
      );
    };

    for (const catalog of [v09BasicCatalog, basicCatalog]) {
      const document = catalog.toJson() as Record<string, unknown>;
      const localDefs = document['$defs'] as Record<string, unknown>;
      for (const section of ['components', 'functions']) {
        const entries = document[section] as Record<string, Record<string, unknown>>;
        for (const [name, definition] of Object.entries(entries)) {
          const label = `${catalog.protocolVersion} ${section}/${name}`;
          const resolved = resolveDefinition(definition, document);
          assert.deepStrictEqual(resolved.schema, definition, label);
          for (const [defName, def] of Object.entries(resolved.defs)) {
            assert.deepStrictEqual(def, localDefs[defName], `${label} $defs/${defName}`);
          }
          assert.deepStrictEqual(
            inlineResolvedDefinition(resolved, {keepLocalDefinition: () => true}),
            definition,
            label,
          );
          assert.deepStrictEqual(
            inlineResolvedDefinition(resolved),
            inlineBareLocalRefs(definition, localDefs),
            label,
          );
        }
      }
    }
  });

  it('keeps same-named definitions of two peers separate', () => {
    const first = {catalogId: 'first.json', $defs: {Inner: {type: 'string'}}};
    const second = {catalogId: 'second.json', $defs: {Inner: {type: 'boolean'}}};
    const schema = {
      properties: {
        a: {$ref: 'first.json#/$defs/Inner'},
        b: {$ref: 'second.json#/$defs/Inner'},
      },
    };

    const resolved = resolveDefinition(schema, {catalogId: 'local'}, [first, second]);
    assert.deepStrictEqual(resolved.schema, {
      properties: {
        a: {$ref: '#/$defs/peer_0_Inner'},
        b: {$ref: '#/$defs/peer_1_Inner'},
      },
    });
    assert.deepStrictEqual(inlineResolvedDefinition(resolved), {
      properties: {a: {type: 'string'}, b: {type: 'boolean'}},
    });
  });

  it('bundles a peer definition that references a second peer', () => {
    const first = {
      catalogId: 'first.json',
      $defs: {Outer: {type: 'object', properties: {value: {$ref: 'second.json#/$defs/Leaf'}}}},
    };
    const second = {catalogId: 'second.json', $defs: {Leaf: {type: 'integer'}}};

    const resolved = resolveDefinition({$ref: 'first.json#/$defs/Outer'}, {catalogId: 'local'}, [
      first,
      second,
    ]);
    assert.deepStrictEqual(resolved.defs, {
      peer_0_Outer: {type: 'object', properties: {value: {$ref: '#/$defs/peer_1_Leaf'}}},
      peer_1_Leaf: {type: 'integer'},
    });
    assert.deepStrictEqual(inlineResolvedDefinition(resolved), {
      type: 'object',
      properties: {value: {type: 'integer'}},
    });
  });

  it('names a bundled root component without reusing a root definition name', () => {
    const root = {
      catalogId: 'local',
      $defs: {component_Base: {type: 'string'}},
      components: {
        Base: {
          properties: {component: {const: 'Base'}, label: {type: 'string'}},
          required: ['component', 'label'],
        },
      },
    };

    const resolved = resolveDefinition({$ref: '#/components/Base'}, root);
    assert.deepStrictEqual(resolved.schema, {$ref: '#/$defs/component_Base_2'});
    assert.deepStrictEqual(resolved.defs, {
      component_Base_2: {properties: {label: {type: 'string'}}, required: ['label']},
    });
  });

  it('merges sibling keywords into an inlined reference, the sibling winning', () => {
    const root = {
      $defs: {
        Base: {
          type: 'object',
          properties: {label: {type: 'string'}, size: {type: 'number'}},
          required: ['label'],
        },
      },
    };
    const schema = {
      $ref: '#/$defs/Base',
      properties: {label: {type: 'integer'}, extra: {type: 'boolean'}},
      required: ['label', 'extra'],
    };

    assert.deepStrictEqual(inlineResolvedDefinition(resolveDefinition(schema, root)), {
      type: 'object',
      properties: {label: {type: 'integer'}, size: {type: 'number'}, extra: {type: 'boolean'}},
      required: ['label', 'extra'],
    });
  });

  it('bundles local and peer definitions while retaining named references', () => {
    const document = {
      $defs: {
        Local: {type: 'object', properties: {next: {$ref: '#/$defs/Local'}}},
      },
    };
    const peer = {
      catalogId: 'peer.json',
      $defs: {
        Shared: {type: 'object', properties: {label: {type: 'string'}}},
      },
    };
    const schema = {
      allOf: [
        {$ref: '#/$defs/Local'},
        {$ref: 'peer.json#/$defs/Shared'},
        {$ref: 'common_types.json#/$defs/DynamicString'},
      ],
    };

    const resolved = resolveDefinition(schema, document, [peer]);
    assert.deepStrictEqual(resolved.schema, {
      allOf: [
        {$ref: '#/$defs/Local'},
        {$ref: '#/$defs/peer_0_Shared'},
        {$ref: 'common_types.json#/$defs/DynamicString'},
      ],
    });
    assert.deepStrictEqual(resolved.defs, {
      Local: {type: 'object', properties: {next: {$ref: '#/$defs/Local'}}},
      peer_0_Shared: {type: 'object', properties: {label: {type: 'string'}}},
    });
    assert.deepStrictEqual(resolved.localDefinitionNames, new Set(['Local']));
    assert.deepStrictEqual(inlineResolvedDefinition(resolved), {
      allOf: [
        {type: 'object', properties: {next: {$ref: '#/$defs/Local'}}},
        {type: 'object', properties: {label: {type: 'string'}}},
        {$ref: 'common_types.json#/$defs/DynamicString'},
      ],
    });
  });

  it('resolves references using the documented peer matching rule', () => {
    const local = {catalogId: 'https://example.com/local.json'};
    const exact = {catalogId: 'exact.json'};
    const nested = {catalogId: 'https://example.com/catalogs/nested.json'};
    const short = {catalogId: 'short.json'};
    const named = {$id: 'https://example.com/named.json'};
    const catalogNamed = {$id: 'https://example.com/catalog.json'};
    const cases = [
      {
        label: 'an empty document part resolves locally',
        ref: '#/$defs/Local',
        peers: [],
        expected: local,
      },
      {
        label: 'the bare common types document is not a catalog reference',
        ref: 'common_types.json#/$defs/Value',
        peers: [],
        expected: undefined,
      },
      {
        label: 'a common types path suffix is not a catalog reference',
        ref: 'https://a2ui.org/v1/common_types.json#/$defs/Value',
        peers: [],
        expected: undefined,
      },
      {
        label: 'a bare catalog document resolves locally before checking peers',
        ref: 'catalog.json#/$defs/Local',
        peers: [catalogNamed],
        expected: local,
      },
      {
        label: 'an exact catalog ID matches a peer',
        ref: 'exact.json#/$defs/Shared',
        peers: [exact],
        expected: exact,
      },
      {
        label: 'a peer catalog ID ending in the reference document matches',
        ref: 'nested.json#/$defs/Shared',
        peers: [nested],
        expected: nested,
      },
      {
        label: 'a reference document ending in the peer catalog ID matches',
        ref: 'https://example.com/catalogs/short.json#/$defs/Shared',
        peers: [short],
        expected: short,
      },
      {
        label: 'an unmatched path ending in catalog.json resolves locally',
        ref: 'missing/catalog.json#/$defs/Local',
        peers: [],
        expected: local,
      },
      {
        label: 'a matching final path segment resolves a peer',
        ref: 'other/path/named.json#/$defs/Shared',
        peers: [named],
        expected: named,
      },
      {
        label: 'an unknown catalog document is unresolved',
        ref: 'missing.json#/$defs/Shared',
        peers: [],
        expected: undefined,
        throws: true,
      },
    ] as const;

    for (const testCase of cases) {
      const {label, ref, peers, expected} = testCase;
      const throws = 'throws' in testCase && testCase.throws;
      const scope = new PeerScope(peers);
      const target = scope.resolve(ref, local);
      if (expected) {
        assert.strictEqual(target?.doc, expected, label);
        assert.strictEqual(target?.pointer, ref.slice(ref.indexOf('#')), label);
        assert.strictEqual(target?.isPeer, expected !== local, label);
      } else {
        assert.strictEqual(target, undefined, label);
      }
      if (throws) assert.throws(() => scope.assertResolvable(ref), A2uiCatalogError, label);
      else assert.doesNotThrow(() => scope.assertResolvable(ref), label);
    }
  });
});
