# src/mcp/ — MCP Protocol Layer

MCP Streamable HTTP transport, session lifecycle, and JSON-RPC routing.

## Key Files

| File                                       | Purpose                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `mcp.controller.ts` (308 lines)            | HTTP entry. POST/GET/DELETE `/mcp/:projectApiKey`. Manages transport lifecycle, JWT auth, session routing |
| `services/session-manager.service.ts`      | Session CRUD. Redis metadata + local `Map<string, McpServer>` cache. Cache miss → factory recreates       |
| `services/redis-session.repository.ts`     | Redis data access. Keys: `mcp:session:{apiKey}:{id}` (string) + `mcp:project-sessions:{apiKey}` (SET)     |
| `services/mcp-server.factory.ts`           | Creates `McpServer` per tenant via SDK. Registers tools + resources. Instructions embedded                |
| `services/mcp-protocol-handler.service.ts` | Routes JSON-RPC methods (`tools/list`, `tools/call`, `resources/*`) to services                           |
| `dto/mcp-session.dto.ts`                   | `McpSession` interface, `RedisSessionData` interface                                                      |

## Transport Architecture

Controller manages **three local Maps** (non-serializable, ephemeral):

1. `transports: Map<string, StreamableHTTPServerTransport>` — active transports keyed by SDK session ID
2. `sessionProjectMap: Map<string, string>` — SDK session ID → projectApiKey routing
3. SessionManager's `servers: Map<string, McpServer>` — keyed by `{apiKey}:{sessionId}`

**Request flow**:

1. POST arrives → `validateAuth()` decodes JWT Bearer → userId
2. If `isInitializeRequest`: create new transport + new McpServer via factory → connect → store in maps
3. If existing session: look up transport by `mcp-session-id` header → forward request
4. GET: SSE stream for server-initiated messages (same transport lookup)
5. DELETE: terminate session, close transport, cleanup all maps

## Session Storage (Dual)

```
Redis (persistent, serializable):
  Key: mcp:session:{projectApiKey}:{sessionId}  →  RedisSessionData JSON
  Key: mcp:project-sessions:{projectApiKey}     →  SET of sessionIds
  TTL: MCP_SESSION_TTL seconds (default 3600)

Local Map (ephemeral, non-serializable):
  Key: {projectApiKey}:{sessionId}  →  McpServer instance
```

**Why dual?** `McpServer` contains functions/event emitters — can't serialize to Redis. On cache miss (e.g., server restart), factory recreates McpServer with tools/resources re-registered. Session metadata survives restarts.

**Stale pruning**: `getProjectSessionIds()` pipeline-checks each SET member via EXISTS, removes orphaned entries.

## Where to Change

| Task                                    | File(s)                                                  |
| --------------------------------------- | -------------------------------------------------------- |
| Add new JSON-RPC method                 | `mcp-protocol-handler.service.ts`                        |
| Change session TTL/keys                 | `redis-session.repository.ts` + `redis.constants.ts`     |
| Modify transport options                | `mcp.controller.ts` (transport creation in POST handler) |
| Change server capabilities/instructions | `mcp-server.factory.ts` `createServer()`                 |
| Add session metadata fields             | `dto/mcp-session.dto.ts` + `redis-session.repository.ts` |

## Tests

- `redis-session.repository.spec.ts` — Mocks ioredis client + pipeline. Tests CRUD, TTL, stale pruning
- `session-manager.service.spec.ts` — Mocks repository + factory. Tests session lifecycle, cache miss recovery

## Anti-Patterns

- **Never** store `McpServer` or `StreamableHTTPServerTransport` in Redis — non-serializable
- **Never** create transports outside the controller — transport lifecycle is tightly coupled to HTTP request/response
- **Never** access Redis keys directly — always go through `RedisSessionRepository`
