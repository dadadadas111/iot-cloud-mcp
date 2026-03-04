# src/tools/ — MCP Tool Definitions & Executor

15 MCP tools that proxy AI tool calls to the Rogo IoT Cloud REST API.

## Key Files

| File                                             | Purpose                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `definitions/*.tool.ts` (15 files)               | Standalone tool definitions: `{ name, description, inputSchema, metadata, schema (zod) }`                       |
| `services/tool-registry.service.ts` (288 lines)  | Imports all 15 definitions, registers each with `McpServer.registerTool()`                                      |
| `services/tool-executor.service.ts` (1423 lines) | Routes `tools/call` by name → validates params → extracts JWT context → calls `IotApiService` → shapes response |
| `tools.module.ts`                                | NestJS module. Imports `ProxyModule` + `CommonModule`, exports registry + executor                              |

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
2. Import + register in `tool-registry.service.ts` → `registerTools()` method
3. Add execution logic in `tool-executor.service.ts` → `executeTool()` switch statement
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

`tool-executor.service.ts` is the largest file (1423 lines). Structure:

1. **`executeTool(name, params, context)`** — main dispatch. Extracts `userId` + `projectApiKey` from JWT context
2. **`validateParams(name, params)`** — per-tool validation switch
3. **Per-tool handler methods** — each calls `IotApiService`, shapes response
4. **Response shaping** — list tools strip fields (`userId`, `extraInfo`, `createdAt`) to save AI tokens. Only `get_device` returns full payload with enriched `deviceType`, `brand`, `ownership`

## Anti-Patterns

- **Never** add tool logic directly in registry — registry only wires definitions to executor
- **Never** call `IotApiService` from anywhere except `tool-executor.service.ts`
- **Never** return full payloads from list endpoints — always strip to slim format
- **Never** skip the Zod `schema` field in tool definitions — SDK uses it for validation
