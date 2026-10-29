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

import {execFileSync} from 'node:child_process';
import {mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {jsonSchemaToZod} from 'json-schema-to-zod';

/**
 * Returns the standard Apache 2.0 file header for generated files.
 *
 * @param {string} version Specification version string (e.g. 'v0.9', 'v1.0').
 * @param {string} [generatorSource] Generator script name.
 * @returns {string} File header comment block.
 */
export function getHeader(version, generatorSource = 'scripts/generate-zod-schemas.mjs') {
  return `/*
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
// Generated from specification/${version}/json/ via ${generatorSource}
`;
}

/**
 * Cleans generic syntax emitted by json-schema-to-zod.
 *
 * @param {string} code Raw JS string.
 * @returns {string} Cleaned code.
 */
export function transformZodSyntax(code) {
  let clean = code;
  clean = clean.replace(
    /export const ([A-Za-z0-9_]+Schema): z\.ZodType<unknown> =/g,
    'export const $1 =',
  );
  clean = clean.replace(/z\.literal\("__REF__([^"]+)__"\)/g, '$1');
  clean = clean.replace(/z\.core\.\$ZodIssue/g, 'z.ZodIssue');
  clean = clean.replace(/ctx\.addIssue\(([^;]+)\);/g, 'ctx.addIssue($1 as any);');
  clean = clean.replace(/== i\)/g, '=== i)');
  return clean;
}

/**
 * Recursively extracts all #/$defs/ references for a given schema node.
 *
 * @param {object} node Schema node.
 * @param {Set<string>} deps Set of accumulated dependencies.
 * @returns {Set<string>} The dependency set.
 */
/**
 * Rewrites generated Zod 3 common types as Zod 4 code for catalogs: it
 * imports `zod/v4`, and a schema names its definition in its metadata
 * (`.meta({$ref})`) instead of with a `REF:` description marker, which also
 * makes the child reference marks of `markChildRef` unnecessary. `Child`
 * names its own definition rather than reusing `ComponentId`'s.
 *
 * @param {string} code Generated Zod 3 code.
 * @returns {string} The Zod 4 code.
 */
export function toZod4Code(code) {
  let clean = code.replace("import {z} from 'zod/v3';", "import {z} from 'zod/v4';");
  clean = clean.replace(/import \{markChildRef\} from '[^']+';\n/, '');
  clean = clean.replace(
    /markChildRef\(\n\s*([\s\S]*?),\n\s*'(?:component-id|child-list)',\n\)/g,
    '$1',
  );
  clean = clean.replace(
    /\.describe\(\s*(['"])REF:([^'"#|]*#\/\$defs\/[A-Za-z0-9_]+)(?:\|((?:\\.|(?!\1)[^\\])*))?\1,?\s*\)/g,
    (_match, quote, ref, description) =>
      description === undefined
        ? `.meta({$ref: '${ref}'})`
        : `.meta({$ref: '${ref}', description: ${quote}${description}${quote}})`,
  );
  clean = clean.replace(
    'export const ChildSchema = ComponentIdSchema;',
    "export const ChildSchema = ComponentIdSchema.meta({$ref: '#/$defs/Child'});",
  );
  clean = clean.replace(/z\.ZodIssueCode\.custom/g, "'custom'");
  // Doc comments repeat the markers: keep only their descriptions.
  clean = clean.replace(/^\/\*\* REF:[^|*]*\*\/\n/gm, '');
  clean = clean.replace(/^\/\*\* REF:[^|*]*\|/gm, '/** ');
  return clean;
}

/**
 * Writes generated Zod 4 code to `path`, formatted with Prettier to a fixed
 * point: Prettier formats the method chains `toZod4Code` rewrites in two
 * passes, and the build's single pass then leaves the file unchanged.
 *
 * @param {string} path The file to write.
 * @param {string} code The code.
 */
export function writeFormattedZod4(path, code) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, code);
  const prettier = createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs');
  for (let pass = 0; pass < 2; pass++) {
    execFileSync(process.execPath, [prettier, '--write', '--log-level', 'warn', path]);
  }
}

export function getDependencies(node, deps = new Set(), parentDefName) {
  if (!node || typeof node !== 'object') return deps;
  if (Array.isArray(node)) {
    node.forEach(child => getDependencies(child, deps, parentDefName));
    return deps;
  }
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/$defs/')) {
    deps.add(node.$ref.replace('#/$defs/', ''));
  }
  for (const [key, val] of Object.entries(node)) {
    if (key === 'oneOf' && parentDefName === 'FunctionCall') {
      continue;
    }
    getDependencies(val, deps, parentDefName);
  }
  return deps;
}

