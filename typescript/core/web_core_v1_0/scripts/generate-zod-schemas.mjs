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

import {readdirSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

/**
 * @fileoverview Master runner for Zod schema generation across all supported protocol versions.
 *
 * Discovers version-specific generators under `src/<version>/scripts/` and
 * runs the flattened v1.0 generator from `scripts/generate-schemas.mjs`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');

const generatorPaths = [
  ...readdirSync(srcDir, {withFileTypes: true})
    .filter(dirent => dirent.isDirectory())
    .map(dirent => join(srcDir, dirent.name, 'scripts', 'generate-schemas.mjs'))
    .filter(existsSync)
    .sort(),
  join(__dirname, 'generate-schemas.mjs'),
];

console.log(`Running schema generators: ${generatorPaths.join(', ')}`);

for (const scriptPath of generatorPaths) {
  const moduleUrl = pathToFileURL(scriptPath).href;
  const mod = await import(moduleUrl);

  // Invoke exported generator function
  const generatorFn =
    mod.generateSchemas || mod.default || Object.values(mod).find(fn => typeof fn === 'function');
  if (generatorFn) {
    await generatorFn();
  }
}

console.log('Successfully finished generating Zod schemas.');
