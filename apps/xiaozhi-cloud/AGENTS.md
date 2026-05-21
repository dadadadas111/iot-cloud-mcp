# AGENTS.md — apps/xiaozhi-cloud

> **Generated**: 2026-05-20 | **Commit**: caed271 | **Branch**: feat/xiaozhi-custom-cloud

## Overview

Protocol-correct custom cloud for Xiaozhi AI devices. Speaks the Xiaozhi WebSocket + OTA protocol directly, runs a streaming LLM/TTS turn pipeline, and bridges tool calls to the sibling `iot-cloud-mcp` NestJS server via MCP.

**Stack**: Python 3.11+ + FastAPI + uvicorn + Redis (`redis[hiredis]`) + httpx + Pydantic v2 + edge-tts + webrtcvad + `mcp` SDK + pytest

**Flow**: Xiaozhi device → `xiaozhi-cloud` (this service) → `iot-cloud-mcp` → Rogo IoT Cloud API

## Structure

```
apps/xiaozhi-cloud/
├── src/
│   ├── main.py                  # FastAPI app: /health, /ota/, /xiaozhi/v1/ (WebSocket), turn glue
│   ├── audio.py                 # Opus decode (ffmpeg), RMS/VAD energy checks, MP3→opus streaming
│   ├── config/settings.py       # Pydantic-settings env loader (REDIS_URL, GROQ_API_KEY, etc.)
│   ├── protocol/
│   │   ├── models.py            # HelloMessage, ListenMessage, AbortMessage, OtaResponse
│   │   └── parser.py            # parse_audio_frame (v2/v3 binary headers)
│   ├── session/
│   │   ├── models.py            # SessionPhase enum, DeviceSession dataclass
│   │   └── store.py             # Redis-backed SessionStore (JSON serialize, TTL)
│   ├── integrations/
│   │   ├── groq_stt.py          # GroqSttClient (Whisper STT)
│   │   ├── openai_compatible_llm.py  # OpenAiCompatibleLlmClient (streaming chat completion)
│   │   ├── edge_tts_client.py   # EdgeTtsClient (MP3 stream)
│   │   └── rogo_mcp.py          # RogoMcpClient (MCP over HTTP to iot-cloud-mcp)
│   └── services/runtime.py      # XiaozhiRuntime: streaming turn pipeline (LLM + TTS + tool loop)
└── tests/                       # pytest, asyncio-auto mode
    ├── test_parser.py           # binary frame parsing
    ├── test_runtime.py          # turn bootstrap, abort, phase transitions
    ├── test_runtime_stream.py   # streaming pipeline (LLM/TTS interleave, tts_start ordering)
    ├── test_try_split.py        # sentence splitter regex (URLs, decimals)
    ├── test_audio.py / _stream.py  # opus decode + energy checks
    ├── test_tts_stream.py       # TTS MP3→opus framing
    ├── test_llm_stream.py       # LLM provider streaming + tool call accumulation
    ├── test_ota.py              # OTA response shape
    └── test_turn.py             # turn lifecycle
```

## Where to Look

| Task                                | Location                                                       | Notes                                                                                |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Change WebSocket handshake          | `src/main.py` — `xiaozhi_v1` handler                           | Validates `protocol-version`/`device-id`/`client-id` headers, sends `ServerHelloMessage` |
| OTA response                        | `src/main.py` — `/ota/` route                                  | Returns `PUBLIC_WS_URL` + activation/firmware shape                                  |
| Session phase logic                 | `src/session/models.py` — `SessionPhase` + `DeviceSession`     | StrEnum: connected/ready/listening/processing/responding/interrupted/closed          |
| Add a session field                 | `src/session/models.py` + `store.py`                           | Must be JSON-serializable; `store.save()` re-writes the whole session                |
| Streaming turn pipeline             | `src/services/runtime.py` — `generate_response_stream`         | Interleaved `_llm_task` → `sentence_q` → `_tts_task` → `events_q` → consumer         |
| Sentence boundaries                 | `src/services/runtime.py` — `_try_split` + `_SPLIT_RE`         | Splits on `?!\n;` always, `.` only before whitespace/EOS                             |
| Add an MCP tool call                | Tools are discovered dynamically via `RogoMcpClient.list_tools` | Bridge already wires every iot-cloud-mcp tool into the LLM tool loop                 |
| TTS provider                        | `src/integrations/edge_tts_client.py`                          | Streams MP3 frames; `audio.py:stream_mp3_to_opus_frames` converts to 60ms opus       |
| LLM provider                        | `src/integrations/openai_compatible_llm.py`                    | Streams content deltas + tool_call deltas; provider-agnostic OpenAI-compatible API   |
| Audio frame protocol                | `src/protocol/parser.py` — `parse_audio_frame`                 | Disambiguates v2 (16-byte header) vs v3 length-prefixed                              |
| Health probe                        | `src/main.py` — `/health`                                      | Reports provider readiness + redis/mcp URLs                                          |
| Env vars                            | `.env.example`                                                 | All vars are loaded via `Settings` in `src/config/settings.py`                       |
| Docker/deploy                       | `docker-compose.yml`, `docker-compose.staging.yml`, `Dockerfile` | Two containers: app + redis; named `xiaozhi-cloud[-staging]` / `xiaozhi-cloud-redis[-staging]` |
| CI/CD                               | `.github/workflows/xiaozhi-cloud.yml` (prod) / `-staging.yml`  | Prod = master; staging = `feat/xiaozhi-custom-cloud` (single allowlisted branch)     |

