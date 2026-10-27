## Unreleased

- **BREAKING CHANGE**: Depends on `zod@^4.6.7` and imports the Zod 3 API from its `zod/v3` entry point, instead of depending on `zod@^3.25.76`. Schemas passed to this package must come from the same `zod` copy: install `zod@^4.6.7` and write `import {z} from 'zod/v3'` where you wrote `import {z} from 'zod'`. The schemas and their behavior are unchanged.
- **BREAKING CHANGE**: A `callMcpTool` call carrying a `server` argument now fails validation, as the published catalog closes `args` to `name` and `arguments`. It was dropped before. Remove `server` from payloads: the host resolves the server from the tool name.
- The published package contains only the runtime build output; test files and TypeScript build info are no longer included. [#3348](https://github.com/a2ui-project/a2ui/pull/3348)

## 0.0.1-alpha.1

- `@a2ui/catalog-mcp` provides `callMcpTool`: it runs a tool on a connected MCP server, returns the raw result, and applies the A2UI messages found in the result and in the UI resources it references to the host's `MessageProcessor`. [#3171](https://github.com/a2ui-project/a2ui/pull/3171)
