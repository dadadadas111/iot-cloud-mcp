# AGENT.md — iot-cloud-mcp Codebase Knowledge

> **Purpose**: Comprehensive codebase guide for AI agents and developers.
> **Last updated**: 2026-03-02 (Redis session store implementation complete)

## What This Project Is

**iot-cloud-mcp** is a NestJS MCP (Model Context Protocol) server that acts as a **proxy gateway** between MCP clients (ChatGPT, Claude, etc.) and the Rogo IoT Cloud REST API. It translates natural language tool calls from AI assistants into structured API requests against the IoT platform.

**Key concept**: Multi-tenant — each project has its own API key embedded in the URL (`/mcp/:projectApiKey`). Sessions are per-project, per-user.

## Architecture Overview

```
MCP Client (ChatGPT/Claude)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  McpController  (POST /mcp/:projectApiKey)          │
│    ├─ JWT decode (Bearer token → userId)            │
│    ├─ Session get/create (Redis + local cache)      │
│    └─ Delegate to McpProtocolHandlerService         │
├─────────────────────────────────────────────────────┤
│  McpProtocolHandlerService                          │
│    ├─ Routes JSON-RPC methods (tools/list, etc.)    │
│    └─ Calls ToolExecutorService for tool execution  │
├─────────────────────────────────────────────────────┤
│  ToolExecutorService → IotApiService                │
│    ├─ 15 registered MCP tools                       │
│    └─ Proxies to Rogo IoT Cloud REST API            │
├─────────────────────────────────────────────────────┤
│  Redis (session metadata)  +  Local Map (McpServer) │
└─────────────────────────────────────────────────────┘
    │
    ▼
Rogo IoT Cloud REST API (openapi.rogo.com.vn)
```

## Module Map

```
AppModule
├── ConfigModule          (@nestjs/config, global, reads .env)
├── ThrottlerModule       (rate limiting: 100 req/min default)
├── HttpModule            (@nestjs/axios, 30s timeout)
├── CommonModule          (shared utils, decorators, constants)
│   ├── constants/        (app-wide constants)
│   ├── decorators/       (custom decorators)
│   ├── interfaces/       (shared interfaces)
│   └── utils/            (jwt.utils.ts — decodeJwt)
├── RedisModule           (@Global, ioredis client provider)
│   ├── redis.constants.ts  (REDIS_CLIENT token, key prefixes)
│   └── redis.module.ts     (provider factory, retry, cleanup)
├── ProxyModule           (IoT API proxy layer)
│   ├── services/iot-api.service.ts  (HTTP calls to Old API)
│   └── dto/              (request/response DTOs)
├── DiscoveryModule       (OAuth .well-known endpoints)
│   └── discovery.controller.ts
├── AuthModule            (OAuth 2.1 flow)
│   ├── auth.controller.ts  (/authorize, /token, /register)
│   ├── services/           (auth logic)
│   ├── dto/                (auth DTOs)
│   └── templates/          (HTML login page)
├── ToolsModule           (MCP tool definitions + executor)
│   ├── definitions/      (15 .tool.ts files)
│   ├── services/
│   │   ├── tool-registry.service.ts   (registers all tools)
│   │   └── tool-executor.service.ts   (executes tool calls)
│   └── tools.module.ts
├── ResourcesModule       (MCP resource definitions)
│   ├── definitions/
│   └── services/
└── McpModule             (MCP protocol core)
    ├── mcp.controller.ts                    (HTTP entry point)
    ├── dto/mcp-session.dto.ts               (McpSession, RedisSessionData)
    └── services/
        ├── session-manager.service.ts       (Redis + local cache)
        ├── redis-session.repository.ts      (Redis data access layer)
        ├── mcp-server.factory.ts            (creates McpServer per tenant)
        └── mcp-protocol-handler.service.ts  (JSON-RPC routing)
```

## Data Flow (Request Lifecycle)

1. **Client** sends `POST /mcp/:projectApiKey` with Bearer token + JSON-RPC body
2. **McpController** validates Bearer token, decodes JWT to get `userId`
3. **SessionManager** looks up session in Redis (metadata) + local cache (McpServer)
   - Cache miss → `McpServerFactory.createServer()` recreates with tools/resources
4. **McpProtocolHandlerService** routes the JSON-RPC method:
   - `tools/list` → returns registered tool definitions
   - `tools/call` → delegates to ToolExecutorService
   - `resources/list`, `resources/read` → resource handling
