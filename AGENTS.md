# AGENTS.md — Hierarchical Agent Knowledge

> **Generated**: 2026-03-26 | **Commit**: 58a6078 | **Branch**: feature-staging

## Overview

NestJS MCP gateway that proxies AI tool calls to a Rogo IoT Cloud REST API. Multi-tenant via URL-embedded API keys (`/mcp/:projectApiKey`).

**Stack**: NestJS 10 + TypeScript (ES2021/CJS) + Redis (ioredis) + Zod v4 + Jest + BullMQ

**See `AGENT.md`** for full architecture, data flow, session internals, and environment variables.

## Structure

```
src/
├── main.ts                 # Bootstrap: CORS, logging middleware, validation pipe
├── app.module.ts           # Root module (Config, Throttler, Http, all feature modules)
├── health.controller.ts    # GET /health
├── mcp/                    # MCP protocol — controller, sessions, server factory [→ AGENTS.md]
│   └── mcp-auth.controller.ts  # Subdomain OAuth routes under /mcp/:alias/* [→ AGENTS.md]
├── tools/                  # 24 MCP tool definitions + executor [→ AGENTS.md]
├── resources/              # 4 MCP resource definitions (overview, state-guide, control-guide, device-attributes)
├── widgets/                # HTML widget SPA (device-app.html) served as ui://widget/* resource
├── auth/                   # OAuth 2.1 flow (/authorize, /token, /register)
├── discovery/              # .well-known OAuth discovery endpoints
├── scheduler/              # BullMQ-based tool scheduler (delayed/absolute-time tool execution)
├── proxy/                  # IoT API proxy (IotApiService — all HTTP calls to Rogo Cloud)
├── redis/                  # @Global Redis client module (ioredis, retry, cleanup)
└── common/                 # Shared utils, constants, decorators
    ├── constants/          # product.constants.ts (DEVICE_TYPE, BRAND, OWNERSHIP maps)
    ├── utils/              # jwt.utils.ts, product.utils.ts, url.utils.ts, error.utils.ts
    ├── interfaces/         # Shared interfaces
    └── decorators/         # api-key.decorator.ts
```

## Where to Look

| Task                     | Location                                                           | Notes                                                            |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Add MCP tool             | `src/tools/definitions/` → `tool-registry` → `iot-api.service`     | See `src/tools/AGENTS.md`                                        |
| Add MCP resource         | `src/resources/definitions/` → `resource-registry.service.ts`      | Same pattern as tools                                            |
| Modify session behavior  | `src/mcp/services/` (session-manager, redis-session.repository)    | See `src/mcp/AGENTS.md`                                          |
| Change auth flow         | `src/auth/auth.controller.ts` + `services/oauth.service.ts`        | OAuth 2.1, proxies to IoT Cloud `/login`                         |
| Subdomain auth/discovery | `src/mcp/mcp-auth.controller.ts`                                   | Mirrors auth routes under /mcp/:alias for wildcard nginx         |
| Change API proxy         | `src/proxy/services/iot-api.service.ts`                            | Single file, all HTTP calls                                      |
| Device type resolution   | `src/common/utils/product.utils.ts`                                | Always use `resolveDeviceType()`, NOT `decodeProductId()` alone  |
| Build subdomain URL      | `src/common/utils/url.utils.ts` — `buildSubdomainUrl(base, alias)` | localhost/IP passthrough; prefixes alias to hostname             |
| Redis config/keys        | `src/redis/redis.module.ts` + `redis.constants.ts`                 | `REDIS_CLIENT` injection token, key prefixes                     |
| Scheduled tool execution | `src/scheduler/`                                                   | BullMQ. Tools: list_scheduled_jobs, cancel_scheduled_job         |
| Widget HTML (device UI)  | `views/widgets/device-app.html`                                    | Single-file SPA. Uses MCP Apps bridge (\_bridge) for all clients |
| Docker/deploy            | `docker-compose*.yml`, `Dockerfile`, `.github/workflows/`          | See `docs/DEPLOYMENT.md`                                         |
| Environment vars         | `.env.example`                                                     | All vars documented there; use `ConfigService.get<T>()` in code  |

## Conventions

