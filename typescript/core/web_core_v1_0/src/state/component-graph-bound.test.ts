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

import {ComponentGraphBound} from './component-graph-bound.js';

describe('ComponentGraphBound', () => {
  const graph = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

  it('is undefined for a graph with a cycle', () => {
    assert.strictEqual(ComponentGraphBound.of(graph({a: ['b'], b: ['c'], c: ['a']})), undefined);
  });

  it('records references and parents, ignoring ids the graph does not hold', () => {
    const bound = ComponentGraphBound.of(graph({a: ['b', 'missing'], b: []}))!;
    assert.deepStrictEqual(bound.childrenOf('a'), ['b', 'missing']);
    assert.deepStrictEqual([...bound.parentsOf('b')], ['a']);
    assert.deepStrictEqual([...bound.parentsOf('missing')], ['a']);
  });

  it('admits a batch that keeps the graph acyclic and within the limit', () => {
    const bound = ComponentGraphBound.of(graph({a: ['b'], b: []}))!;
    assert.strictEqual(
      bound.admits(graph({b: ['c'], c: []}), 5, id => id in {a: 1, b: 1}),
      true,
    );
  });

  it('does not admit a batch that closes a cycle', () => {
    const bound = ComponentGraphBound.of(graph({a: ['b'], b: ['c'], c: []}))!;
    assert.strictEqual(
      bound.admits(graph({c: ['a']}), 50, () => true),
      false,
    );
  });

  it('does not admit a self-reference', () => {
    const bound = ComponentGraphBound.of(graph({a: []}))!;
    assert.strictEqual(
      bound.admits(graph({a: ['a']}), 50, () => true),
      false,
    );
  });

  it('does not admit a chain longer than the limit, counting references to held ids only', () => {
    const bound = ComponentGraphBound.of(graph({a: ['b'], b: ['c'], c: []}))!;
    // a -> b -> c -> d is three references.
    assert.strictEqual(
      ComponentGraphBound.of(graph({a: ['b'], b: ['c'], c: []}))!.admits(
        graph({c: ['d']}),
        2,
        id => id !== 'd',
      ),
      true,
    );
    assert.strictEqual(
      bound.admits(graph({c: ['d'], d: []}), 2, () => true),
      false,
    );
  });

  it('updates references and parents even when it does not admit the batch', () => {
    const bound = ComponentGraphBound.of(graph({a: ['b'], b: []}))!;
    assert.strictEqual(
      bound.admits(graph({b: ['a']}), 50, () => true),
      false,
    );
    assert.deepStrictEqual(bound.childrenOf('b'), ['a']);
    assert.deepStrictEqual([...bound.parentsOf('a')], ['b']);
  });
});