5. **ToolExecutorService** runs the specific tool logic
6. **IotApiService** makes HTTP request to `IOT_API_BASE_URL` with project API key + userId
7. Response flows back as MCP `content: [{ type: 'text', text: ... }]`

## Session Architecture (Redis + Local Cache)

**Why dual storage?** `McpServer` instances from `@modelcontextprotocol/sdk` are non-serializable (contain functions, event emitters). Redis stores only serializable metadata; local `Map<string, McpServer>` caches live instances.

```
Redis (persistent):
  Key: mcp:session:{projectApiKey}:{sessionId}  →  RedisSessionData (JSON)
  Key: mcp:project-sessions:{projectApiKey}     →  SET of sessionIds
  TTL: MCP_SESSION_TTL seconds (default 3600)

Local Map (ephemeral):
  Key: {projectApiKey}:{sessionId}  →  McpServer instance
```

**On cache miss**: If Redis has the session but local Map doesn't (e.g., after server restart), `McpServerFactory.createServer()` rebuilds the McpServer with all tools/resources re-registered. The session continues seamlessly.

**Stale cleanup**: `RedisSessionRepository.getProjectSessionIds()` verifies each SET member against its Redis key via pipeline EXISTS, pruning stale entries.

## MCP Tools (15 total)

All in `src/tools/definitions/`. Each file exports: `{ name, description, schema (zod), metadata, execute? }`

| Tool                       | Purpose                           |
| -------------------------- | --------------------------------- |
| `fetch_user`               | Get current user profile          |
| `search`                   | Search across devices/locations   |
| `fetch`                    | Generic data fetch                |
| `list_devices`             | List all devices for project      |
| `list_locations`           | List all locations                |
| `list_groups`              | List device groups                |
| `get_device`               | Get single device details         |
| `update_device`            | Update device properties          |
| `delete_device`            | Delete a device                   |
| `get_device_state`         | Get device state by ID            |
| `get_location_state`       | Get location state                |
| `get_device_state_by_mac`  | Get device state by MAC address   |
| `control_device`           | Send control command (full)       |
| `control_device_simple`    | Send control command (simplified) |
| `get_device_documentation` | Get device documentation          |

## Key Patterns & Conventions

### Configuration

- All config via `ConfigService.get<T>('KEY', defaultValue)` — never raw `process.env`
- `.env` file loaded by `ConfigModule.forRoot({ isGlobal: true })`

### Error Handling

- JSON-RPC 2.0 error format in MCP responses: `{ jsonrpc: '2.0', error: { code, message }, id }`
- Standard NestJS exceptions (`UnauthorizedException`, etc.) for non-MCP endpoints
- MCP error codes: `-32001` (Unauthorized), `-32603` (Internal error)

### Tool Definitions

```typescript
// Pattern: src/tools/definitions/{name}.tool.ts
export const toolDefinition = {
  name: 'tool_name',
  description: 'What it does',
  schema: z.object({ param: z.string() }),
  metadata: {
    /* ... */
  },
};
```

### Dependency Injection

- `REDIS_CLIENT` token for ioredis client injection
- `McpServerFactory`, `RedisSessionRepository` as standard `@Injectable()` services
- `RedisModule` is `@Global()` — available everywhere without importing

### TypeScript

- Target: ES2021, Module: CommonJS
- `strictNullChecks: true`, `noImplicitAny: false`
- Path alias: `@/*` → `src/*`
- Zod v4 for schema validation (tool parameters)

## File Structure (Key Files)

```
├── .env.example                    # All environment variables (documented)
├── .github/workflows/
│   ├── docker-build.yml            # CI/CD: push to main → build → deploy prod
│   └── docker-build-staging.yml    # CI/CD: PR to main → build → deploy staging
├── docker-compose.yml              # Production compose (app + redis)
├── docker-compose.staging.yml      # Staging compose (app + redis-staging)
├── Dockerfile                      # node:18-alpine, npm build, prune
├── scripts/
│   └── deploy.sh                   # Deploy configs to VPS (backup + sync + restart)
├── docs/
│   ├── DEPLOYMENT.md               # Ops runbook (VPS, CI/CD, Redis, troubleshooting)
│   ├── EXTERNAL-API.md             # IoT Cloud REST API reference
│   ├── feature-plan/               # Feature planning docs
│   └── ai-resources/               # AI-related resources
├── src/
│   ├── main.ts                     # Bootstrap: CORS, logging middleware, validation pipe
│   ├── app.module.ts               # Root module imports
│   ├── health.controller.ts        # Health check endpoint
│   ├── redis/                      # Redis client module
│   ├── mcp/                        # MCP protocol core
│   ├── tools/                      # 15 MCP tool definitions
│   ├── resources/                  # MCP resource definitions
│   ├── auth/                       # OAuth 2.1 flow
│   ├── discovery/                  # .well-known endpoints
│   ├── proxy/                      # IoT API proxy
│   └── common/                     # Shared utilities
└── config/
    └── firebase-service-account.example.json
```

