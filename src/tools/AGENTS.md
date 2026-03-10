# src/tools/ — MCP Tool Definitions & Executor

15 MCP tools that proxy AI tool calls to the Rogo IoT Cloud REST API.

## Key Files

| File                                            | Purpose                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `definitions/*.tool.ts` (15 files)              | Standalone tool definitions: `{ name, description, inputSchema, metadata, schema (zod) }` |
| `services/tool-registry.service.ts` (78 lines)  | Loops `ALL_TOOL_DEFINITIONS` array, registers each with `McpServer.registerTool()`        |
| `services/tool-executor.service.ts` (565 lines) | Handler-map dispatch → extract JWT context → call `IotApiService` → shape response        |
| `tools.module.ts`                               | NestJS module. Imports `ProxyModule` + `CommonModule`, exports registry + executor        |

## Tool Definition Pattern

```typescript
// src/tools/definitions/{name}.tool.ts
import { z } from 'zod';

const ParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
});

export type Params = z.infer<typeof ParamsSchema>;

export const TOOL_NAME_TOOL = {
  name: 'tool_name',
  description: 'What it does',
  inputSchema: { type: 'object', properties: {...}, required: [...] },
  metadata: {
    name: 'tool_name',
    description: 'Same as above',
    readOnlyHint: true,  // or false for mutations
    securitySchemes: { oauth2: {...} },
  },
  schema: ParamsSchema,  // Zod schema for SDK validation
};
```

**Dual schema**: `inputSchema` (JSON Schema for MCP protocol) + `schema` (Zod for SDK `registerTool()`). Both must match.

## Adding a New Tool

1. Create `src/tools/definitions/{name}.tool.ts` following pattern above
2. Add the exported constant to `ALL_TOOL_DEFINITIONS` array in `tool-registry.service.ts`
3. Add handler method in `tool-executor.service.ts` and wire it in the `toolHandlers` record
4. If new API endpoint needed → add method in `src/proxy/services/iot-api.service.ts`
5. Tool auto-appears in `tools/list` and is callable via `tools/call`

## Tool List (15 tools)

| Tool                       | Type  | Params                                               |
| -------------------------- | ----- | ---------------------------------------------------- |
| `fetch_user`               | Read  | _(none)_                                             |
| `search`                   | Read  | `query`, `type?`                                     |
| `fetch`                    | Read  | `endpoint`                                           |
| `list_devices`             | Read  | `locationId?`, `groupId?`                            |
| `list_locations`           | Read  | _(none)_                                             |
| `list_groups`              | Read  | `locationId?`                                        |
| `get_device`               | Read  | `uuid`                                               |
| `get_device_state`         | Read  | `uuid`                                               |
| `get_device_state_by_mac`  | Read  | `mac`                                                |
| `get_location_state`       | Read  | `locationId`                                         |
| `get_device_documentation` | Read  | `topic?`                                             |
| `update_device`            | Write | `uuid`, `label?`, `desc?`, `locationId?`, `groupId?` |
| `delete_device`            | Write | `uuid`                                               |
| `control_device`           | Write | `uuid`, `elementIds`, `command`                      |
| `control_device_simple`    | Write | `uuid`, `action`, `value?`                           |

## Executor Internals

`tool-executor.service.ts` (565 lines) uses a handler-map architecture:

### Helpers (shared logic extracted to reduce duplication)

| Helper                 | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `extractUserContext()` | Auth check + JWT decode → `{ userId, projectApiKey }`         |
| `requireAuthHeader()`  | Auth check only (no userId) → `projectApiKey`                 |
| `successResult()`      | Wrap data as `CallToolResult` with JSON text content          |
| `errorResult()`        | Sanitized error → `CallToolResult` with `isError` flag + hint |

### Dispatch

`toolHandlers` — A `Record<string, handler>` mapping tool names to handler methods. `executeTool()` does O(1) lookup by name (no `if/else` chain or `switch`).

### Auth Patterns (3 variants)

| Pattern            | Tools                                                                                                                                                 | Helper used            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Full auth (userId) | fetch_user, search, fetch, list_devices, list_locations, list_groups, get_device, update_device, delete_device, control_device, control_device_simple | `extractUserContext()` |
| Auth, no userId    | get_device_state, get_location_state, get_device_state_by_mac                                                                                         | `requireAuthHeader()`  |
| No auth            | get_device_documentation                                                                                                                              | _(none)_               |

### Response shaping

- List tools strip fields (`userId`, `extraInfo`, `createdAt`) to save AI tokens
- Only `get_device` returns full payload with enriched `deviceType`, `brand`, `ownership`

### Error handling

`AuthRequiredError` class for missing auth. All handlers use `errorResult()` which calls `sanitizeErrorForClient()` — never leaks stack traces or internal details.

## Registry Internals

`tool-registry.service.ts` (78 lines) — pure wiring:

1. `ALL_TOOL_DEFINITIONS` — const array of all 15 tool definition imports
2. `registerTools(mcpServer, projectApiKey)` — single `for...of` loop calling `mcpServer.registerTool()` for each definition, delegating execution to `ToolExecutorService.executeTool()`

No per-tool logic in registry. No copy-paste blocks.

## Type Safety

- `IotApiService` returns typed interfaces (`IotDevice`, `IotLocation`, `IotGroup`, `IotLocationStateEntry`, `IotControlPayload`) — no `Promise<any>`
- Tool handlers use Zod-inferred param types from definitions
- No `as any`, `@ts-ignore`, or `@ts-expect-error` in the tools layer

## Anti-Patterns

- **Never** add tool logic directly in registry — registry only wires definitions to executor
- **Never** call `IotApiService` from anywhere except `tool-executor.service.ts`
- **Never** return full payloads from list endpoints — always strip to slim format
- **Never** skip the Zod `schema` field in tool definitions — SDK uses it for validation
- **Never** use `as any` or untyped callbacks — IotApiService returns typed data