/**
 * Analyzes the schema definition dependency graph, detects cycles using DFS,
 * and produces a valid topological ordering along with the set of cyclic/lazy edges.
 *
 * @param {Record<string, object>} defs Map of definition names to JSON Schema objects.
 * @returns {{topologicalOrder: string[], lazyEdges: Set<string>}}
 */
export function analyzeDependencies(defs) {
  const graph = new Map();
  for (const [name, def] of Object.entries(defs)) {
    graph.set(name, getDependencies(def, new Set(), name));
  }

  const visiting = new Set();
  const visited = new Set();
  const topologicalOrder = [];
  const lazyEdges = new Set();

  function visit(node) {
    if (visited.has(node) || visiting.has(node)) return;

    visiting.add(node);
    for (const dep of graph.get(node) || []) {
      if (visiting.has(dep)) {
        // Cycle detected: dep must be lazily evaluated in node
        lazyEdges.add(`${node}->${dep}`);
      } else if (!visited.has(dep) && graph.has(dep)) {
        visit(dep);
      }
    }
    visiting.delete(node);
    visited.add(node);
    topologicalOrder.push(node);
  }

  for (const name of graph.keys()) {
    visit(name);
  }

  return {topologicalOrder, lazyEdges};
}

/**
 * Resolves a $ref pointer to an AST placeholder or Zod lazy wrapper.
 *
 * @param {string} refString The $ref pointer string.
 * @param {string} parentDefName The enclosing definition name.
 * @param {Set<string>} [lazyEdges] Set of detected cycle edges.
 * @param {string[]} [topologicalOrder] Topologically sorted definition names.
 * @returns {object|null} Modified JSON Schema node or null.
 */
export function resolveRefTarget(refString, parentDefName, lazyEdges, topologicalOrder) {
  if (refString.startsWith('https://') || refString.startsWith('http://')) {
    return {type: 'object', additionalProperties: true};
  }
  if (refString === 'catalog.json#/$defs/theme') {
    return {};
  }
  if (refString.startsWith('catalog.json#/$defs/')) {
    return {type: 'object', additionalProperties: true};
  }
  const idx = refString.indexOf('#/$defs/');
  if (idx === -1) return null;
  const targetName = refString.substring(idx + 8);
  if (targetName === 'theme') {
    return {};
  }
  if (targetName === 'anyFunction' || targetName === 'anyComponent') {
    return {type: 'object', additionalProperties: true};
  }
  if (
    lazyEdges &&
    (lazyEdges.has(`${parentDefName}->${targetName}`) ||
      (topologicalOrder &&
        topologicalOrder.indexOf(targetName) > topologicalOrder.indexOf(parentDefName)))
  ) {
    return {enum: [`__REF__z.lazy(() => ${targetName}Schema)__`]};
  }
  if (targetName === 'ComponentId') {
    return {enum: ['__REF__ComponentIdSchema__']};
  }
  return {enum: ['__REF__' + targetName + 'Schema__']};
}

/**
 * Recursively prepares JSON Schema nodes by resolving local/remote #/$defs references.
 *
 * @param {object} node Schema node.
 * @param {string} parentDefName Enclosing definition name.
 * @param {Set<string>} [lazyEdges] Set of detected cycle edges.
 * @param {string[]} [topologicalOrder] Topologically sorted definition names.
 * @returns {object} Prepared schema node.
 */
