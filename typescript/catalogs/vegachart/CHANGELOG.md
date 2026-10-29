# Changelog

## Unreleased

- **BREAKING CHANGE**: Depends on `zod@^4.6.7` and imports the Zod 3 API from its `zod/v3` entry point, instead of depending on `zod@^3.25.76`. Schemas passed to this package must come from the same `zod` copy: install `zod@^4.6.7` and write `import {z} from 'zod/v3'` where you wrote `import {z} from 'zod'`. The schemas and their behavior are unchanged.
- (v0_9) `VegaChartApi` declares the v0.9 `accessibility` attributes that
  `catalogs/vegachart/v0_9/catalog.json` takes from `ComponentCommon`. A
  `VegaChart` with `accessibility` now validates instead of being rejected as
  an unknown key, and binds `label` and `description` as v0.9 attributes.

## 0.1.0

- Initial release: the `<a2ui-vega-chart>` element, `VegaChart` component APIs,
  and catalog instances for A2UI v0.9 (`/v0_9`) and v1.0 (`/v1`).
