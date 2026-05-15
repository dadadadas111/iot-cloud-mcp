# Temporary Xiaozhi Cloud Task Tracker

Last updated: 2026-05-15
Branch: `feat/xiaozhi-custom-cloud`

## Overall progress

- Project progress: **33%**
- Current execution slice: **Protocol state machine + structured control handling**

## Local environment status

- [x] System Python tooling fixed (`python3-venv`, `python3-pip`)
- [x] App-local virtualenv created at `apps/xiaozhi-cloud/.venv`
- [x] `xiaozhi-cloud` runtime + dev dependencies installed
- [x] Core test suite runs locally (`8 passed`)

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
- [ ] Add structured `mcp` message handling

Progress: **72%**

### 2. Audio turn pipeline

- [ ] Inbound audio buffering policy by phase
- [ ] Opus frame decode path
- [ ] Turn lifecycle: listening -> processing -> responding
- [ ] Timeout policy and cleanup rules
- [ ] TTS interruption / abort semantics

Progress: **5%**

### 3. Provider integrations

- [ ] Groq STT real request/response flow
- [ ] OpenAI-compatible LLM real request/response flow
- [ ] TTS provider abstraction and first implementation

Progress: **10%**

### 4. MCP bridge

- [ ] MCP auth/session strategy for custom cloud
- [ ] Tool discovery
- [ ] Tool execution round-trip
- [ ] LLM + tool loop orchestration

Progress: **10%**

### 5. Deployment

- [ ] Dedicated xiaozhi-cloud Docker/compose wiring
- [ ] Dedicated GitHub Actions workflows for xiaozhi-cloud
- [ ] VPS directory/layout/runbook for staging and prod

Progress: **0%**

### 6. Verification

- [ ] Mocked end-to-end voice turn test
- [ ] Real device handshake validation
- [ ] Real server log validation
- [ ] Redis session inspection on VPS

Progress: **0%**

## Immediate acceptance target

The current slice is complete when:

1. text control messages are parsed into typed models,
2. websocket session phase changes are explicit and persisted,
3. invalid session/message ordering is rejected cleanly,
4. tests cover the main state transitions.

## Latest validation

- `apps/xiaozhi-cloud/.venv/bin/pytest apps/xiaozhi-cloud/tests/test_parser.py apps/xiaozhi-cloud/tests/test_runtime.py apps/xiaozhi-cloud/tests/test_ota.py`
- Result: **8 passed**
