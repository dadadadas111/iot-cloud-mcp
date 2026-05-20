# Temporary Xiaozhi Cloud Task Tracker

Last updated: 2026-05-20
Branch: `feat/xiaozhi-custom-cloud` · Commit: `caed271`

## Overall progress

- Project progress: **~95%** — staging deploys clean, end-to-end voice turns work with real devices.
- Current execution slice: **Pre-merge cleanup** (see open items in `docs/XIAOZHI_CLOUD_PLAN.md`).

## Local environment status

- [x] System Python tooling fixed (`python3-venv`, `python3-pip`)
- [x] App-local virtualenv created at `apps/xiaozhi-cloud/.venv`
- [x] `xiaozhi-cloud` runtime + dev dependencies installed
- [x] Full test suite green (`40 passed, 1 skipped`)

## Sequential tasks

### 1. Protocol foundation

- [x] Create fresh branch from `master`
- [x] Remove failed `rogo-agent` deployment from VPS
- [x] Isolate MCP CI/CD triggers to MCP-owned paths
- [x] Scaffold sibling `apps/xiaozhi-cloud/` service
- [x] Implement explicit websocket session state machine
- [x] Implement structured parsing for `hello`, `listen`, `abort`
- [x] Persist session phase changes in Redis-backed store
- [x] Add protocol-focused tests for state transitions
- [ ] Add structured `mcp` message handling (control-channel MCP, distinct from server-side tool loop — still open)

Progress: **89%**

### 2. Audio turn pipeline

- [x] Inbound audio buffering policy by phase
- [x] Opus frame decode path (ffmpeg-backed)
- [x] Turn lifecycle: listening → processing → responding
- [x] Timeout policy and cleanup rules (1s silence cutoff, VAD + RMS dual-signal)
- [x] TTS interruption / abort semantics
- [x] Streaming pipeline (interleaved LLM/TTS/Opus for low first-audio latency)
- [x] Sentence splitter preserves URLs / decimals / times
- [x] TTS state-machine: `tts_start` gated to first enqueued sentence; terminal failure propagates cleanly

Progress: **100%**

### 3. Provider integrations

- [x] Groq STT real request/response flow
- [x] OpenAI-compatible LLM real request/response flow (streaming + tool_call deltas)
- [x] TTS provider abstraction + EdgeTTS implementation (`vi-VN-HoaiMyNeural` default)

Progress: **100%**

### 4. MCP bridge

- [x] MCP auth/session strategy (bearer token + project API key path)
- [x] Tool discovery (cached per-session, TTL 300s)
- [x] Tool execution round-trip
- [x] LLM + tool loop orchestration (`MAX_TOOL_ITERATIONS = 5`)

Progress: **100%**

### 5. Deployment

- [x] Dedicated xiaozhi-cloud Docker/compose wiring (prod + staging)
- [x] Dedicated GitHub Actions workflows (`xiaozhi-cloud.yml`, `xiaozhi-cloud-staging.yml`)
- [x] VPS directory/layout/runbook for staging and prod (`/opt/xiaozhi-cloud[-stag]`)
- [x] Staging deploy verified end-to-end (commit `caed271`, container `Up 10s`, uvicorn serving on `:8080`)

Progress: **100%**

### 6. Verification

- [x] Mocked end-to-end voice turn test (`tests/test_runtime_stream.py`, 12 tests covering interleaving + ordering)
- [x] Real device handshake validation (live staging traffic on VPS)
- [x] Real server log validation
- [x] Redis session inspection on VPS
- [x] Regression suite for streaming pipeline bugs (19 tests in commit `1bbe0e8`)

Progress: **100%**

## Pre-merge cleanup (before `feat/xiaozhi-custom-cloud` → `master`)

Surfaced in the caed271 pre-merge review. Not blocking the staging deploy but should be resolved before merging:

- [ ] Post-merge staging hole — workflow restricted to `feat/xiaozhi-custom-cloud`; decide on `staging` branch / wider allowlist
- [ ] Prod workflow needs the orphan-container fix that staging got in `34789ae`
- [ ] `/health` cleanup — stop echoing `redis_url` / `mcp_base_url`
- [ ] MCP tool error sanitization in `rogo_mcp.py:call_tool`
- [ ] Conversation history truncation preserves tool↔assistant.tool_calls pairs
- [ ] System prompt source of truth — pick `runtime.py` or `settings.system_prompt`
- [ ] Throttle `store.save()` frequency (currently every 60ms opus frame)
- [ ] Drop dead constant `SENTENCE_TERMINATORS` (superseded by `_SPLIT_RE`)
- [ ] Optional: end-to-end test driving `generate_response_stream` through a TTS failure

## Latest validation

- `.venv/bin/pytest` (from `apps/xiaozhi-cloud/`)
- Result: **40 passed, 1 skipped**
- Staging deploy run [#26145301575](https://github.com/dadadadas111/iot-cloud-mcp/actions/runs/26145301575) — green
