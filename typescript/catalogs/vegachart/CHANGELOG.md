# Changelog

## Unreleased

- **BREAKING CHANGE**: Depends on `zod@^4.6.7` and imports the Zod 3 API from its `zod/v3` entry point, instead of depending on `zod@^3.25.76`. Schemas passed to this package must come from the same `zod` copy: install `zod@^4.6.7` and write `import {z} from 'zod/v3'` where you wrote `import {z} from 'zod'`. The schemas and their behavior are unchanged.

## 0.1.0

- Initial release: the `<a2ui-vega-chart>` element, `VegaChart` component APIs,
  and catalog instances for A2UI v0.9 (`/v0_9`) and v1.0 (`/v1`).
