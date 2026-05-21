# AGENTS.md — Hierarchical Agent Knowledge

> **Generated**: 2026-05-20 | **Commit**: caed271 | **Branch**: feat/xiaozhi-custom-cloud

## Overview

Monorepo with two sibling services:

1. **`./` (root)** — NestJS MCP gateway that proxies AI tool calls to a Rogo IoT Cloud REST API. Multi-tenant via URL-embedded API keys (`/mcp/:projectApiKey`).
2. **`apps/xiaozhi-cloud/`** — Python FastAPI custom cloud for Xiaozhi AI devices. Speaks the Xiaozhi WebSocket + OTA protocol, runs a streaming LLM/TTS turn pipeline, and bridges tool calls back to the NestJS MCP server. See `apps/xiaozhi-cloud/AGENTS.md`.

**Stacks**: NestJS 10 + TypeScript (ES2021/CJS) + Redis (ioredis) + Zod v4 + Jest + BullMQ (root) · Python 3.11+ + FastAPI + Redis + edge-tts + pytest (xiaozhi-cloud)

## Structure

```
./
├── src/                        # NestJS MCP gateway
│   ├── main.ts                 # Bootstrap: CORS, logging middleware, validation pipe
│   ├── app.module.ts           # Root module (Config, Throttler, Http, all feature modules)
│   ├── health.controller.ts    # GET /health
│   ├── mcp/                    # MCP protocol — controller, sessions, server factory [→ AGENTS.md]
│   │   └── mcp-auth.controller.ts  # Subdomain OAuth routes under /mcp/:alias/* [→ AGENTS.md]
│   ├── tools/                  # 24 MCP tool definitions + executor [→ AGENTS.md]
│   ├── resources/              # 4 MCP resource definitions
│   ├── widgets/                # HTML widget SPA (device-app.html) served as ui://widget/* resource
│   ├── auth/                   # OAuth 2.1 flow (/authorize, /token, /register)
│   ├── discovery/              # .well-known OAuth discovery endpoints
│   ├── scheduler/              # BullMQ-based tool scheduler
│   ├── proxy/                  # IoT API proxy (IotApiService)
│   ├── redis/                  # @Global Redis client module
│   └── common/                 # Shared utils, constants, decorators
└── apps/
    └── xiaozhi-cloud/          # Python Xiaozhi custom cloud [→ AGENTS.md]
        ├── src/                # main.py, audio.py, services/runtime.py, integrations/*, session/*, protocol/*
        └── tests/              # pytest suite (40 passed, 1 skipped as of caed271)
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
| Xiaozhi custom cloud     | `apps/xiaozhi-cloud/`                                              | Sibling Python service; see `apps/xiaozhi-cloud/AGENTS.md`       |

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

## Xiaozhi integrations — two flavors

This repo has **two** ways to plug Xiaozhi devices into Rogo IoT. Don't confuse them:

1. **`bridge/xiaozhi/`** — per-user Python bridge that connects a Xiaozhi device to the **Xiaozhi-hosted cloud** and relays MCP tool calls back to our NestJS MCP server. Each user runs their own bridge. See **`docs/XIAOZHI_BRIDGE.md`**. Architecture: `bridge.py` (headless OAuth) → `mcp_pipe.py` (Xiaozhi WebSocket relay) → `bridge_server.py` (transparent stdio↔HTTP MCP proxy) → Rogo MCP server.

2. **`apps/xiaozhi-cloud/`** — **our own custom Xiaozhi cloud**. The device connects directly to us instead of Xiaozhi's cloud. We handle STT/LLM/TTS in-house and bridge tool calls to the sibling NestJS MCP server. See **`apps/xiaozhi-cloud/AGENTS.md`** and **`docs/XIAOZHI_CLOUD_PLAN.md`**. Architecture: device → `xiaozhi-cloud` (FastAPI, streaming LLM/TTS pipeline) → `iot-cloud-mcp` (NestJS) → Rogo IoT Cloud API.

## TODOs

- **Update stale resources**: `docs/ai-resources/` markdown files (state-guide, control-guide, device-attributes) still describe raw attrId/value protocol. Now that `get_device_state` returns human-readable keys and `control_device_simple` accepts the same keys, these resources are misleading. Options: (1) Rewrite the markdown files to describe the new format, or (2) Replace the static file-read resources with dynamic ones that auto-generate content from the same maps in `device-state.utils.ts` / `device-control.utils.ts`. Option 2 is preferred — never goes stale.
- **Translate list_smart_cmds output**: `list_smart_cmds` returns raw `cmds` in IoT protocol format (element→attribute arrays). Research the actual smart command structure from real API responses, then translate to human-readable keys matching `get_device_state` output. Low priority — not a core tool.
- **On-demand control reference tool**: A `get_control_reference` tool that returns a structured mapping of state keys → valid control values + ranges. Auto-derived from `device-control.utils.ts`. Called on-demand when the AI encounters a control error or is unsure about valid values — NOT as a mandatory pre-flight. Description should say: _"Call when unsure about valid values for a control attribute, or after a control error."_ The tool is complex because each attribute has different value types (enum strings, numeric ranges, nested objects) — needs careful per-attribute documentation generation.

## Notes

- **CI/CD**: NestJS — push to master → build Docker + deploy prod (`mcp.dash.id.vn:3001`). PR/branch → staging (`mcp-stag.dash.id.vn:3002`). xiaozhi-cloud — push to master → prod; push to `feat/xiaozhi-custom-cloud` only → staging (single-branch allowlist; revisit before merging that branch). VPS: `160.187.247.2`
- **Nginx**: All 4 configs have `proxy_buffering off`, `proxy_read_timeout 300s`, `Connection ''` for SSE streaming. Backups at `/tmp/*.bak`
- **e2e tests**: `test:e2e` script exists in package.json but `test/jest-e2e.json` config is missing — e2e not operational
- **ThrottlerModule**: Uses array syntax `forRoot([{ttl: 60000, limit: 100}])` — ttl appears to be ms (non-standard, typical is seconds)
- **Rate limiting**: Configurable via `ENABLE_RATE_LIMIT`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` env vars
- **Deploy script** (`scripts/deploy.sh`): Does NOT sync `.env` files — manage secrets on VPS separately

## Hierarchy

```
./AGENTS.md                            ← you are here
├── src/mcp/AGENTS.md                  ← MCP protocol, sessions, transport, subdomain auth
├── src/tools/AGENTS.md                ← tool definitions, registry, executor
└── apps/xiaozhi-cloud/AGENTS.md       ← Python Xiaozhi custom cloud (FastAPI, streaming LLM/TTS, MCP bridge)
```
