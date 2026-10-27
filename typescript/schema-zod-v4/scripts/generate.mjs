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

/**
 * Generates this package's Zod models with the @a2ui/schema-zod generators.
 *
 * The generators emit code that imports `zod`, which resolves to Zod 4 here,
 * and this package's own `child-ref-helpers.js`, so the same specification
 * produces Zod 4 models without a second generator to maintain.
 */
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// Read by generate-schemas.mjs when it loads.
process.env.A2UI_SCHEMA_TARGET = packageDir;

const {generateSupersetCommonTypes} =
  await import('@a2ui/schema-zod/scripts/generate-superset-common-types.mjs');
const {generateSchemas} = await import('@a2ui/schema-zod/scripts/generate-schemas.mjs');

generateSupersetCommonTypes({destFile: join(packageDir, 'src', 'types', 'common-types.ts')});
generateSchemas();
