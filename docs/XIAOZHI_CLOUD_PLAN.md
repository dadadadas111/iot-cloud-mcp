# Xiaozhi Cloud Plan

> **Status as of 2026-05-20 / commit caed271**: Phases 1–4 essentially complete. Service is deployed to staging, end-to-end turn pipeline works with real devices.

## Goal

Build a protocol-correct Xiaozhi custom cloud as a sibling service to the existing NestJS MCP server.

Target flow:

1. Xiaozhi device
2. `xiaozhi-cloud`
3. `iot-cloud-mcp`
4. Rogo IoT Cloud API

## Why a sibling service

- Xiaozhi transport and audio concerns are separate from MCP gateway concerns.
- The custom cloud needs its own release cadence, logs, env, and protocol tests.
- Future sibling apps should not trigger MCP deploys by default.

## Phases

### Phase 1 — Protocol foundation ✅

- [x] Service skeleton (`apps/xiaozhi-cloud/`)
- [x] OTA endpoint (`GET/POST /ota/`)
- [x] WebSocket endpoint (`/xiaozhi/v1/`) with header validation
- [x] Header logging
- [x] `hello` handling + `ServerHelloMessage` response
- [x] Binary frame parsing (v2 fixed-header and v3 length-prefixed)
- [x] Redis-backed session persistence with TTL

### Phase 2 — Protocol state machine ✅

- [x] `SessionPhase` state machine: connected → ready → listening → processing → responding → interrupted/closed
- [x] Turn manager (`XiaozhiRuntime` in `services/runtime.py`)
- [x] Silence/timeout handling (RMS + WebRTC VAD, 1s silence cutoff)
- [x] Abort handling
- [x] STT / LLM / TTS interfaces (provider-agnostic)

### Phase 3 — Provider integrations ✅

- [x] Groq STT (`integrations/groq_stt.py`)
- [x] OpenAI-compatible streaming LLM (`integrations/openai_compatible_llm.py`)
- [x] EdgeTTS streaming (`integrations/edge_tts_client.py`)
- [x] MCP bridge to NestJS service (`integrations/rogo_mcp.py`)
- [x] Server-side LLM tool loop (`runtime.py`, `MAX_TOOL_ITERATIONS = 5`)

### Phase 4 — Deployment ✅

- [x] Dockerfile + `docker-compose.yml` (prod) + `docker-compose.staging.yml`
- [x] `.github/workflows/xiaozhi-cloud.yml` (prod, on master)
- [x] `.github/workflows/xiaozhi-cloud-staging.yml` (staging, restricted to feat branch as of caed271)
- [x] VPS layout: `/opt/xiaozhi-cloud` (prod) + `/opt/xiaozhi-cloud-stag` (staging)
- [x] Live staging deploys verified — `xiaozhi-cloud-staging` container starts cleanly and serves WS on `:8080`

### Phase 5 — Streaming pipeline (added post-Phase-4) ✅

Latency optimization that wasn't in the original plan:

- [x] Interleaved LLM/TTS/Opus generation — first audio plays as soon as the first sentence finishes, not after the whole response
- [x] Sentence splitter that preserves URLs / decimals / times (regex with lookahead)
- [x] `tts_start` wire-protocol contract: exactly once per turn, gated on first enqueued sentence
- [x] Terminal TTS failure propagates cleanly (raises through `gather()`, outer handler emits `tts_stop` + error)
- [x] Regression suite covers splitter, ordering, and failure paths (19 tests added in commit `1bbe0e8`)

## Open items before merging `feat/xiaozhi-custom-cloud` to master

Triaged in the pre-merge review for commit `caed271`. Not blocking the staging deploy, but worth resolving before merge:

- **Staging workflow scope** — currently restricted to `feat/xiaozhi-custom-cloud`. After merge to master, staging stops auto-deploying. Decide: dedicated `staging` branch, expanded allowlist, or accept the gap.
- **Prod workflow missing orphan-container fix** — staging got the fix in commit `34789ae`; prod (`xiaozhi-cloud.yml:85`) didn't.
- **`/health` echoes URLs** — `redis_url` and `mcp_base_url` in the response body. Cleartext, no secrets today, but cleanup recommended.
- **MCP tool error sanitization** — `rogo_mcp.py:call_tool` returns raw exception strings to the LLM as tool output. Sanitize to a constant.
- **Conversation history truncation** — `[-20:]` slice can orphan tool↔assistant.tool_calls pairs and trip provider 400s. Walk backward, preserve pairs.
- **System prompt source of truth** — `runtime.py` hard-codes the prompt; `settings.system_prompt` exists but is unused. Pick one.
- **Frame-level Redis writes** — `store.save()` fires on every 60ms opus frame (~17/sec/device). Throttle to phase transitions if scaling beyond a handful of concurrent devices.

## Notable architectural decisions

- **One Redis per stack** — `xiaozhi-cloud-redis` (prod) and `xiaozhi-cloud-redis-staging`. Not shared with the NestJS MCP service.
- **No mypy / strict typing** — type hints are advisory; tests are the safety net (currently 40 passed, 1 skipped).
- **MCP tool cache per session** — tools fetched once on first turn, TTL 300s. Avoids per-turn discovery latency.
- **Single-file system prompt** — Vietnamese-tuned. Lives in `runtime.py` for now; see open items above.