- **Config**: `ConfigService.get<T>('KEY', default)` — never raw `process.env`
- **DI**: NestJS standard. `REDIS_CLIENT` token for ioredis. `RedisModule` is `@Global()`
- **Schemas**: Zod v4 for tool parameter validation
- **Tests**: Colocated `*.spec.ts` next to source. Jest + ts-jest. NestJS `Test.createTestingModule` pattern
- **TS**: `strictNullChecks: true`, `noImplicitAny: false`. Path alias `@/*` → `src/*`
- **Formatting**: Prettier (singleQuote, trailingComma: all, semi, tabWidth: 2, printWidth: 100)
- **Lint**: ESLint + @typescript-eslint + prettier plugin. Relaxed: no explicit return types, no-explicit-any off
- **Build**: `nest build` uses webpack (`nest-cli.json`). Dockerfile: node:18-alpine, non-root user
- **Response shaping**: List endpoints return slim payloads (save AI tokens). Only `get_device` returns full payload

## Anti-Patterns (This Project)

- **Never** use `process.env` directly — use `ConfigService`
- **Never** `as any` or `@ts-ignore` or `@ts-expect-error`
- **Never** import from `dist/` — only `src/`
- **Never** expose Redis keys in HTTP responses (except `X-MCP-Session-Id` header)
- **Never** touch n8n services on VPS (port 5678, separate stack)
- **Never** manually instantiate services — use NestJS DI
- **Never** rely on `decodeProductId()` alone — use `resolveDeviceType()` (reads `productInfos[1]`)
- **Never** include `userId`, `extraInfo`, `createdAt` in list endpoint responses

## Unique Styles

- **Dual session storage**: Redis (serializable metadata + TTL) + local `Map<string, McpServer>` (non-serializable instances). Cache miss → factory recreates server with tools/resources re-registered
- **Tool definition pattern**: Each tool is a standalone `.tool.ts` file exporting `{ name, description, schema (zod), metadata }`
- **Multi-tenant via URL**: `projectApiKey` in path param, forwarded as `x-header-apikey` to IoT API
- **Subdomain routing**: Nginx rewrites `{alias}.domain.com/*` → `/mcp/{alias}/*`. `McpAuthController` serves OAuth + discovery at these paths. `buildSubdomainUrl()` constructs public-facing subdomain URLs for metadata
- **Transport**: `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` (NOT SSE)
- **MCP Apps widget**: `views/widgets/device-app.html` is a single-file SPA served as `ui://widget/device-app.html` with MIME `text/html;profile=mcp-app`. Uses `_bridge` (custom JSON-RPC postMessage, compatible with ChatGPT, Claude Desktop, VS Code Copilot). Tool calls use `tools/call` method
- **Widget tool routing**: Vague control requests → `interactive_device` (opens widget). Specific commands → `control_device_simple`. Raw protocol → `control_device`
- **Naming**: API field is `productId` (not `modelId`). Constants use this term consistently

## Commands

```bash
npm run start:dev        # Dev server (hot reload)
npm run build            # Production build (webpack via nest-cli)
npm run start:prod       # node dist/main
npm test                 # Jest unit tests
npx tsc --noEmit         # Type check
npm run lint             # ESLint
npm run format           # Prettier
```

## TODOs

- **Device attribute reference tool**: `docs/ai-resources/` resources (state-guide, control-guide, device-attributes) are becoming stale as we abstract raw attrIds behind human-readable keys. Consider a dedicated `get_device_control_reference` tool that returns a structured, always-current mapping of state keys → valid control values + ranges (e.g., `power: "on"|"off"`, `brightness: 0-100`, `mode: "AUTO"|"COOL"|...`). Called on-demand when the AI is confused about valid values or encounters a control error — not as a mandatory pre-flight. The tool content should be auto-derived from the same maps used in `device-state.utils.ts` and `device-control.utils.ts`.

## Notes

- **CI/CD**: Push to master → build Docker + deploy prod (`mcp.dash.id.vn:3001`). PR/branch → staging (`mcp-stag.dash.id.vn:3002`). VPS: `160.187.247.2`
- **Nginx**: All 4 configs have `proxy_buffering off`, `proxy_read_timeout 300s`, `Connection ''` for SSE streaming. Backups at `/tmp/*.bak`
- **e2e tests**: `test:e2e` script exists in package.json but `test/jest-e2e.json` config is missing — e2e not operational
- **ThrottlerModule**: Uses array syntax `forRoot([{ttl: 60000, limit: 100}])` — ttl appears to be ms (non-standard, typical is seconds)
- **Rate limiting**: Configurable via `ENABLE_RATE_LIMIT`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` env vars
- **Deploy script** (`scripts/deploy.sh`): Does NOT sync `.env` files — manage secrets on VPS separately

## Hierarchy

```
./AGENTS.md                  ← you are here
├── src/mcp/AGENTS.md        ← protocol, sessions, transport, subdomain auth
└── src/tools/AGENTS.md      ← tool definitions, registry, executor
```
