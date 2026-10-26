/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {cpSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const repoRoot = join(rootDir, '..', '..', '..');
const destination = join(rootDir, 'src', 'schemas');
const protocolJson = join(repoRoot, 'specification', 'v1_0', 'json');
const basicCatalog = join(repoRoot, 'catalogs', 'basic', 'v1');

mkdirSync(destination, {recursive: true});
for (const file of readdirSync(protocolJson)) {
  if (file.endsWith('.json')) {
    cpSync(join(protocolJson, file), join(destination, file));
  }
}
cpSync(basicCatalog, join(destination, 'catalogs', 'basic'), {
  recursive: true,
  filter: source => statSync(source).isDirectory() || source.endsWith('.json'),
});
