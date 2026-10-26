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

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const commonTypesPath = join(
  rootDir,
  '..',
  '..',
  '..',
  'specification',
  'v1_0',
  'json',
  'common_types.json',
);
const commonTypes = JSON.parse(readFileSync(commonTypesPath, 'utf8'));

const output = `/*
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

// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from specification/v1_0/json/common_types.json

import type {ChildRefAnalysisOptions} from './catalog/reference-map.js';

export const V10_CHILD_REF_OPTIONS: ChildRefAnalysisOptions = {
  childRefNames: new Set(['ComponentId', 'Child', 'ChildComponentId']),
  childListRefNames: new Set(['ChildList', 'TemplateChildList', 'ChildrenItem', 'TemplateItem']),
};

export const V10_STANDARD_DEFS: Record<string, unknown> = ${JSON.stringify(commonTypes.$defs, null, 2)};
`;

writeFileSync(join(rootDir, 'src', 'standard_defs.ts'), output);
