# `@a2ui/conformance`

Runs the language-agnostic [conformance suites](../../conformance/README.md)
against the TypeScript SDK: `@a2ui/web_core` and the catalogs built on it, such
as `@a2ui/catalog-basic`. The other SDKs run the same YAML cases through their
own harnesses, so all SDKs behave the same.

This workspace is private and is not published. It depends on the SDK packages
only through their public entry points.

## Running

```bash
yarn workspace @a2ui/conformance test
```

`yarn test` builds `@a2ui/web_core` and `@a2ui/catalog-basic` first. Set
`CONFORMANCE_ROOT` to run the suites from another checkout of `conformance/`.

## Layout

- `tests/conformance_test.mjs`: the runner. It loads every suite under
  `conformance/core/` and `conformance/agent/`, picks the catalogs each case
  needs, and reports cases that do not apply to the TypeScript SDK as skipped,
  with a reason.
- `src/node_resolution.ts`: the handler for `core/node_resolution.yaml`.

The timing cases (`measure_growth`, `measure_overhead`) stay with the packages
they measure and run with their `yarn test:timing`.
