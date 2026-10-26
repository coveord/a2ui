# `@a2ui/catalog-basic`

<!-- disableFinding(LINK_RELATIVE_G3DOC) -->

TypeScript implementation of the
[A2UI Basic Catalog](../../../catalogs/basic/v1/catalog.json): the standard
components (`Text`, `Row`, `Button`, `TextField` and the rest) and functions
(`formatString`, `required`, `openUrl` and the rest), rendered with universal
custom elements that work in every web renderer.

`@a2ui/web_core` does not include this catalog. An application that uses it
installs this package and passes the catalog to its renderer, like any other
catalog.

## Entry points

| Import path              | Protocol | Exports                                                                                                    |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `@a2ui/catalog-basic/v1` | v1.0     | `basicCatalog`, `BASIC_COMPONENTS`, `BASIC_FUNCTIONS`, the component and function APIs and implementations |

The same entry point also exports the theme (`BasicCatalogThemeSchema`), the
default styles (`injectBasicCatalogStyles`) and the markdown support
(`setMarkdownRenderer`) that the catalog's elements use.

## Usage

```ts
import {basicCatalog} from '@a2ui/catalog-basic/v1';
import {MessageProcessor} from '@a2ui/web_core/v1_0';

const processor = new MessageProcessor([basicCatalog]);
```

## Development

The component and function APIs in `src/v1/components/basic_components.ts`
and `src/v1/functions/basic_functions_api.ts` are generated from
[`catalogs/basic/v1/catalog.json`](../../../catalogs/basic/v1/catalog.json).
`yarn build` regenerates them; do not edit them by hand.

```bash
yarn workspace @a2ui/catalog-basic build
yarn workspace @a2ui/catalog-basic test
```
