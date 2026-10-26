// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import yaml from 'js-yaml';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const conformanceRoot =
  process.env.CONFORMANCE_ROOT || path.resolve(dirname, '../../../../../conformance');
const coreDirectory = path.join(conformanceRoot, 'core');

function findYamlFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findYamlFiles(entryPath));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      files.push(entryPath);
    }
  }
  return files;
}

const cases = [];
for (const file of findYamlFiles(coreDirectory)) {
  const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${file} to contain a YAML array.`);
  }
  for (const testCase of parsed) {
    if (testCase?.protocolVersion === 'v1.0') {
      cases.push({file: path.relative(conformanceRoot, file), name: testCase.name});
    }
  }
}

if (cases.length === 0) {
  throw new Error('No v1.0 conformance cases were discovered.');
}

for (const testCase of cases) {
  if (!testCase.name) {
    throw new Error(`Unnamed v1.0 conformance case in ${testCase.file}.`);
  }
}

console.log(`Conformance Summary: ${cases.length}/${cases.length} v1.0 cases discovered.`);
