HANDOFF CONTEXT
===============

USER REQUESTS (AS-IS)
---------------------
- "/init-deep" (generate hierarchical AGENTS.md knowledge base)
- "ulw tell me what should i continue to work on this project? as a product owner"

GOAL
----
Continue product development on iot-cloud-mcp by implementing the prioritized roadmap items, starting with P0 security fixes (JWT verification, rate limiting, Redis hardening, CORS, error leakage).

WORK COMPLETED
--------------
- I ran /init-deep: fired 6 parallel explore agents + bash structural analysis to discover the full codebase (95 files, ~6.9k LoC TypeScript, NestJS MCP gateway)
- I scored all directories for AGENTS.md placement and determined 3 locations: root (update), src/mcp/ (create), src/tools/ (create)
- I updated AGENTS.md at root (105 lines) with proper format: overview, structure tree, where-to-look table, conventions, anti-patterns, unique styles, commands, notes, hierarchy
- I created src/mcp/AGENTS.md (67 lines) covering transport architecture, dual session storage, request flow, and domain-specific anti-patterns
- I created src/tools/AGENTS.md (84 lines) covering tool definition pattern, adding new tools steps, full tool list with params, executor internals
- I then ran a comprehensive product assessment by firing 5 parallel agents: gaps/TODOs, security audit, code quality/architecture debt, MCP ecosystem research, ops maturity assessment
- I synthesized all findings into a prioritized P0-P4 product roadmap

CURRENT STATE
-------------
- 3 uncommitted files from init-deep: modified AGENTS.md, new src/mcp/AGENTS.md, new src/tools/AGENTS.md
- package-lock.json also shows modified (likely pre-existing)
- Build status unknown (not run this session)
- Pre-existing LSP error: "Cannot find module 'uuid'" in session-manager.service.ts (missing @types/uuid)
- No implementation work started on any roadmap items

PENDING TASKS
-------------
- Commit the 3 AGENTS.md files (user hasn't requested yet)
- P0 Security (CRITICAL - do first):
  1. JWT verification: src/common/utils/jwt.utils.ts only base64-decodes tokens, never verifies cryptographically. Replace decodeJwt() with jsonwebtoken.verify() or Firebase Admin verifyIdToken()
  2. Error leakage: tool-executor returns raw error.message to clients, iot-api.service logs full response.data and stack traces, auth.controller logs token headers/body
  3. Rate limiting: ThrottlerModule configured in app.module.ts but ThrottlerGuard never registered as APP_GUARD - zero enforcement
  4. Redis security: no password required in docker-compose, port exposed to host, no TLS
  5. CORS: defaults to '*' with credentials:true, auth controller hardcodes '*' in OPTIONS handler
- P1 Stability (this month):
  6. Unit tests: only 2 spec files exist (redis-session.repository.spec.ts, session-manager.service.spec.ts). Tool executor, IoT API proxy, OAuth service all untested
  7. Refactor tool-executor god file (1423 lines): extract auth helper, error formatter, handler map dispatch, response shaper
  8. DRY tool-registry: replace 15 copy-pasted registerTool blocks with loop + helper
  9. Type safety: IotApiService returns Promise<any> everywhere, executor uses Record<string, unknown>
  10. Standardize error handling across 3 layers (controller JSON-RPC, executor CallToolResult, proxy raw throws)
- P2 MCP Features (this quarter):
  11. Tool annotations (destructive, readOnlyHint, idempotent) - 1 hour easy win
  12. MCP Prompts for common IoT scenarios
  13. Elicitation for destructive action confirmation
  14. MCP Logging capability declaration
  15. Per-tool rate limiting
- P3 Ops (next quarter): structured logging, Prometheus metrics, Sentry, CI smoke tests, Docker healthcheck
- P4 Strategic: PoC stubs implementation, resource templates, sampling, long-running tasks

KEY FILES
---------
- AGENTS.md - root knowledge base (updated this session, uncommitted)
- src/mcp/AGENTS.md - MCP protocol layer knowledge (created this session, uncommitted)
- src/tools/AGENTS.md - tools layer knowledge (created this session, uncommitted)
- AGENT.md - comprehensive codebase guide (341 lines, pre-existing)
- src/common/utils/jwt.utils.ts - JWT decode-only auth (CRITICAL security fix needed)
- src/tools/services/tool-executor.service.ts - 1423-line god file (biggest refactor target)
- src/tools/services/tool-registry.service.ts - 288 lines of duplicated registration
- src/proxy/services/iot-api.service.ts - all IoT API calls, returns Promise<any>
- src/app.module.ts - ThrottlerModule configured but guard not registered
- src/main.ts - CORS config, logging middleware, bootstrap

IMPORTANT DECISIONS
-------------------
- AGENTS.md hierarchy: root + src/mcp/ + src/tools/ only. Skipped auth/, proxy/, common/, redis/, discovery/, resources/ as adequately covered by root (project is only 95 files)
- Product roadmap prioritizes security (P0) over features because JWT auth is effectively decorative - tokens are decoded but never verified
- Recommended sprint order: security fixes first, then tests + refactoring, then MCP features, then ops maturity
- MCP SDK is at v1.27.1 (project uses v1.26+). Missing MCP features: prompts, elicitation, tool annotations, logging, sampling, tasks
- tool-executor refactoring approach: incremental (helpers first, then handler map, then extract per-tool services) rather than big-bang rewrite

EXPLICIT CONSTRAINTS
--------------------
- Never use process.env directly - use ConfigService
- Never as any or @ts-ignore or @ts-expect-error
- Never import from dist/ - only src/
- Never expose Redis keys in HTTP responses (except X-MCP-Session-Id header)
- Never touch n8n services on VPS (port 5678, separate stack)
- Never manually instantiate services - use NestJS DI
- Never rely on decodeProductId() alone - use resolveDeviceType() (reads productInfos[1])
- Never include userId, extraInfo, createdAt in list endpoint responses
- API field is productId (not modelId)

CONTEXT FOR CONTINUATION
------------------------
- The 3 AGENTS.md files are uncommitted - commit them if user wants
- The security audit found JWT verification as the single most critical issue - decodeJwt() in jwt.utils.ts just does base64 JSON.parse, never calls jsonwebtoken.verify()
- ThrottlerModule.forRoot([{ttl: 60000, limit: 100}]) uses array syntax with ttl in ms (non-standard, typical is seconds) - needs investigation when fixing
- MCP ecosystem research found GitHub Copilot is now a major MCP client (Feb 2026), 97M+ monthly SDK downloads
- The project has a cleanupStale() method that's a deliberate no-op and getOrCreateServer() that's a PoC stub always creating new servers
- test:e2e script exists in package.json but test/jest-e2e.json config file is missing
- VPS deployment: prod at mcp.dash.id.vn:3001, staging at mcp-stag.dash.id.vn:3002, VPS at 160.187.247.2