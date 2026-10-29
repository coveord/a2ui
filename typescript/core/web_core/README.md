# @a2ui/web_core

The `@a2ui/web_core` package provides state management, protocol parsing, and schema generation for the A2UI framework. It is framework-agnostic and provides the foundational engine for renderer packages such as Angular, React, and Lit.

## Features

- **Protocol Handling**: Implements A2UI specification message validation and state handling across all supported protocol versions.
- **State Management**: Reactive data and component models using `@preact/signals-core`.
- **DataContext**: Data binding, scoping, and function evaluation with dependency tracking.
- **Catalog System**: Component and function catalogs supporting runtime validation and schema generation.
- **Schema-Driven Code Generation**: Auto-generates Zod schemas and TypeScript component/function definitions directly from specification JSON schemas.

## Architecture

Rendering is driven by a `SurfaceGroupModel` and its constituent `SurfaceModel` instances, with `DataModel` managing reactive state, `DataContext` providing expression evaluation, and `MessageProcessor` validating and applying incoming protocol messages.

## Schema & Code Generation

Protocol message schemas, common types, and catalog definitions are generated directly from the JSON schemas in the `specification/` directory.

### Running Code Generation

To regenerate all Zod schemas and catalog APIs:

```bash
# Generate all protocol Zod schemas and versioned Basic Catalog APIs
yarn generate-zod-schemas

# Or run individual version generators directly
node src/v0_9/scripts/generate-catalog.mjs
node src/v1_0/scripts/generate-catalog.mjs
```

### Catalog Schema Contract

The code generator uses **Schema Flattening** to remain version-, catalog-, and type-agnostic. Schema files adhere to the following structure:

#### 1. Catalog JSON (`catalog.json`)

- **Top-Level Dictionaries**:
  - `components`: Maps component names to JSON schema objects.
  - `functions`: Maps function names to JSON schema objects.
- **Discriminator**:
  - Derived from `catalog.discriminator.propertyName` (defaults to `"component"`).
  - The discriminator property and `"id"` are omitted from generated property schemas as they are handled by the runtime component envelope.
- **Inheritance & Envelopes**:
  - Components may use `allOf` to reference common envelopes (such as `ComponentCommon` or `CatalogComponentCommon`). The generator recursively resolves `$ref` pointers and merges `allOf` branches into a flat property bag.
- **Functions**:
  - Functions specify a `returnType` (e.g. `"string"`, `"number"`, `"boolean"`, `"validationResult"`) at the root level and define arguments inside an `args` or `parameters` object property.

#### 2. Reusable Type Definitions (`common_types.json`)

- **`$defs` Scope**:
  - Reusable type schemas reside under `$defs`. Definition names are not hardcoded; any definition present in `$defs` is resolved dynamically when referenced.
- **Reference Annotations**:
  - When a component property references `$defs/<DefName>`, the generator maps it to `<DefName>Schema`, a Zod 4 schema that names its definition with `.meta({$ref: '#/$defs/<DefName>', description})`.
  - At runtime, `generateValidationSchema` reads these references to emit `$ref` pointers and tree-shake unused `$defs` definitions.
- **Child References**:
  - Single child references and child collections are identified when their `$defs` reference targets or descriptions indicate a child component relationship (such as references to `ComponentId`, `Child`, or `ChildList`).

## Catalog Serialization

A `Catalog` has three serialization entry points:

- `Catalog.fromJson(json, protocolVersion?, catalogId?)` loads a catalog document into the catalog's model. Each entry is a `JsonComponentApi` or `JsonFunctionApi` whose model is its JSON Schema definition as written (`jsonSchema`); its Zod `schema` is derived from the definition on first use. The catalog keeps the document-level fields (metadata, named `$defs`, other top-level keys). `protocolVersion`, when given, takes precedence over the version the document declares and selects the loading rules, while `toJson` still writes the document's own `protocolVersion`; without it the document's version applies, then `DEFAULT_PROTOCOL_VERSION`. `catalogId` replaces the document's own ID.
- `catalog.toJson()` assembles the unbundled catalog document from the model, computing the `anyComponent` and `anyFunction` unions. A catalog loaded with `fromJson` returns its document unchanged (minus any entries omitted from the document's `anyComponent.oneOf` or `anyFunction.oneOf` unions, which `fromJson` filters out on load). An entry defined in code whose schema is annotated with `specMeta()` has its definition computed from the model in the layout of the catalog's protocol version; any other entry defined in code is generated from its schema's JSON Schema. The result is computed once per catalog; each call returns a fresh copy.
- `catalog.validationSchema` is the self-contained schema used to validate payloads: common types and the catalog's own `$defs` are bundled into `$defs` and every `$ref` is local. It is computed once per catalog; each read returns a fresh copy.

```ts
import {Catalog} from '@a2ui/web_core';

const catalog = Catalog.fromJson(document);
const unchanged = catalog.toJson(); // deep-equals document
const schema = catalog.validationSchema; // bundled JSON Schema
```

The `Catalog` constructor takes a `CatalogOptions` object as its fifth argument, with the `themeSchema`, the document-level fields (`instructions`, `schemaUri`, `schemaId`, `title`, `description`, `declaredProtocolVersion`, `declaresCatalogId`, `declaresComponents`, `functionsLayout`, `unions`, `defs`, `extensionFields`) that `toJson` emits, and, for a catalog defined in code, `commonTypesUri`, `themeLocation` and `defModels`. `catalog.withEntries(components, functions)` returns a catalog with the same fields and other entries, as catalog transformers need.

`catalog.derive(options)` returns a new catalog under its own id, built from entries of `catalog` and new ones. In `components` and `functions`, a name keeps the entry of that name and an object adds an entry. The new catalog does not keep the source's `$id`, title, description or instructions, since the instructions of the basic catalog, for example, name its id in their examples:

```ts
const chatCatalog = basicCatalog.derive({
  catalogId: 'https://example.com/catalogs/chat.json',
  components: ['Text', 'Image', 'Row', 'Column', 'Button', carousel],
  functions: ['openUrl'],
  instructions,
});
```

### Specification annotations

`specMeta(annotation)` returns the metadata that records what a catalog document writes about a schema beyond the schema itself, without changing validation. With Zod 4, pass it to `.meta()`. Its fields are:

- `mixins`: the common types, such as `'ComponentCommon'`, and the models a component's definition composes with `allOf`;
- `closure`: `additionalProperties` or `unevaluatedProperties`;
- `required`: the order of the `required` list;
- `allOf`: schemas that follow the schema's own, such as a format rule;
- `keywords`: such as `format`.

`specMeta({defName})` names a model that the document declares under `$defs`. The descriptions come from `.describe()`. A common type names its definition in its metadata (`.meta({$ref})`), and `.describe()` keeps that reference. A union written with `z.xor` is written as `oneOf`, and one written with `z.union` as `anyOf`.

```ts
import {Catalog, specMeta} from '@a2ui/web_core/catalog';
import {z} from 'zod/v4';

const Common = z.object({weight: z.number().optional()}).meta(specMeta({defName: 'Common'}));
const Badge = {
  name: 'Badge',
  schema: z
    .strictObject({...Common.shape, label: z.string()})
    .describe('A badge.')
    .meta(specMeta({mixins: ['ComponentCommon', Common]})),
};
// Badge's definition composes ComponentCommon and #/$defs/Common with allOf,
// and $defs.Common is computed from the Common model.
const document = new Catalog('https://example.com/badges', '0.9', [Badge]).toJson();
```

The built-in basic catalogs are built this way. Their components and functions are Zod models generated from the published catalog documents by `scripts/generate-catalog-schemas.mjs` (v0.9 and v1) and `src/v0_8/scripts/generate-catalog.mjs` (v0.8), which run as part of `yarn generate-zod-schemas`. For every schema node, the generator predicts the JSON Schema that `toJson` derives from the Zod code it emits, and annotates the node with the difference from the published schema. `toJson` of each basic catalog computes its published document from the models; no copy of the document is kept in the package.

## Development

### Building

The package uses `wireit` for build orchestration:

```bash
yarn build
```

### Testing

Run unit tests:

```bash
yarn test
```

Run conformance test suite:

```bash
node tests/conformance/conformance_test.mjs
```

Run the timing cases of `conformance/core/message_processor_scaling.yaml`, which check that processing a surface sent in many small messages takes time in proportion to its size. Times depend on the machine and its load, so `yarn test` leaves these cases out:

```bash
yarn test:timing
```

### Formatting & Linting

```bash
yarn format
yarn lint
```