export function prepareRef(node, parentDefName, lazyEdges, topologicalOrder) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map(n => prepareRef(n, parentDefName, lazyEdges, topologicalOrder));
  }
  if (typeof node.$ref === 'string') {
    const resolved = resolveRefTarget(node.$ref, parentDefName, lazyEdges, topologicalOrder);
    if (resolved) return resolved;
  }
  if (
    Array.isArray(node.allOf) &&
    node.allOf.length === 2 &&
    node.allOf.some(item => item.$ref && item.$ref.includes('FunctionCall')) &&
    node.allOf.some(item => item.properties && item.properties.returnType)
  ) {
    const fnRef = node.allOf.find(item => item.$ref && item.$ref.includes('FunctionCall'));
    return prepareRef(fnRef, parentDefName, lazyEdges, topologicalOrder);
  }
  const res = {};
  for (const [k, v] of Object.entries(node)) {
    // Simplify oneOf to anyOf for union schemas so jsonSchemaToZod emits clean z.union([...])
    if (
      k === 'oneOf' &&
      Array.isArray(v) &&
      parentDefName !== 'FunctionCall' &&
      parentDefName !== 'FunctionResponse'
    ) {
      res['anyOf'] = v.map(n => prepareRef(n, parentDefName, lazyEdges, topologicalOrder));
    } else if (k === 'oneOf' && parentDefName === 'FunctionCall') {
      // Omit external catalog anyFunction hook from FunctionCall object definition
      continue;
    } else if (k === 'patternProperties' && parentDefName === 'Extensions') {
      continue;
    } else {
      res[k] = prepareRef(v, parentDefName, lazyEdges, topologicalOrder);
    }
  }
  if (parentDefName === 'Extensions' && !res.type) {
    res.type = 'object';
    res.additionalProperties = true;
  }
  if (res.properties && !res.type) {
    res.type = 'object';
  }
  if (node.const !== undefined && typeof node.const !== 'object' && !res.enum) {
    res.type = typeof node.const;
    res.enum = [node.const];
    delete res.const;
  }
  return res;
}

/**
 * Compiles a single schema definition into Zod TypeScript code.
 *
 * @param {object} rawDef JSON Schema definition object.
 * @param {string} name Definition identifier.
 * @param {object} [options] Options for compilation.
 * @param {Set<string>} [options.lazyEdges] Detected cyclic edges.
 * @param {string[]} [options.topologicalOrder] Topologically sorted definition names.
 * @param {function} [options.transformCode] Custom code transform callback.
 * @returns {string} Generated TypeScript code string.
 */
export function compileDefToZod(rawDef, name, options = {}) {
  const prep = prepareRef(rawDef, name, options.lazyEdges, options.topologicalOrder);
  const zOptions = {
    module: 'esm',
    name: `${name}Schema`,
    noImport: true,
  };
  if (options.emitType !== false) {
    zOptions.type = options.type || name;
  }
  let code = jsonSchemaToZod(prep, zOptions);
  code = transformZodSyntax(code);
  if (options.transformCode) {
    code = options.transformCode(code, name);
  }
  return code;
}

/**
 * Generates an index.ts file re-exporting all .ts files in a directory.
 *
 * @param {string} destDir Target schema directory.
 * @param {string} version Version identifier.
 * @param {string} [generatorSource] Generator script name.
 */
export function writeIndexFile(destDir, version, generatorSource) {
  const generatedFiles = readdirSync(destDir)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts' && f !== 'helpers.ts')
    .sort();

  let indexTs = getHeader(version, generatorSource);
  for (const file of generatedFiles) {
    indexTs += `export * from './${file.replace('.ts', '.js')}';\n`;
  }
  indexTs += `export * from './helpers.js';\n`;

  writeFileSync(join(destDir, 'index.ts'), indexTs);
}
