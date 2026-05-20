## xiaozhi-cloud

Protocol-correct custom cloud for Xiaozhi AI devices. Speaks the Xiaozhi WebSocket + OTA protocol directly, runs a streaming LLM/TTS turn pipeline, and bridges tool calls to the sibling `iot-cloud-mcp` NestJS server via MCP.

```
Xiaozhi device  ──►  xiaozhi-cloud  ──►  iot-cloud-mcp  ──►  Rogo IoT Cloud API
                       (this app)         (NestJS, sibling)
```

### What it does

- **WebSocket transport** — accepts the Xiaozhi v2/v3 binary audio framing, parses `hello` / `listen` / `abort` control messages.
- **Session state machine** — Redis-backed phases: `connected → ready → listening → processing → responding → interrupted/closed`. TTL'd, JSON-serialized.
- **Voice turn pipeline** — Groq STT (Whisper) → OpenAI-compatible LLM (streaming) → EdgeTTS (MP3) → 60ms Opus frames.
- **Streaming-first** — LLM content deltas are split into sentences and handed to TTS while the next sentence is still being generated. First-audio latency is bounded by first-sentence latency, not full-response latency.
- **MCP tool loop** — server-side tool calling. The LLM can invoke any tool exposed by the sibling `iot-cloud-mcp` server (device control, state queries, etc.) up to 5 iterations per turn.
- **Silence detection** — dual-signal RMS + WebRTC VAD over a sliding window. Closes the listening phase after 1s of confirmed silence.

### Tech

Python 3.11+ · FastAPI · uvicorn · Redis (`redis[hiredis]`) · httpx · Pydantic v2 · edge-tts · webrtcvad · `mcp` SDK · pytest

### Layout

```
src/
├── main.py               # FastAPI app: /health, /ota/, WebSocket /xiaozhi/v1/, turn glue
├── audio.py              # Opus decode (ffmpeg), RMS/VAD energy checks, MP3→opus streaming
├── config/settings.py    # Pydantic-settings env loader
├── protocol/             # Wire format: HelloMessage, ListenMessage, AbortMessage, parse_audio_frame
├── session/              # SessionPhase enum, DeviceSession, Redis-backed SessionStore
├── integrations/         # GroqSttClient, OpenAiCompatibleLlmClient, EdgeTtsClient, RogoMcpClient
└── services/runtime.py   # XiaozhiRuntime: streaming turn pipeline (LLM + TTS + tool loop)

tests/                    # pytest, asyncio-auto. 40 passed, 1 skipped as of commit caed271.
```

### Quick start

```bash
cd apps/xiaozhi-cloud
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env       # fill in GROQ_API_KEY, OPENAI_COMPATIBLE_*, MCP_*

# Dev server
.venv/bin/uvicorn src.main:app --reload --port 8080

# Tests
.venv/bin/pytest
```

### Docker

```bash
# Staging (uses docker-compose.staging.yml)
docker compose -f docker-compose.staging.yml up -d

# Prod
docker compose up -d
```

Two containers per stack: the app + a dedicated Redis instance (`xiaozhi-cloud-redis[-staging]`).

### Deployment

- **Prod**: push to `master` → `.github/workflows/xiaozhi-cloud.yml` builds & deploys.
- **Staging**: push to `feat/xiaozhi-custom-cloud` only → `.github/workflows/xiaozhi-cloud-staging.yml`. Other branches no longer auto-deploy (commit `caed271`).

### Wire contract (streaming pipeline)

The server emits these events per turn, in order:

1. `tts_start` — exactly once per turn, when the first sentence is ready (or on residual-buffer flush).
2. `sentence_start` (text=…) — per sentence, immediately before its audio frames.
3. `audio_frame` (index=N, opus payload) — 60ms each, monotonic index.
4. `tts_stop` — emitted by the outer handler on normal completion OR on any propagated exception.

A turn that errors before producing any complete sentence emits zero `tts_start` events (no false starts). Terminal TTS failures raise; the consumer unblocks via a `try/finally` sentinel and the outer handler sends `tts_stop` + error.

### See also

- `apps/xiaozhi-cloud/AGENTS.md` — deeper AI agent reference (conventions, anti-patterns, file map)
- `docs/XIAOZHI_CLOUD_PLAN.md` — design rationale and phase history