## Conventions

- **Async-first**: every I/O path is `async`. Tests use `asyncio_mode = "auto"` (pytest-asyncio).
- **Settings**: load via `from src.config.settings import settings`. Never read `os.environ` directly.
- **Logging**: `logger = logging.getLogger(__name__)` per module. Format set in `main.py:logging.basicConfig`.
- **Session persistence**: `_store.save(session)` after any mutation. Phase transitions, conversation appends, audio frame appends.
- **Streaming pipeline contract**: `_llm_task` produces, `_tts_task` consumes via `sentence_q`; both push events to `events_q`. The consumer in `generate_response_stream` yields events to `main.py`, which forwards them as Xiaozhi wire frames.
- **Test command**: `.venv/bin/pytest` from `apps/xiaozhi-cloud/`. Currently 40 passed, 1 skipped.

## Streaming turn pipeline (`services/runtime.py`)

The pipeline interleaves LLM streaming, sentence splitting, TTS, and Opus framing to minimize first-audio latency.

```
LLM streaming deltas  ──►  _llm_task
                              │ accumulates content into buffer_inner
                              │ _try_split → new_sentences
                              ▼
                          sentence_q  ─────►  _tts_task
                                                │ EdgeTTS MP3 stream
                                                │ stream_mp3_to_opus_frames
                                                ▼
                                            events_q  ───►  generate_response_stream consumer
                                                              │  yields events to main.py:
                                                              │  tts_start, sentence_start, audio_frame, tts_stop
                                                              ▼
                                                          WebSocket → device
```

**Wire contract (load-bearing):**

- `tts_start` fires **exactly once** per turn, when the FIRST sentence is enqueued (or on residual-buffer flush). MUST precede any `sentence_start`.
- `sentence_start` fires per sentence, immediately before its `audio_frame`s.
- `audio_frame` carries 60ms Opus payloads with a monotonic frame `index` per turn.
- Terminal TTS failure (both retries exhausted) **raises**; `_tts_task` has `try/finally` that drops the `events_q` sentinel so the consumer unblocks; the exception surfaces via `gather()` and `main.py`'s outer handler emits `tts_stop` + error to the device.
- Tool-only hops (LLM finishes with `tool_calls`, no content) do NOT emit `tts_start`. The tool loop iterates up to `MAX_TOOL_ITERATIONS = 5` per turn.

## Anti-patterns (this app)

- **Never** read `os.environ` directly — go through `settings`.
- **Never** add `:` to `SENTENCE_TERMINATORS`. It mangles URLs and times.
- **Never** add a naked `.` split. Use the regex lookahead so URLs/decimals stay whole.
- **Never** emit `tts_start` from the first LLM content delta. Wait for the first complete sentence (or residual flush). An LLM error before any sentence must produce zero `tts_start` events.
- **Never** soft-log a terminal TTS failure as an event — raise so the outer handler can send `tts_stop` + error. The device hangs otherwise.
- **Never** forget the `try/finally: events_q.put(None)` in `_tts_task`. Without the sentinel, an exception deadlocks the consumer loop.
- **Never** call `store.save()` inside a hot frame loop without considering Redis write volume (currently saves on every 60ms opus frame — known SOON item).
- **Never** return raw exception strings from MCP tool calls back to the LLM (`rogo_mcp.py:call_tool` does this — known SOON, sanitize before merge to prod).

