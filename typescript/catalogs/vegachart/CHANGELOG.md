# Changelog

## Unreleased

- (v0_9) `VegaChartApi` declares the v0.9 `accessibility` attributes that
  `catalogs/vegachart/v0_9/catalog.json` takes from `ComponentCommon`. A
  `VegaChart` with `accessibility` now validates instead of being rejected as
  an unknown key, and binds `label` and `description` as v0.9 attributes.

## 0.1.0

- Initial release: the `<a2ui-vega-chart>` element, `VegaChart` component APIs,
  and catalog instances for A2UI v0.9 (`/v0_9`) and v1.0 (`/v1`).
