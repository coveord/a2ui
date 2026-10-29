## Unreleased

- **BREAKING CHANGE**: `CallMcpToolApi.schema` and `McpAppApi.schema` are written with Zod 4, on web_core's Zod 4 common types. Accepted arguments and properties are unchanged; validation messages use Zod 4's wording. A function call that returns the whole `arguments` object is declared as an object of only `call`, `args` and `returnType`, so the catalog writes it to JSON Schema.
- **BREAKING CHANGE**: A `callMcpTool` call carrying a `server` argument now fails validation, as the published catalog closes `args` to `name` and `arguments`. It was dropped before. Remove `server` from payloads: the host resolves the server from the tool name.
- **BREAKING CHANGE**: Depends on `zod@^4.6.7` instead of `zod@^3.25.76`, and its schemas are Zod 4. Schemas passed to this package must be written with the same `zod` copy's Zod 4 API: install `zod@^4.6.7` and write `import {z} from 'zod/v4'`.
- Emit `'1.0'` as `version` on synthesized `createSurface` and `updateComponents` messages in `callMcpTool` when creating a standalone MCP App surface, matching the unified v1.0 protocol version wire format. [#3097](https://github.com/a2ui-project/a2ui/issues/3097)
- The published package contains only the runtime build output; test files and TypeScript build info are no longer included. [#3348](https://github.com/a2ui-project/a2ui/pull/3348)
- **BREAKING CHANGE**: Hosts set up the catalog once with `configureMcpCatalog`; `createCallMcpToolImplementation`, `CallMcpToolApi` and `A2UI_MIME_TYPE` are removed and `MCP_CATALOG_ID` now identifies the v1.0 catalog (`catalogs/mcp/v1/catalog.json`, bundled as `@a2ui/catalog-mcp/catalog.json`). `callMcpTool` now hands `ui://` MCP App resources to the host. [#3186](https://github.com/a2ui-project/a2ui/pull/3186)
- Add `mcpCatalog`, the v1.0 MCP catalog with the `McpApp` universal component (`A2uiMcpApp`) and `callMcpTool`, ready to hand to a `MessageProcessor`. `McpApp` renders an MCP App in the shared sandbox, binds host data through `data.paths` and dispatches the tools it is allowed to call as A2UI actions. [#2799](https://github.com/a2ui-project/a2ui/pull/2799)

## 0.0.1-alpha.1

- `@a2ui/catalog-mcp` provides `callMcpTool`: it runs a tool on a connected MCP server, returns the raw result, and applies the A2UI messages found in the result and in the UI resources it references to the host's `MessageProcessor`. [#3171](https://github.com/a2ui-project/a2ui/pull/3171)
