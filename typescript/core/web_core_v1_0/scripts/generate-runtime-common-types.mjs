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
 * Generates the runtime common types: the v1.0 common type definitions as a
 * renderer accepts them.
 *
 * The runtime is a superset of the specification. It also accepts the
 * pre-v1.0 `path` and `call` spellings, accepts a call to any function (the
 * message processor checks a call against the catalog it names), and reads a
 * union as matching any of its branches. The schema adapters' common type
 * models implement the same superset; a schema-zod-v4 test keeps them aligned
 * with these definitions.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const commonTypesPath = join(rootDir, '../../../specification/v1_0/json/common_types.json');
const destinationPath = join(rootDir, 'src', 'runtime_common_types.ts');
const specDefs = JSON.parse(readFileSync(commonTypesPath, 'utf8')).$defs;

/** Requires one of the given spellings of a property. */
const oneOfSpellings = (...names) => ({anyOf: names.map(name => ({required: [name]}))});

/** A string property with the specification's description. */
const described = (description, schema = {type: 'string'}) => ({...schema, description});

const CALL_DESCRIPTION = 'The name of the function to call.';
const CATALOG_ID_DESCRIPTION =
  'The catalog ID for this function, overriding any surface-level default catalogId.';
const PATH_DESCRIPTION = 'A JSON Pointer path to a value in the data model.';

/** Definitions where the runtime differs from the specification. */
const OVERRIDES = {
  DataBinding: {
    type: 'object',
    properties: {
      'path': described(PATH_DESCRIPTION),
      '@path': described(PATH_DESCRIPTION),
    },
    ...oneOfSpellings('@path', 'path'),
  },
  FunctionCommon: {
    type: 'object',
    properties: {
      'call': described(CALL_DESCRIPTION),
      '@call': described(CALL_DESCRIPTION),
      'catalogId': described(CATALOG_ID_DESCRIPTION),
    },
    ...oneOfSpellings('@call', 'call'),
  },
  IndexSystemFunction: {
    type: 'object',
    properties: {
      'call': {const: '@index'},
      '@call': {const: '@index'},
      'args': {type: 'object', properties: {offset: {$ref: '#/$defs/DynamicNumber'}}},
    },
    ...oneOfSpellings('@call', 'call'),
  },
  FunctionCall: {
    type: 'object',
    properties: {
      'call': described(CALL_DESCRIPTION),
      '@call': described(CALL_DESCRIPTION),
      'args': described('Arguments passed to the function.', {type: 'object'}),
      'returnType': described('The expected return type of the function call.', {
        enum: ['string', 'number', 'boolean', 'array', 'object', 'any', 'void'],
      }),
      'catalogId': described(CATALOG_ID_DESCRIPTION),
    },
    additionalProperties: false,
    ...oneOfSpellings('@call', 'call'),
  },
};

/** Rewrites every `oneOf` as `anyOf`: the runtime accepts a value any branch matches. */
function unionsAsAnyOf(node) {
  if (Array.isArray(node)) return node.map(unionsAsAnyOf);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key === 'oneOf' ? 'anyOf' : key] = unionsAsAnyOf(value);
  }
  return out;
}

const runtimeDefs = {};
for (const [name, definition] of Object.entries(specDefs)) {
  const base = OVERRIDES[name] ?? unionsAsAnyOf(definition);
  runtimeDefs[name] = {
    ...base,
    ...(definition.description !== undefined ? {description: definition.description} : {}),
  };
}

// A template object of a child list accepts other keys.
const template = runtimeDefs.ChildList.anyOf.find(branch => branch.type === 'object');
delete template.additionalProperties;

// A literal object of a dynamic value is any object that is not a binding or a
// call, in either spelling.
const literal = runtimeDefs.DynamicValue.anyOf.find(branch => branch.type === 'object');
delete literal.propertyNames;
literal.not = {anyOf: ['@path', 'path', '@call', 'call'].map(name => ({required: [name]}))};

const header = readFileSync(join(__dirname, 'generate-standard-defs.mjs'), 'utf8')
  .split('\n')
  .slice(0, 15)
  .join('\n');
const output = `${header}

// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from specification/v1_0 via scripts/generate-runtime-common-types.mjs

/**
 * The v1.0 common type definitions as a renderer accepts them: a superset of
 * \`V10_STANDARD_DEFS\` that also accepts the pre-v1.0 \`path\` and \`call\`
 * spellings and a call to any function, and reads a union as matching any of
 * its branches. Schema adapters that load catalog documents validate against
 * these definitions; \`validationSchema\` keeps the specification's.
 */
export const V10_RUNTIME_COMMON_TYPE_DEFS: Record<string, unknown> = ${JSON.stringify(runtimeDefs, null, 2)};
`;

writeFileSync(destinationPath, output);
console.log('Generated v1.0 runtime_common_types.ts.');
