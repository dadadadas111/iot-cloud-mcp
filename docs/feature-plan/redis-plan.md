# Redis Session Management Implementation Plan

## Context

The `SessionManagerService` currently uses in-memory `Map<string, Map<string, McpSession>>` storage for MCP sessions. This means sessions are lost on server restart, cannot be shared across multiple instances, and memory grows unbounded under load. The project already has `ioredis` as a dependency and Redis env vars (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`) defined in `docker-compose.yml` and `.env.example`.

## Goals

1. Replace in-memory session storage with Redis
2. Maintain the existing `SessionManagerService` public API (no controller changes)
3. Support horizontal scaling (multiple server instances sharing sessions)
4. Automatic session expiration via Redis TTL
5. Graceful fallback / clear error handling when Redis is unavailable

## Non-Goals

- Migrating tool/resource registries to Redis (these are stateless per-request)
- Changing the MCP protocol handler or controller layer
- Redis Cluster or Sentinel setup (single-instance Redis is sufficient for current scale)

---

## Architecture

### Key Design Decision: What Gets Stored in Redis

The current `McpSession` interface holds a `McpServer` instance (a live SDK object with registered tools/resources). This **cannot be serialized** to Redis. The solution is to split session storage into two concerns:

| Concern                                                                                | Storage                     | Rationale                                            |
| -------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| Session metadata (`sessionId`, `projectApiKey`, `userId`, `createdAt`, `lastActivity`) | Redis                       | Serializable, shared across instances                |
| `McpServer` instance                                                                   | In-memory Map (local cache) | Non-serializable, must be reconstructed per-instance |

When a request arrives with an existing `sessionId`:

1. Look up session metadata in Redis → confirms the session is valid
2. Look up `McpServer` in local cache → if missing, recreate via `McpServerFactory`
3. Update `lastActivity` in Redis

### Redis Key Schema

```
mcp:session:{projectApiKey}:{sessionId}  →  JSON string of RedisSessionData
mcp:project-sessions:{projectApiKey}     →  Redis SET of sessionIds
```

- `mcp:session:*` keys use Redis TTL (`MCP_SESSION_TTL`, default 3600s) for automatic expiration
- `mcp:project-sessions:*` enables listing/counting sessions per project (for `getStats()`)

### Data Model

```typescript
// Stored in Redis (serializable subset)
interface RedisSessionData {
  sessionId: string;
  projectApiKey: string;
  userId: string;
  createdAt: string; // ISO 8601
  lastActivity: string; // ISO 8601
}

// Full session (extends with in-memory server)
interface McpSession {
  sessionId: string;
  projectApiKey: string;
  server: McpServer; // In-memory only
  userId: string;
  createdAt: Date;
  lastActivity: Date;
}
```

---

## Implementation Steps

### Step 1: Create Redis Module

**File: `src/redis/redis.module.ts`**

- Create a NestJS module that provides a configured `ioredis` client
- Use `ConfigService` to read `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- Export the Redis client as an injectable provider (`REDIS_CLIENT` token)
- Handle connection errors with logging (don't crash the app)

**File: `src/redis/redis.constants.ts`**

- Define injection token `REDIS_CLIENT`
- Define key prefix constants (`MCP_SESSION_PREFIX`, `MCP_PROJECT_SESSIONS_PREFIX`)

### Step 2: Create Redis Session Repository

**File: `src/mcp/services/redis-session.repository.ts`**

Encapsulate all Redis operations for session data:

```typescript
@Injectable()
export class RedisSessionRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(data: RedisSessionData, ttlSeconds: number): Promise<void>;
  async get(projectApiKey: string, sessionId: string): Promise<RedisSessionData | null>;
  async delete(projectApiKey: string, sessionId: string): Promise<boolean>;
  async updateLastActivity(projectApiKey: string, sessionId: string): Promise<void>;
  async getProjectSessionIds(projectApiKey: string): Promise<string[]>;
  async getStats(): Promise<{ totalSessions: number; projectCounts: Record<string, number> }>;
}
```

Implementation details:

- `save()`: Use `redis.set()` with `EX` (TTL) + add sessionId to project SET
- `get()`: Use `redis.get()` + `JSON.parse()`
- `delete()`: Use `redis.del()` + `redis.srem()` from project SET
- `updateLastActivity()`: Update JSON + reset TTL with `redis.set(..., 'EX', ttl)`
- Use pipeline/multi where multiple commands are needed atomically

### Step 3: Refactor SessionManagerService

**File: `src/mcp/services/session-manager.service.ts`**

Modify the existing service to use Redis for metadata and local Map for `McpServer` instances:

```typescript
@Injectable()
export class SessionManagerService {
  // Local cache for non-serializable McpServer instances
  private readonly serverCache: Map<string, McpServer> = new Map();

  constructor(
    private readonly redisRepo: RedisSessionRepository,
    private readonly serverFactory: McpServerFactory,
    private readonly configService: ConfigService,
  ) {}

  async createSession(projectApiKey: string, userId: string, server: McpServer): Promise<string>;
  async getSession(projectApiKey: string, sessionId: string): Promise<McpSession | null>;
  async deleteSession(projectApiKey: string, sessionId: string): Promise<boolean>;
  async getStats(): Promise<{ totalSessions: number; projectCounts: Record<string, number> }>;
  // cleanupStale() is no longer needed — Redis TTL handles expiration
}
```

Key changes:

- **All methods become `async`** (Redis operations are async). This is a **breaking change** to the public API — callers must `await`.
- `createSession()`: Save metadata to Redis, cache `McpServer` locally
- `getSession()`: Fetch metadata from Redis, get/recreate `McpServer` from local cache
- `deleteSession()`: Remove from Redis + local cache
- `cleanupStale()`: Remove entirely — Redis TTL handles this automatically. Keep as a no-op or remove, depending on whether any caller depends on it.
- Server cache key: `{projectApiKey}:{sessionId}`

### Step 4: Update McpController

**File: `src/mcp/mcp.controller.ts`**

- Add `await` to all `sessionManager` method calls (they are now async)
- No other changes needed — the public interface stays the same

### Step 5: Update McpModule

**File: `src/mcp/mcp.module.ts`**

- Import `RedisModule`
- Add `RedisSessionRepository` to providers

### Step 6: Update AppModule

**File: `src/app.module.ts`**

- Import `RedisModule` as a global module (or import in `McpModule` only)

### Step 7: Update Configuration

**File: `.env.example`**

- Uncomment Redis variables, mark them as required
- Add `REDIS_KEY_PREFIX` (optional, default `mcp:`)
- Document `MCP_SESSION_TTL` default

**File: `docker-compose.yml`**

- Add a Redis service container
- Link `iot-cloud-mcp` to the Redis service

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - '${REDIS_PORT:-6379}:6379'
    volumes:
      - redis-data:/data
    networks:
      - iot-network

volumes:
  redis-data:
```

---

## Migration Path

### Phase 1: Dual-Mode (Optional, for zero-downtime migration)

Add a `SESSION_STORAGE` env var (`memory` | `redis`, default `redis`). If set to `memory`, use the current in-memory implementation unchanged. This allows rollback.

### Phase 2: Redis-Only

Remove the `memory` fallback once Redis is proven stable in production. Remove the `cleanupStale()` method and any interval that calls it.

---

## Error Handling

| Scenario                                                   | Behavior                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Redis connection fails on startup                          | Log error, throw (fail fast — sessions won't work without Redis)                 |
| Redis becomes unavailable mid-operation                    | Throw, let controller return 503 to client                                       |
| Session exists in Redis but `McpServer` not in local cache | Recreate `McpServer` via `McpServerFactory.createServer()`                       |
| TTL expires while request is in-flight                     | `getSession()` returns null → controller creates new session (existing behavior) |

---

## Testing Strategy

1. **Unit tests** for `RedisSessionRepository` — mock `ioredis` client
2. **Unit tests** for refactored `SessionManagerService` — mock `RedisSessionRepository`
3. **Integration test** — spin up Redis via `docker-compose`, verify full session lifecycle (create → get → update → expire → get returns null)
4. **Verify no regressions** — existing MCP protocol flow works unchanged end-to-end

---

## Files Changed Summary

| File                                           | Action                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `src/redis/redis.module.ts`                    | **New** — Redis module with ioredis provider               |
| `src/redis/redis.constants.ts`                 | **New** — Injection tokens and key constants               |
| `src/mcp/services/redis-session.repository.ts` | **New** — Redis session data access layer                  |
| `src/mcp/services/session-manager.service.ts`  | **Modified** — Use Redis + local McpServer cache           |
| `src/mcp/mcp.controller.ts`                    | **Modified** — Add `await` to session manager calls        |
| `src/mcp/mcp.module.ts`                        | **Modified** — Import RedisModule, add repository provider |
| `src/mcp/dto/mcp-session.dto.ts`               | **Modified** — Add `RedisSessionData` interface            |
| `.env.example`                                 | **Modified** — Uncomment Redis vars                        |
| `docker-compose.yml`                           | **Modified** — Add Redis service                           |

---

## Estimated Effort

| Step                           | Effort       |
| ------------------------------ | ------------ |
| Redis Module                   | ~30 min      |
| Redis Session Repository       | ~1 hour      |
| Refactor SessionManagerService | ~1 hour      |
| Update Controller + Module     | ~15 min      |
| Docker + Config                | ~15 min      |
| Testing                        | ~2 hours     |
| **Total**                      | **~5 hours** |
