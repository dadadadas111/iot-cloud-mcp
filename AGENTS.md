# AGENTS.md — Hierarchical Agent Knowledge

> **Generated**: 2026-03-04 | **Commit**: 1cf4e51 | **Branch**: master

## Overview

NestJS MCP gateway that proxies AI tool calls to a Rogo IoT Cloud REST API. Multi-tenant via URL-embedded API keys (`/mcp/:projectApiKey`).

**Stack**: NestJS 10 + TypeScript (ES2021/CJS) + Redis (ioredis) + Zod v4 + Jest

**See `AGENT.md`** for full architecture, data flow, session internals, and environment variables.

## Structure

```
src/
├── main.ts                 # Bootstrap: CORS, logging middleware, validation pipe
├── app.module.ts           # Root module (Config, Throttler, Http, all feature modules)
├── health.controller.ts    # GET /health
├── mcp/                    # MCP protocol — controller, sessions, server factory [→ AGENTS.md]
├── tools/                  # 15 MCP tool definitions + executor [→ AGENTS.md]
├── resources/              # 4 MCP resource definitions (overview, state-guide, control-guide, device-attributes)
├── auth/                   # OAuth 2.1 flow (/authorize, /token, /register)
├── discovery/              # .well-known OAuth discovery endpoints
├── proxy/                  # IoT API proxy (IotApiService — all HTTP calls to Rogo Cloud)
├── redis/                  # @Global Redis client module (ioredis, retry, cleanup)
└── common/                 # Shared utils, constants, decorators
    ├── constants/          # product.constants.ts (DEVICE_TYPE, BRAND, OWNERSHIP maps)
    ├── utils/              # jwt.utils.ts, product.utils.ts (resolveDeviceType, decodeProductId)
    ├── interfaces/         # Shared interfaces
    └── decorators/         # api-key.decorator.ts
```

## Where to Look

| Task                    | Location                                                        | Notes                                                           |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Add MCP tool            | `src/tools/definitions/` → `tool-registry` → `iot-api.service`  | See `src/tools/AGENTS.md`                                       |
| Add MCP resource        | `src/resources/definitions/` → `resource-registry.service.ts`   | Same pattern as tools                                           |
| Modify session behavior | `src/mcp/services/` (session-manager, redis-session.repository) | See `src/mcp/AGENTS.md`                                         |
| Change auth flow        | `src/auth/auth.controller.ts` + `services/oauth.service.ts`     | OAuth 2.1, proxies to IoT Cloud `/login`                        |
| Change API proxy        | `src/proxy/services/iot-api.service.ts`                         | Single file, all HTTP calls                                     |
| Device type resolution  | `src/common/utils/product.utils.ts`                             | Always use `resolveDeviceType()`, NOT `decodeProductId()` alone |
| Redis config/keys       | `src/redis/redis.module.ts` + `redis.constants.ts`              | `REDIS_CLIENT` injection token, key prefixes                    |
| Docker/deploy           | `docker-compose*.yml`, `Dockerfile`, `.github/workflows/`       | See `docs/DEPLOYMENT.md`                                        |
| Environment vars        | `.env.example`                                                  | All vars documented there; use `ConfigService.get<T>()` in code |

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
- **Transport**: `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` (NOT SSE)
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

## Notes

- **CI/CD**: Push to master → build Docker + deploy prod (`mcp.dash.id.vn:3001`). PR → staging (`mcp-stag.dash.id.vn:3002`). VPS: `160.187.247.2`
- **e2e tests**: `test:e2e` script exists in package.json but `test/jest-e2e.json` config is missing — e2e not operational
- **ThrottlerModule**: Uses array syntax `forRoot([{ttl: 60000, limit: 100}])` — ttl appears to be ms (non-standard, typical is seconds)
- **Rate limiting**: Configurable via `ENABLE_RATE_LIMIT`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` env vars
- **Deploy script** (`scripts/deploy.sh`): Does NOT sync `.env` files — manage secrets on VPS separately

## Hierarchy

```
./AGENTS.md              ← you are here
├── src/mcp/AGENTS.md    ← protocol, sessions, transport
└── src/tools/AGENTS.md  ← tool definitions, registry, executor
```
