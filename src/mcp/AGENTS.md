# src/mcp/ — MCP Protocol Layer

MCP Streamable HTTP transport, session lifecycle, JSON-RPC routing, and subdomain OAuth.

## Key Files

| File                                       | Purpose                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `mcp.controller.ts`                        | HTTP entry. POST/GET/DELETE `/mcp/:projectApiKey`. Manages transport lifecycle, JWT auth, session routing    |
| `mcp-auth.controller.ts`                   | Subdomain OAuth mirror. All `/mcp/:alias/authorize`, `/token`, `/login`, `/register`, `.well-known/*` routes |
| `services/session-manager.service.ts`      | Session CRUD. Redis metadata + local `Map<string, McpServer>` cache. Cache miss → factory recreates          |
| `services/redis-session.repository.ts`     | Redis data access. Keys: `mcp:session:{apiKey}:{id}` (string) + `mcp:project-sessions:{apiKey}` (SET)        |
| `services/mcp-server.factory.ts`           | Creates `McpServer` per tenant via SDK. Registers tools + resources. Instructions embedded                   |
| `services/mcp-protocol-handler.service.ts` | Routes JSON-RPC methods (`tools/list`, `tools/call`, `resources/*`) to services                              |
| `dto/mcp-session.dto.ts`                   | `McpSession` interface, `RedisSessionData` interface                                                         |

## Subdomain Routing (McpAuthController)

Nginx rewrites `{alias}.mcp.dash.id.vn/*` → `/mcp/{alias}/*` on the backend.
`McpAuthController` at `@Controller('mcp/:alias')` serves all OAuth + discovery routes
so MCP clients can complete the OAuth flow entirely through subdomain URLs.

Routes mirrored under `/mcp/:alias/`:

- `GET .well-known/oauth-protected-resource` → `DiscoveryService.getSubdomainResourceMetadata()`
- `GET .well-known/oauth-authorization-server` → `DiscoveryService.getSubdomainAuthServerMetadata()`
- `GET authorize` → login page (form action points to `/login`)
- `POST login` → `OAuthService.handleLogin()` → redirect with auth code
- `POST token` / `OPTIONS token` → `OAuthService.exchangeCode()` / `OAuthService.refreshToken()`
- `POST register` → static client registration response

Base-domain access (`/auth/:alias/*` via `AuthController`) continues working in parallel.

Discovery metadata returned by subdomain routes uses `buildSubdomainUrl()` to generate
flat URLs like `https://{alias}.domain.com/authorize` instead of `https://domain.com/auth/{alias}/authorize`.

## Transport Architecture

Controller manages **three local Maps** (non-serializable, ephemeral):

1. `transports: Map<string, StreamableHTTPServerTransport>` — active transports keyed by SDK session ID
2. `sessionProjectMap: Map<string, string>` — SDK session ID → projectApiKey routing
3. SessionManager's `servers: Map<string, McpServer>` — keyed by `{apiKey}:{sessionId}`

**Request flow**:

1. POST arrives → `validateAuth()` decodes JWT Bearer → userId
2. `WWW-Authenticate` header uses subdomain URL: `resource_metadata="{subdomainUrl}/.well-known/oauth-protected-resource"`
3. If `isInitializeRequest`: create new transport + new McpServer via factory → connect → store in maps
4. If existing session: look up transport by `mcp-session-id` header → forward request
5. GET: SSE stream for server-initiated messages (same transport lookup)
6. DELETE: terminate session, close transport, cleanup all maps

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

| Task                                       | File(s)                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| Add new JSON-RPC method                    | `mcp-protocol-handler.service.ts`                          |
| Change session TTL/keys                    | `redis-session.repository.ts` + `redis.constants.ts`       |
| Modify transport options                   | `mcp.controller.ts` (transport creation in POST handler)   |
| Change server capabilities/instructions    | `mcp-server.factory.ts` `createServer()`                   |
| Add session metadata fields                | `dto/mcp-session.dto.ts` + `redis-session.repository.ts`   |
| Change subdomain OAuth routes              | `mcp-auth.controller.ts`                                   |
| Change subdomain metadata URL construction | `src/auth/services/discovery.service.ts` subdomain methods |

## Tests

- `redis-session.repository.spec.ts` — Mocks ioredis client + pipeline. Tests CRUD, TTL, stale pruning
- `session-manager.service.spec.ts` — Mocks repository + factory. Tests session lifecycle, cache miss recovery

## Anti-Patterns

- **Never** store `McpServer` or `StreamableHTTPServerTransport` in Redis — non-serializable
- **Never** create transports outside the controller — transport lifecycle is tightly coupled to HTTP request/response
- **Never** access Redis keys directly — always go through `RedisSessionRepository`
- **Never** hardcode base-domain URLs in discovery metadata — use `buildSubdomainUrl()` for subdomain paths
