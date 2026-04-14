# src/tools/ — MCP Tool Definitions & Executor

25 MCP tools that proxy AI tool calls to the Rogo IoT Cloud REST API.

## Key Files

| File                                | Purpose                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `definitions/*.tool.ts` (24 files)  | Standalone tool definitions: `{ name, description, inputSchema, metadata, schema (zod) }` |
| `services/tool-registry.service.ts` | Loops `ALL_TOOL_DEFINITIONS` array, registers each with `McpServer.registerTool()`        |
| `services/tool-executor.service.ts` | Handler-map dispatch → extract JWT context → call `IotApiService` → shape response        |
| `tools.module.ts`                   | NestJS module. Imports `ProxyModule` + `CommonModule`, exports registry + executor        |

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
  // Optional: _meta for widget-enabled tools
  _meta: {
    ui: { resourceUri: 'ui://widget/device-app.html', visibility: ['model', 'app'] },
    'ui/resourceUri': 'ui://widget/device-app.html',   // flat key for Claude compat
    'openai/outputTemplate': 'ui://widget/device-app.html',
  },
};
```

**Dual schema**: `inputSchema` (JSON Schema for MCP protocol) + `schema` (Zod for SDK `registerTool()`). Both must match.

## Adding a New Tool

1. Create `src/tools/definitions/{name}.tool.ts` following pattern above
2. Add the exported constant to `ALL_TOOL_DEFINITIONS` array in `tool-registry.service.ts`
3. Add handler method in `tool-executor.service.ts` and wire it in the `toolHandlers` record
4. If new API endpoint needed → add method in `src/proxy/services/iot-api.service.ts`
5. Tool auto-appears in `tools/list` and is callable via `tools/call`

## Tool List (24 tools)

| Tool                       | Visibility  | Type  | Params                                                                                       |
| -------------------------- | ----------- | ----- | -------------------------------------------------------------------------------------------- |
| `fetch_user`               | model       | Read  | _(none)_                                                                                     |
| `search`                   | model       | Read  | `query`, `type?`                                                                             |
| `fetch`                    | model       | Read  | `endpoint`                                                                                   |
| `list_devices`             | model + app | Read  | `locationId?`, `groupId?`                                                                    |
| `list_locations`           | model       | Read  | _(none)_                                                                                     |
| `list_groups`              | model       | Read  | `locationId?`                                                                                |
| `get_device`               | model + app | Read  | `uuid`                                                                                       |
| `get_device_state`         | model       | Read  | `uuid`                                                                                       |
| `get_device_state_by_mac`  | model       | Read  | `mac`                                                                                        |
| `get_location_state`       | model       | Read  | `locationId`                                                                                 |
| `get_device_documentation` | model       | Read  | `topic?`                                                                                     |
| `list_smarts`              | model       | Read  | _(none)_                                                                                     |
| `get_smart`                | model       | Read  | `id`                                                                                         |
| `list_smart_cmds`          | model       | Read  | `id`                                                                                         |
| `activate_smart`           | model       | Write | `id`                                                                                         |
| `list_scheduled_jobs`      | model       | Read  | _(none)_                                                                                     |
| `cancel_scheduled_job`     | model       | Write | `jobId`                                                                                      |
| `update_device`            | model       | Write | `uuid`, `label?`, `desc?`, `locationId?`, `groupId?`                                         |
| `delete_device`            | model       | Write | `uuid`                                                                                       |
| `control_device`           | model       | Write | `uuid`, `elementIds`, `command`                                                              |
| `control_device_simple`    | model       | Write | `uuid`, `power?`, `brightness?`, `kelvin?`, `temperature?`, `mode?`, `color?`, `elementId?`  |
| `control_devices_bulk`     | model       | Write | `uuids`, `power?`, `brightness?`, `kelvin?`, `temperature?`, `mode?`, `color?`, `elementId?` |
| `interactive_device`       | model + app | Read  | `uuid`                                                                                       |
| `_widget_list_devices`     | app only    | Read  | `locationId?`, `groupId?`                                                                    |
| `_widget_get_device`       | app only    | Read  | `uuid`                                                                                       |
| `_widget_control_device`   | app only    | Read  | `uuid`                                                                                       |

## Tool Routing Guide (for AI)

The description fields guide the model, but as context for agents writing tool code:

| User intent                                              | Correct tool            | Reason                           |
| -------------------------------------------------------- | ----------------------- | -------------------------------- |
| "control the light" / "adjust the AC" (vague)            | `interactive_device`    | Opens widget control panel       |
| "turn off the light" / "set brightness to 80" (specific) | `control_device_simple` | Direct command, no widget        |
| "turn off all lights" / "set all ACs to 26" (bulk)       | `control_devices_bulk`  | Same command across many devices |
| Raw protocol control (attrId + value arrays)             | `control_device`        | Power user / widget internal     |

## control_device_simple — Value Ranges & Conversion

Server-side validation enforces these ranges (throws `BadRequestException` with clear message on violation):

| Action            | Input range     | Notes                                       |
| ----------------- | --------------- | ------------------------------------------- |
| `set_brightness`  | 0–100 (percent) | Converted ×10 to 0–1000 before IoT API call |
| `set_kelvin`      | 0–65000         | Passed as-is                                |
| `set_temperature` | 15–30 (°C)      | Rounded to integer                          |
| `set_mode`        | 0–4             | 0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN        |

## Widget Tools (_widget_\* + interactive_device)

Widget tools return `structuredContent` with a `_view` hint so the widget SPA (`device-app.html`) knows which view to render:

| Tool                                            | `_view`       | Widget view      |
| ----------------------------------------------- | ------------- | ---------------- |
| `list_devices` / `_widget_list_devices`         | `'list'`      | Device list      |
| `get_device` / `_widget_get_device`             | `'dashboard'` | Device dashboard |
| `interactive_device` / `_widget_control_device` | `'control'`   | Control panel    |

Tools with `visibility: ['model', 'app']` show the widget in supporting clients (ChatGPT, Claude Desktop, VS Code Copilot via MCP Apps).
Tools with `visibility: ['app']` are invisible to the model — callable only from within the widget via `tools/call`.

Both `_meta.ui.resourceUri` (nested) and `_meta["ui/resourceUri"]` (flat) are present for cross-client compatibility.

## Executor Internals

`tool-executor.service.ts` uses a handler-map architecture:

### Helpers

| Helper                 | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `extractUserContext()` | Auth check + JWT decode → `{ userId, projectApiKey }`         |
| `requireAuthHeader()`  | Auth check only (no userId) → `projectApiKey`                 |
| `requireValue()`       | Throws `BadRequestException` if value is null/undefined       |
| `validateRange()`      | Throws `BadRequestException` with label if value out of range |
| `successResult()`      | Wrap data as `CallToolResult` with JSON text content          |
| `errorResult()`        | Sanitized error → `CallToolResult` with `isError` flag + hint |

### Dispatch

`toolHandlers` — A `Record<string, handler>` mapping tool names to handler methods. `executeTool()` does O(1) lookup by name.

### Auth Patterns

| Pattern            | Tools                                                                                                                                                                                                              | Helper used            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Full auth (userId) | fetch*user, search, fetch, list_devices, list_locations, list_groups, get_device, update_device, delete_device, control_device, control_device_simple, control_devices_bulk, smarts, interactive_device, widget*\* | `extractUserContext()` |
| Auth, no userId    | get_device_state, get_location_state, get_device_state_by_mac                                                                                                                                                      | `requireAuthHeader()`  |
| No auth            | get_device_documentation                                                                                                                                                                                           | _(none)_               |

## Registry Internals

`tool-registry.service.ts` — pure wiring:

1. `ALL_TOOL_DEFINITIONS` — const array of all 24 tool definition imports
2. `registerTools(mcpServer, projectApiKey)` — single `for...of` loop calling `mcpServer.registerTool()` for each definition, delegating execution to `ToolExecutorService.executeTool()`

No per-tool logic in registry. No copy-paste blocks.

## Anti-Patterns

- **Never** add tool logic directly in registry — registry only wires definitions to executor
- **Never** call `IotApiService` from anywhere except `tool-executor.service.ts`
- **Never** return full payloads from list endpoints — always strip to slim format
- **Never** skip the Zod `schema` field in tool definitions — SDK uses it for validation
- **Never** use `as any` or untyped callbacks — IotApiService returns typed data
- **Never** omit `_meta["ui/resourceUri"]` flat key when adding widget tools — required for Claude Desktop compat