## Environment Variables

| Variable            | Required       | Default                 | Description                                    |
| ------------------- | -------------- | ----------------------- | ---------------------------------------------- |
| `NODE_ENV`          | No             | `development`           | Environment mode                               |
| `PORT`              | No             | `3001`                  | Server port                                    |
| `HOST`              | No             | `0.0.0.0`               | Bind address                                   |
| `IOT_API_BASE_URL`  | **Yes**        | —                       | Rogo IoT Cloud API base URL                    |
| `IOT_API_TIMEOUT`   | No             | `30000`                 | API request timeout (ms)                       |
| `BASE_URL`          | **Yes** (prod) | `http://localhost:3001` | This server's public URL (for OAuth discovery) |
| `REDIS_HOST`        | **Yes**        | `localhost`             | Redis hostname                                 |
| `REDIS_PORT`        | No             | `6379`                  | Redis port                                     |
| `REDIS_PASSWORD`    | No             | _(empty)_               | Redis password                                 |
| `REDIS_DB`          | No             | `0`                     | Redis database number                          |
| `MCP_SESSION_TTL`   | No             | `3600`                  | Session TTL in seconds                         |
| `ENABLE_CORS`       | No             | `true`                  | Enable CORS                                    |
| `CORS_ORIGINS`      | No             | `*`                     | Allowed origins                                |
| `ENABLE_RATE_LIMIT` | No             | `true`                  | Enable rate limiting                           |
| `RATE_LIMIT_MAX`    | No             | `100`                   | Max requests per window                        |
| `RATE_LIMIT_WINDOW` | No             | `60000`                 | Rate limit window (ms)                         |
| `LOG_LEVEL`         | No             | `info`                  | Log level                                      |

## Development

```bash
# Install
npm install

# Dev server (hot reload)
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Tests
npm test

# Type check (no emit)
npx tsc --noEmit

# Lint
npm run lint

# Format
npm run format
```

## Dependencies (Key)

| Package                     | Version | Purpose                         |
| --------------------------- | ------- | ------------------------------- |
| `@modelcontextprotocol/sdk` | ^1.26.0 | MCP protocol server SDK         |
| `@nestjs/core`              | ^10.0.0 | NestJS framework                |
| `@nestjs/config`            | ^3.0.0  | Config/env management           |
| `@nestjs/axios`             | ^3.0.0  | HTTP client for API proxy       |
| `ioredis`                   | ^5.9.3  | Redis client                    |
| `zod`                       | ^4.3.6  | Schema validation (tool params) |
| `jsonwebtoken`              | ^9.0.3  | JWT decode                      |
| `uuid`                      | ^8.3.2  | Session ID generation           |

## Testing

- **Framework**: Jest + ts-jest
- **Test files**: `*.spec.ts` colocated with source
- **Existing tests**:
  - `src/mcp/services/redis-session.repository.spec.ts` — Redis repository unit tests
  - `src/mcp/services/session-manager.service.spec.ts` — Session manager unit tests
- **Run**: `npm test` or `npx jest`

## Common Tasks (for agents)

### Adding a new MCP tool

1. Create `src/tools/definitions/{tool-name}.tool.ts` following existing pattern
2. Export `{ name, description, schema, metadata }`
3. Register in `src/tools/services/tool-registry.service.ts`
4. Add proxy endpoint in `src/proxy/services/iot-api.service.ts` if needed

### Modifying session behavior

- Session metadata: `src/mcp/dto/mcp-session.dto.ts` (`RedisSessionData`)
- Redis operations: `src/mcp/services/redis-session.repository.ts`
- Session lifecycle: `src/mcp/services/session-manager.service.ts`
- Redis config: `src/redis/redis.module.ts`, `src/redis/redis.constants.ts`

### Updating Docker/deployment

- Compose files: `docker-compose.yml` (prod), `docker-compose.staging.yml` (staging)
- Deploy to VPS: `./scripts/deploy.sh prod|staging [restart]`
- CI/CD: `.github/workflows/docker-build.yml` (prod), `docker-build-staging.yml` (staging)
- See `docs/DEPLOYMENT.md` for full ops runbook
