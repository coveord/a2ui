# @a2ui/web_core_v1_0

`@a2ui/web_core_v1_0` is the framework-agnostic A2UI runtime for protocol v1.0. It provides catalog handling, state models, message processing, validation, expressions, reactive utilities, RPC support, and Lit element helpers.

## Install and import

```ts
import {Catalog, MessageProcessor} from '@a2ui/web_core_v1_0';
import {basicCatalog} from '@a2ui/catalog-basic';
```

The package exports only the runtime root entrypoint and the Basic Catalog entrypoint.

## Layout

- `src/` contains the v1.0 runtime and generated protocol schemas.
- `src/basic_catalog/` contains the generated Basic Catalog APIs.
- `src/universal/` contains Lit element helpers and Basic Catalog implementations.
- `scripts/` contains schema and catalog generators.

## Development

```bash
yarn generate-zod-schemas
yarn build
yarn test
yarn lint
yarn format:check
```
