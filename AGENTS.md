# AGENTS.md — Hierarchical Agent Knowledge

> **Project**: iot-cloud-mcp (NestJS MCP Gateway for Rogo IoT Cloud)
> **Updated**: 2026-03-02

## Quick Orientation (ALL agents read this)

This is a **NestJS MCP server** that proxies AI tool calls to a Rogo IoT Cloud REST API. Multi-tenant via URL-embedded API keys.

**Stack**: NestJS 10 + TypeScript (ES2021/CJS) + Redis (ioredis) + Zod v4 + Jest

**Entry point**: `src/main.ts` → `AppModule` → `McpController` (POST `/mcp/:projectApiKey`)

**Key directories**:

- `src/mcp/` — MCP protocol handling, sessions, server factory
- `src/tools/` — 15 MCP tool definitions + executor
- `src/redis/` — Redis client module (global)
- `src/auth/` — OAuth 2.1 flow
- `src/proxy/` — IoT API proxy layer
- `src/common/` — Shared utils, decorators

**Config pattern**: `ConfigService.get<T>('KEY', default)` — never raw `process.env`

**See `AGENT.md`** for full architecture, module map, and data flow.

---

## Layer: Protocol (src/mcp/)

### Ownership

MCP protocol handling — JSON-RPC routing, session management, server lifecycle.

### Key Files

| File                                       | Purpose                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `mcp.controller.ts`                        | HTTP entry point. JWT decode, session get/create, delegates to handler |
| `services/mcp-protocol-handler.service.ts` | Routes JSON-RPC methods to tools/resources                             |
| `services/session-manager.service.ts`      | Session CRUD. Redis metadata + local McpServer cache                   |
| `services/redis-session.repository.ts`     | Redis data access layer. CRUD, TTL, stale pruning                      |
| `services/mcp-server.factory.ts`           | Creates `McpServer` per tenant with tools/resources registered         |
| `dto/mcp-session.dto.ts`                   | `McpSession` interface, `RedisSessionData` interface                   |

### Architecture Notes

- **Dual storage**: Redis stores serializable `RedisSessionData` (JSON). Local `Map<string, McpServer>` caches non-serializable server instances. Cache miss → factory recreates.
- **Redis keys**: `mcp:session:{projectApiKey}:{sessionId}` (string), `mcp:project-sessions:{projectApiKey}` (SET)
- **TTL**: `MCP_SESSION_TTL` env var (seconds, default 3600)
- **Stale pruning**: `getProjectSessionIds()` verifies SET members via pipeline EXISTS, removes stale entries

### Tests

- `redis-session.repository.spec.ts` — Mock ioredis, tests CRUD + stale pruning
- `session-manager.service.spec.ts` — Mock repository + factory, tests session lifecycle

---

## Layer: Tools (src/tools/)

### Ownership

MCP tool definitions, registration, and execution.

### Key Files

| File                                | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `tools.module.ts`                   | NestJS module wiring                   |
| `services/tool-registry.service.ts` | Registers all 15 tools with McpServer  |
| `services/tool-executor.service.ts` | Executes tool calls via IotApiService  |
| `definitions/*.tool.ts`             | Individual tool definitions (15 files) |

### Tool Definition Pattern

```typescript
export const toolDefinition = {
  name: 'tool_name',
  description: 'Human-readable description',
  schema: z.object({ param: z.string().describe('...') }),
  metadata: {
    /* ... */
  },
};
```

### Adding a New Tool

1. Create `src/tools/definitions/{name}.tool.ts`
2. Register in `tool-registry.service.ts`
3. Add proxy method in `src/proxy/services/iot-api.service.ts` if needed
4. Tool is auto-available via `tools/list` and `tools/call`

---

## Layer: Auth (src/auth/)

### Ownership

OAuth 2.1 flow for MCP client authentication.

### Key Files

| File                 | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `auth.controller.ts` | `/authorize`, `/token`, `/register` endpoints |
| `services/`          | Auth logic, token exchange                    |
| `dto/`               | Auth request/response DTOs                    |
| `templates/`         | HTML login page template                      |

### Flow

1. MCP client discovers auth via `.well-known` (DiscoveryModule)
2. Client redirects user to `/authorize` → HTML login form
3. User submits credentials → forwarded to IoT Cloud API `/login`
4. Success → authorization code returned
5. Client exchanges code at `/token` → JWT tokens returned
6. Bearer token used for all subsequent `/mcp/:projectApiKey` requests

---

## Layer: Proxy (src/proxy/)

### Ownership

HTTP proxy to Rogo IoT Cloud REST API.

### Key Files

| File                          | Purpose                       |
| ----------------------------- | ----------------------------- |
| `proxy.module.ts`             | Module wiring                 |
| `services/iot-api.service.ts` | All HTTP calls to the Old API |
| `dto/`                        | Request/response types        |

### Notes

- Uses `@nestjs/axios` (`HttpService`)
- Base URL: `IOT_API_BASE_URL` env var
- Timeout: `IOT_API_TIMEOUT` env var (default 30000ms)
- All requests include project API key + userId extracted from JWT

---

## Layer: Infrastructure

### Redis (src/redis/)

- `redis.module.ts` — `@Global()` NestJS module providing ioredis client
- `redis.constants.ts` — `REDIS_CLIENT` injection token, key prefixes
- Retry strategy: exponential backoff, max 10 retries
- `OnModuleDestroy`: graceful disconnect

### Docker

- `Dockerfile` — node:18-alpine, multi-stage-ish (build → prune → run as non-root)
- `docker-compose.yml` — Production (app + redis)
- `docker-compose.staging.yml` — Staging (app + redis-staging)

### CI/CD

- `.github/workflows/docker-build.yml` — Push to main → build + deploy prod
- `.github/workflows/docker-build-staging.yml` — PR to main → build + deploy staging
- Deploy via SSH (appleboy/ssh-action) → docker pull + compose up

### Deployment

- `scripts/deploy.sh` — Manual deploy with backup/rollback
- See `docs/DEPLOYMENT.md` for full runbook

---

## Conventions & Anti-patterns

### DO

- Use `ConfigService.get<T>()` for all config
- Follow existing tool definition pattern exactly
- Use Zod v4 for schema definitions
- Keep test files colocated (`*.spec.ts` next to source)
- Use NestJS DI — never manually instantiate services

### DON'T

- Never use `process.env` directly
- Never `as any` or `@ts-ignore`
- Never import from `dist/` — only `src/`
- Never expose Redis keys or session IDs in HTTP responses (except `X-MCP-Session-Id` header)
- Never modify n8n services on VPS (port 5678, separate stack)