## Unique styles

- **Two sources of audio framing**: v2 (16-byte fixed header) and v3 (length-prefixed). `parse_audio_frame` tries v2 first when `len >= 16`, else v3. A v3 frame whose first 2 bytes happen to be `\x00\x02` can misparse — flagged as a coverage gap; add a test if you change either format.
- **MCP tool cache per session**: `DeviceSession.mcp_tools` is hydrated on first turn and TTL'd 300s via `is_mcp_tools_stale`. Avoids per-turn tool discovery latency.
- **Sentence splitter is regex-driven, not iterative**: `_SPLIT_RE = r'[?!\n;]|\.(?=\s|$)'`. Single character class + one lookahead — no backtracking, no unicode trap.
- **TTS preroll**: `TTS_PREROLL_FRAMES = 5` frames are buffered before emission so the device has audio queued by the time it sees `tts_start`. `TTS_STOP_DELAY_SECONDS = 0.42s` is the tail pad before `tts_stop`.
- **Silence detection is dual-signal**: RMS + WebRTC VAD over a sliding window. Triggers turn close when both indicate silence for `MIN_SILENCE_TIMEOUT_MS = 1000`.
- **System prompt hard-coded** in `runtime.py:_build_messages` (a `system_prompt` setting in `config/settings.py` exists but is unused — known SOON; pick one).

## Commands

```bash
# Setup (one-time)
cd apps/xiaozhi-cloud
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"

# Run dev server
.venv/bin/uvicorn src.main:app --reload --port 8080

# Tests
.venv/bin/pytest              # full suite
.venv/bin/pytest -x           # stop on first failure
.venv/bin/pytest -k splitter  # filter by name

# Docker (staging)
docker compose -f docker-compose.staging.yml up -d
```

## Env vars (see `.env.example`)

| Variable                       | Required          | Notes                                                                           |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------- |
| `REDIS_URL`                    | Yes               | Default `redis://localhost:6379/1`                                              |
| `PUBLIC_WS_URL`                | Yes               | Returned in OTA response — device connects here                                 |
| `GROQ_API_KEY` / `GROQ_STT_MODEL` | STT optional   | Without, STT is disabled. Default model `whisper-large-v3-turbo`                 |
| `OPENAI_COMPATIBLE_BASE_URL` / `_API_KEY` / `_MODEL` | LLM optional | All three required to enable LLM                                  |
| `MCP_BASE_URL` / `MCP_PROJECT_API_KEY` / `MCP_BEARER_TOKEN` | Tools optional | All three required to enable MCP tool calling                |
| `TTS_VOICE`                    | No                | EdgeTTS voice ID. Default `vi-VN-HoaiMyNeural`                                  |
| `SESSION_TTL_SECONDS`          | No                | Default 3600                                                                    |
| `LOG_LEVEL`                    | No                | Default INFO                                                                    |

## Notes

- **CI/CD scope**: staging deploys only on `feat/xiaozhi-custom-cloud`. After this branch merges to master, that workflow goes silent until either the allowlist is updated or a `staging` branch convention is adopted.
- **Single VPS, two stacks**: `iot-cloud-mcp` (NestJS, ports 3001/3002) lives next to `xiaozhi-cloud` (Python, port 8080). Each has its own GitHub Actions workflow and compose files. Do not cross-deploy.
- **No mypy / no strict typing config**: type hints are advisory. Tests are the safety net.

## Known SOON items (from pre-merge review caed271)

Not blocking, but flagged for cleanup:

- `session/store.py` — saves on every 60ms opus frame (~17 writes/sec/device). Throttle to phase transitions if scaling.
- `/health` — echoes `redis_url` and `mcp_base_url` in cleartext. Drop those fields.
- `rogo_mcp.py:57-79` — returns exception strings to LLM as tool output. Sanitize to a constant.
- `runtime.py:236` — hard-coded system prompt, ignores `settings.system_prompt`. Pick one source.
- `runtime.py:446-479` — bad tool-call JSON silently coerced to `{}`. Add a warning log.
- `session/models.py:55-56` — `[-20:]` history truncation can orphan `tool` ↔ `assistant.tool_calls` pairs. Walk backward to preserve pairs.
- `.github/workflows/xiaozhi-cloud.yml:85` — prod workflow missing the orphan-container fix that staging has (commit 34789ae).
- Dead constant `SENTENCE_TERMINATORS` at `runtime.py:23` — superseded by `_SPLIT_RE`.
