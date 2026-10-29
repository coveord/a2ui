# Changelog

## Unreleased

- **BREAKING CHANGE**: `VegaChartApi` (v0.9) and `VegaChartV1Api` (v1.0) are written with Zod 4, on web_core's Zod 4 common types, and annotated with `specMeta()`. The catalogs' documents and accepted payloads are unchanged; validation messages use Zod 4's wording.
- **BREAKING CHANGE**: Depends on `zod@^4.6.7` instead of `zod@^3.25.76`, and its schemas are Zod 4. Schemas passed to this package must be written with the same `zod` copy's Zod 4 API: install `zod@^4.6.7` and write `import {z} from 'zod/v4'`.
- (v0_9) `VegaChartApi` declares the v0.9 `accessibility` attributes that
  `catalogs/vegachart/v0_9/catalog.json` takes from `ComponentCommon`. A
  `VegaChart` with `accessibility` now validates instead of being rejected as
  an unknown key, and binds `label` and `description` as v0.9 attributes.

## 0.1.0

- Initial release: the `<a2ui-vega-chart>` element, `VegaChart` component APIs,
  and catalog instances for A2UI v0.9 (`/v0_9`) and v1.0 (`/v1`).
