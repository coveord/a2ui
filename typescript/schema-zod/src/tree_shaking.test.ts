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
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {build} from 'esbuild';

/** The package directory, from which the bundled entry resolves its imports. */
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));

/**
 * A consumer that wires the Zod adapter only through the values it uses: no
 * import exists for its side effects alone.
 */
const CONSUMER = `
import {MessageProcessor} from '@a2ui/web_core_v1_0';
import {parseZodCatalog} from '@a2ui/schema-zod';

const catalog = parseZodCatalog({
  catalogId: 'https://example.com/tree-shaking.json',
  protocolVersion: '1.0',
  components: {
    Label: {type: 'object', properties: {text: {type: 'string'}}, required: ['text']},
  },
});
const processor = new MessageProcessor([catalog]);
processor.processMessages([
  {version: 'v1.0', createSurface: {surfaceId: 's', catalogId: catalog.id}},
  {
    version: 'v1.0',
    updateComponents: {
      surfaceId: 's',
      components: [{id: 'root', component: 'Label', text: 'hi'}],
    },
  },
]);
export const tree = processor.model.getSurface('s').componentsModel.get('root').componentTree;
`;

describe('tree shaking', () => {
  it('keeps everything a consumer needs when bundlers trust "sideEffects": false', async () => {
    const result = await build({
      stdin: {contents: CONSUMER, resolveDir: PACKAGE_DIR, loader: 'js'},
      bundle: true,
      format: 'esm',
      logLevel: 'silent',
      platform: 'node',
      write: false,
    });
    const dir = await mkdtemp(join(tmpdir(), 'a2ui-schema-zod-'));
    try {
      const file = join(dir, 'consumer.mjs');
      await writeFile(file, result.outputFiles[0].text);
      const {tree} = await import(pathToFileURL(file).href);

      assert.deepStrictEqual(tree, {id: 'root', component: 'Label', text: 'hi'});
    } finally {
      await rm(dir, {recursive: true, force: true});
    }
  });
});
