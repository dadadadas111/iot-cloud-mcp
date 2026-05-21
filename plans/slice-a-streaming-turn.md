# Plan: Slice A — Streaming LLM + Sentence-Pipelined TTS

## Intent
- Type: refactor (mid-sized scoped)
- Goal: Reduce time-from-STT-completion to first opus audio frame from ~3-5 s to <1 s on a typical short reply by converting the LLM and TTS stages to streaming and pipelining sentence-level TTS while later tokens are still being generated.
- Non-goals (EXPLICIT — do NOT touch in this slice):
  - VAD / endpointing (`MIN_SILENCE_TIMEOUT_MS`, `webrtcvad`, Silero, hangover) — out of scope.
  - STT streaming (Groq remains one-shot `transcribe`) — out of scope.
  - HTTP keepalive / dropping ffmpeg subprocess / replacing edge-tts — out of scope.
  - MCP tool pre-warm or parallel tool execution — out of scope.
  - OTA, session persistence, history summarization — out of scope.
  - Translation of `list_smart_cmds` output / control reference tool — out of scope.
  - Changing `MAX_TOOL_ITERATIONS` (stays at 5), per-session MCP cache TTL (stays 5 min), or refresh-on-error semantics.
  - Changing the protocol message sequence (`stt` → `tts.start` → `sentence_start` → audio → `tts.stop`).

## Current Evidence
- `apps/xiaozhi-cloud/src/main.py` — `_process_turn` (lines 239-295). Today: awaits a single `(response_text, tts_audio)` tuple, then `transcode_to_opus_frames` (batch), then iterates frames out. `tts.start` is sent AFTER `generate_response` returns (line 256) per the comment at line 253. Frame paced via `sleep(audio_frame_duration / 1000)` after the first `TTS_PREROLL_FRAMES` (=5). `TTS_STOP_DELAY_SECONDS = 0.42` flush delay before `tts.stop`.
- `apps/xiaozhi-cloud/src/services/runtime.py` — `generate_response` (lines 189-289). Non-streaming LLM loop (max 5 hops). Builds `messages = [system] + history`, calls `_llm_client.chat(messages, tools=...)`, branches on `tool_calls`. Appends assistant message and tool results in the OpenAI tool-call format. After cap, forces one more call with `tools=None`. Returns `(response_text, tts_audio)`.
- `apps/xiaozhi-cloud/src/integrations/openai_compatible_llm.py` — `chat()` (lines 12-45) returns the raw `choices[0].message` dict (shape: `{role, content, tool_calls?}`). No streaming. Uses `httpx.AsyncClient(timeout=60)` per call.
- `apps/xiaozhi-cloud/src/integrations/edge_tts_client.py` — `synthesize()` (lines 10-16) collects all audio chunks into a single `bytes` before returning. Underlying `edge_tts.Communicate(...).stream()` already yields dicts of `{"type": "audio"|"WordBoundary"|..., "data": bytes}` — streaming is available, just not exposed.
- `apps/xiaozhi-cloud/src/audio.py` — `transcode_to_opus_frames` (lines 176-178) is batch: `decode_audio_to_pcm` (ffmpeg subprocess, full input/full output via `proc.communicate`) → `_encode_pcm_to_opus_frames` (sync, runs in `asyncio.to_thread`). `build_audio_frame` (line 254) builds protocol-version-specific frame headers.
- `apps/xiaozhi-cloud/src/session/models.py` — `DeviceSession.add_turn` appends to `conversation_history` (capped 20). `mcp_tools` cache + `is_mcp_tools_stale(ttl=300)`.
- `apps/xiaozhi-cloud/src/integrations/rogo_mcp.py` — `call_tool` already swallows errors and returns an error string (per-call resilience exists).
- `apps/xiaozhi-cloud/tests/test_turn.py` — STALE: mocks `llm.chat` to return a string (`"chao ban"`), but `chat()` returns a dict since commit `5ace459`. This test is already broken pre-refactor; we will fix it as part of this slice.
- Commands present:
  - Tests: `cd apps/xiaozhi-cloud && pytest` (pyproject `asyncio_mode = "auto"`, `testpaths = ["tests"]`).
  - Single test: `cd apps/xiaozhi-cloud && pytest tests/test_turn.py -v`.
  - Local run (Docker): `docker compose -f apps/xiaozhi-cloud/docker-compose.yml up --build`.
  - Staging logs: `ssh root@160.187.247.2 "docker logs xiaozhi-cloud-staging --tail 200"`.
- External references:
  - DeepSeek API is OpenAI-compatible and supports `stream: true` with delta `tool_calls` (the proxy `ds2api.dash.id.vn` forwards 1:1). SSE format: `data: {...}\n\n`, terminator `data: [DONE]`. Tool-call deltas accumulate via `index` field — must be assembled across chunks.
  - `edge_tts.Communicate.stream()` yields incremental audio chunks (mp3/raw depending on voice; for vi-VN-HoaiMyNeural the output is mp3) as they arrive from the Azure endpoint.

## Key Decisions

### Decision 1: LLM streaming via httpx `stream("POST", ...)` + manual SSE parsing.
- Rationale: No new dependency. `httpx` is already used. The SSE format is trivial: split on `\n`, strip `data: ` prefix, JSON-parse each event, stop on `[DONE]`. The OpenAI Python SDK would add a heavy dep for what is one parser.
- Tradeoff considered: pulling `openai` SDK — rejected, conflicts with project preference to keep deps minimal and we already speak raw HTTP.
- Assumption: `ds2api.dash.id.vn` honors `stream: true` and forwards SSE chunks unbuffered. **VERIFICATION STEP REQUIRED before merging** (see Task 1).

### Decision 2: TTS becomes an `AsyncIterator[bytes]` yielding **opus frames** (not raw mp3 chunks).
- Rationale: The consumer wants opus frames it can wrap with `build_audio_frame` and send. Pushing the encode step inside the TTS client keeps the runtime consumer simple and lets us drop the `transcode_to_opus_frames` batch call entirely on the hot path. We still need to decode mp3 → PCM, but we do it streaming via a long-lived ffmpeg process per sentence (stdin fed mp3 chunks, stdout read as PCM).
- Tradeoff considered: yield raw mp3 chunks and decode in the runtime — rejected, duplicates plumbing and forces every caller to know about codecs.
- Tradeoff considered: drop ffmpeg and decode mp3 in-process — rejected, out of scope for this slice (separate slice flagged in handoff).
- Assumption: A streaming ffmpeg process (stdin=PIPE, stdout=PIPE, `-f s16le pipe:1`) emits PCM as soon as enough mp3 frames are buffered. Edge TTS yields ~6 KB mp3 chunks every ~150-300 ms; ffmpeg latency to first PCM is sub-100 ms in practice.

### Decision 3: Sentence boundary detection = scan rolling content buffer for `.`, `?`, `!`, `\n`, `;`, `:`, plus a hard force-flush at `MAX_SENTENCE_CHARS=160` characters.
- Rationale: Vietnamese uses Western punctuation, so simple terminators are reliable. The force-flush prevents one-long-sentence stalls. Including `;` and `:` gives more pipeline opportunities for natural list/enumeration replies.
- Tradeoff considered: NLP-based segmentation (spacy, pysbd) — rejected, new heavy dep for marginal gain on voice replies that are typically short.
- Edge case: `.` inside numbers (`3.14`) or abbreviations — accepted as a minor cost; voice replies rarely contain decimals; the worst case is one extra TTS segmentation (slight prosody break) not a correctness failure.
- Final-buffer rule: at stream end, if the residual buffer is non-empty after stripping whitespace, emit it as a final sentence.

### Decision 4: `tts.start` fires immediately after `stt` (before any LLM tokens), NOT after first audio chunk.
- Rationale: The whole point of streaming is to begin "speaking" UX as early as possible. With streaming we WILL have audio within ~500-800 ms of LLM start; sending `tts.start` early matches the existing optimization spirit (handoff line 22-23 already moved `tts.start` early for this reason — but commit 5ace459 reverted it for tool-call hygiene). With streaming, the only case where `tts.start` is premature is a tool_calls-only iteration; in that case the device sees `tts.start` then has to wait for the eventual content turn. **Mitigation**: only emit `tts.start` once we see the FIRST content delta (not on raw LLM start), so tool-call-only iterations don't trigger it. This keeps the device UI honest while still firing `tts.start` ~200-500 ms earlier than today.
- Tradeoff considered: fire `tts.start` on first opus frame — rejected, gives back the latency we are trying to win.
- Assumption: the device handles `tts.start` → first audio gap of up to ~1 s without bailing. (It already does today; gap is currently ~0.)

### Decision 5: `sentence_start` fires per sentence, immediately when the sentence is split out of the LLM stream (before its TTS audio).
- Rationale: matches upstream xiaozhi which displays each sentence on the device screen. Per the prompt: "in the streaming world, `sentence_start` fires per sentence as the LLM yields it".
- Order: `stt` → (first content delta) `tts.start` → for each sentence: `sentence_start{text}` → opus frames → ... → `tts.stop`.

### Decision 6: Per-sentence TTS retry with exponential backoff (1 retry max, 200ms then give up).
- Rationale: addresses the Edge TTS `NoAudioReceived` flakiness flagged in the prompt. Cost on failure is one sentence stutter, not the whole turn. Two attempts total (initial + 1 retry) keeps the worst-case extra latency bounded (~300-500 ms) for the rare bad-sentence case.
- Tradeoff considered: retry whole TTS stream — rejected, would block the pipeline.
- Tradeoff considered: 3+ retries — rejected, latency cost too high.
- On final retry failure: log warning, skip the sentence (its `sentence_start` was already sent; no audio for it), continue with the next sentence. Do NOT abort the turn.

### Decision 7: Tool-loop integration — drain stream fully each hop, branch on accumulated `tool_calls` presence vs `content` presence.
- Rationale: DeepSeek (per prompt) does not interleave tool_calls with content in a single response. So per iteration: collect all deltas → if `tool_calls` accumulated and `content` empty/whitespace → execute tools, append messages, next hop (NO `tts.start`, NO sentence emission). If `content` is non-empty → it is the final reply; the sentence-pipelined TTS path runs concurrently with stream draining.
- Streaming with content path: the pipeline must START emitting sentences BEFORE the LLM stream ends. So the consumer is structured as: while streaming, on each content delta, append to buffer; on sentence boundary, push the sentence to a TTS queue task (which streams opus frames out to the WS). On stream end with content → wait for TTS queue to drain → `tts.stop`. On stream end with only tool_calls → next hop.
- Assumption: a single turn never both calls tools AND streams content in the same LLM response. If it ever does (defensive guard): treat as content response, ignore the tool_calls for that response (log warning). This matches the existing non-streaming logic which only branches on `tool_calls` presence.

### Decision 8: Streaming opus encoder lives in a new helper `OpusEncoderStream` that holds an opened encoder for the lifetime of one sentence's TTS.
- Rationale: avoids re-creating an opus encoder per frame (cheap but not free) and keeps the per-frame encode hot loop tight. One encoder per sentence is correct because encoder state is independent across sentences and there is silence between them anyway.
- Implementation: a small class wrapping `_load_opus_lib()` + persistent encoder handle, `encode_pcm_chunk(pcm) -> list[bytes]` that buffers partial frames internally and emits exact-frame-size opus packets, `flush() -> list[bytes]` to drain padding at end.

### Decision 9: Frame pacing changes — pre-roll first `TTS_PREROLL_FRAMES`, then pace at `audio_frame_duration_ms / 1000` per frame.
- Keep current behavior. The streaming path naturally paces because PCM arrives at real-time-ish rates from edge_tts (Azure server), so we should not need to add deliberate sleep beyond what the network already gives us — but we keep the explicit sleep as a safety net to avoid bursting the device receive buffer (device is a tiny ESP32). Same `TTS_PREROLL_FRAMES = 5` and same per-frame sleep after preroll.

## Implementation Tasks

### Task 1: Verify DeepSeek proxy supports streaming.
- Objective: Confirm `ds2api.dash.id.vn` returns SSE `text/event-stream` for `stream: true` and forwards chunks unbuffered.
- Files likely touched: none (manual curl).
- Exact steps:
  1. From a local shell with the staging `.env`'s `OPENAI_COMPATIBLE_API_KEY` and `OPENAI_COMPATIBLE_BASE_URL` exported, run:
     ```
     curl -N -s -X POST "$OPENAI_COMPATIBLE_BASE_URL/chat/completions" \
       -H "Authorization: Bearer $OPENAI_COMPATIBLE_API_KEY" \
       -H "Content-Type: application/json" \
       -d '{"model":"<from env>","stream":true,"messages":[{"role":"user","content":"Say hi in Vietnamese, three sentences."}]}'
     ```
  2. Observe: lines start with `data: {...}`, contain `choices[0].delta.content`, and end with `data: [DONE]`. Chunks should arrive incrementally over 1-3 s, NOT as one blob at the end.
  3. Also test with `tools: [{"type":"function","function":{"name":"ping","description":"ping","parameters":{"type":"object","properties":{}}}}]` + a prompt that should call the tool ("call ping"). Confirm `delta.tool_calls[0].index`, `delta.tool_calls[0].function.name`, and `delta.tool_calls[0].function.arguments` arrive in chunks.
- Must do: capture a sample SSE log for the test fixture.
- Must not do: write any code in this task. This is verification only. If streaming is not supported, STOP and reopen the plan.
- Verification command/evidence: the curl above produces multiple `data:` lines, time-spread over >500 ms, with `[DONE]` terminator. Paste a 10-line snippet of the output into the PR description.

### Task 2: Add streaming method to `OpenAiCompatibleLlmClient`.
- Objective: Add `chat_stream(messages, tools=None) -> AsyncIterator[dict]` yielding delta dicts. Keep the existing `chat()` method untouched (the legacy `process_turn` and tests still use it; deleting it is out of scope).
- Files likely touched: `apps/xiaozhi-cloud/src/integrations/openai_compatible_llm.py`.
- Exact steps:
  1. Add `from typing import AsyncIterator` import.
  2. Add `chat_stream` async generator with this exact contract:
     ```python
     async def chat_stream(
         self, messages: list[dict], tools: list[dict] | None = None
     ) -> AsyncIterator[dict]:
         """
         Stream chat completion deltas. Yields dicts with one or more of:
           {"content": str}                      # token chunk
           {"tool_call_delta": {                 # tool call piece (assemble by index)
               "index": int,
               "id": str | None,                 # only set on first chunk for this index
               "name": str | None,               # only set on first chunk for this index
               "arguments": str,                 # concat across chunks
           }}
           {"finish_reason": str}                # "stop" | "tool_calls" | "length" | ...
         Terminates when the upstream emits [DONE]. Does NOT raise on benign
         end-of-stream; raises httpx.HTTPStatusError on HTTP errors.
         """
     ```
  3. Implementation: `body = {"model": self._model, "messages": messages, "stream": True}`, add tools if present, use `httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None))` with `client.stream("POST", url, headers=..., json=body)` and iterate `response.aiter_lines()`. For each line: skip empty / non-`data: ` lines, parse the JSON after `data: `, break on `[DONE]`, then for each choice's `delta` extract `content` and `tool_calls` separately and yield one event per piece. Yield `finish_reason` when present.
  4. Wrap the iter in `try/except httpx.HTTPError` and re-raise as a `RuntimeError("llm stream failed: ...")` for the runtime to handle.
- Must do: yield events in arrival order. Preserve `tool_call_delta.index` for caller-side assembly. Use `logging.getLogger(__name__)` for warnings on unexpected SSE shapes.
- Must not do: parse/decode tool arguments JSON inside the client — caller assembles the full argument string then `json.loads` it. Do NOT accumulate state internally.
- Verification command/evidence: new unit test `tests/test_llm_stream.py::test_chat_stream_parses_sse` with a mocked `httpx.AsyncClient` returning a canned SSE byte stream. Expected: yields the right sequence of dicts. Run with `cd apps/xiaozhi-cloud && pytest tests/test_llm_stream.py -v`. Exit code 0, both tests pass.

### Task 3: Add streaming method to `EdgeTtsClient`.
- Objective: Add `synthesize_stream(text) -> AsyncIterator[bytes]` yielding raw audio bytes (mp3) as they arrive. Keep existing `synthesize()` untouched.
- Files likely touched: `apps/xiaozhi-cloud/src/integrations/edge_tts_client.py`.
- Exact steps:
  1. Add `from typing import AsyncIterator`.
  2. Add:
     ```python
     async def synthesize_stream(self, text: str) -> AsyncIterator[bytes]:
         """Yield raw mp3 chunks as edge-tts produces them. Raises if no audio
         chunks are received (matches edge_tts.NoAudioReceived semantics)."""
     ```
  3. Body: iterate `edge_tts.Communicate(text, self._voice).stream()`, yield `chunk["data"]` only when `chunk["type"] == "audio"`. Count yielded chunks; if zero at end, raise `RuntimeError("edge tts produced no audio")`.
- Must do: keep existing `synthesize()` working (it now can be implemented as `b"".join([c async for c in self.synthesize_stream(text)])` to avoid duplication, but this is optional and out of scope if it complicates testing — leave as-is is fine).
- Must not do: do NOT decode mp3 here. That belongs in the streaming pipeline in Task 5.
- Verification command/evidence: unit test `tests/test_tts_stream.py::test_synthesize_stream_yields_chunks` with a monkeypatched `edge_tts.Communicate` whose `.stream()` yields canned dicts. Run `pytest tests/test_tts_stream.py -v`. Exit code 0.

### Task 4: Add streaming opus encoder to `audio.py`.
- Objective: Add (a) a stateful encoder class for per-sentence use, and (b) a streaming PCM-from-mp3 helper using a long-lived ffmpeg subprocess.
- Files likely touched: `apps/xiaozhi-cloud/src/audio.py`.
- Exact steps:
  1. Add class `OpusStreamEncoder` with:
     ```python
     class OpusStreamEncoder:
         def __init__(self, sample_rate: int, frame_ms: int, channels: int = 1) -> None: ...
         def encode_pcm_chunk(self, pcm_s16le: bytes) -> list[bytes]:
             """Append PCM, return zero or more full opus packets. Holds residual."""
         def flush(self) -> list[bytes]:
             """Zero-pad and emit final packet if residual exists; idempotent."""
         def close(self) -> None: ...
         def __enter__(self) -> "OpusStreamEncoder": ...
         def __exit__(self, *exc) -> None: ...   # calls close()
     ```
     Internals: same `_load_opus_lib()`, persistent `encoder` handle, internal `bytearray` buffer of residual PCM less than one frame. On `encode_pcm_chunk`: append, then slice off as many `frame_bytes` chunks as fit, encode each, return packets. On `flush`: zero-pad residual and encode if non-empty.
  2. Add async helper:
     ```python
     async def stream_mp3_to_opus_frames(
         mp3_iter: AsyncIterator[bytes],
         sample_rate: int,
         frame_ms: int,
         channels: int = 1,
     ) -> AsyncIterator[bytes]:
         """Pipe mp3 chunks through ffmpeg (stdin) to PCM (stdout), encode
         to opus frames, yield each opus frame as it is produced."""
     ```
     Implementation: spawn `ffmpeg -i pipe:0 -ar <sr> -ac 1 -f s16le pipe:1` with `stdin=PIPE, stdout=PIPE, stderr=PIPE`. Create two tasks: (i) feed mp3 chunks to stdin then close it, (ii) read PCM from stdout in chunks of e.g. 8 KB, push through `OpusStreamEncoder.encode_pcm_chunk`, and `yield` each produced opus packet via an `asyncio.Queue`. On stdin task finish and stdout EOF: call `encoder.flush()` and yield trailing packets. On non-zero return code, read stderr, log it, raise `RuntimeError`.
     Use `asyncio.create_subprocess_exec`. Capture stderr (don't `DEVNULL` it) so we can log decode failures (current code already learned this lesson, see commit `4d2afe3`).
  3. Do NOT remove existing `transcode_to_opus_frames`, `decode_audio_to_pcm`, or `_run_ffmpeg`. They are still used by tests and the legacy `process_turn` path.
- Must do: zero-copy where reasonable; do NOT load full PCM into memory.
- Must not do: do NOT change `_encode_pcm_to_opus_frames`, `transcode_to_opus_frames`, or any existing function signature.
- Verification command/evidence:
  - Unit test `tests/test_audio_stream.py::test_opus_stream_encoder_emits_full_frames`: feed PCM of size exactly 2.5 frames, assert exactly 2 packets emitted from `encode_pcm_chunk`, 1 more on `flush`.
  - Integration test (skipped if ffmpeg missing) `test_stream_mp3_to_opus_frames_smoke`: feed a small mp3 fixture (use `tests/fixtures/short.mp3`, create if missing — 200 ms silence is fine via `ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.2 -c:a libmp3lame`), assert at least one opus frame is yielded.
  - Run: `cd apps/xiaozhi-cloud && pytest tests/test_audio_stream.py -v`.

### Task 5: Add `generate_response_stream` to `XiaozhiRuntime`.
- Objective: New method yielding a sequence of "events" the WebSocket handler can act on, while internally consuming the LLM stream and pipelining per-sentence TTS.
- Files likely touched: `apps/xiaozhi-cloud/src/services/runtime.py`.
- Exact steps:
  1. Define an event protocol (simple typed dicts — no need for new dataclasses):
     ```
     {"type": "tts_start"}                                    # emitted once, on first content delta of any hop
     {"type": "sentence_start", "text": str}                  # once per sentence, BEFORE its audio
     {"type": "audio_frame", "opus": bytes, "index": int}     # one per opus packet, monotonically indexed across all sentences in this turn
     {"type": "tts_stop"}                                     # after final sentence audio drained
     {"type": "error", "message": str}                        # non-fatal warning (e.g. one sentence TTS failed)
     ```
  2. New method signature:
     ```python
     async def generate_response_stream(
         self, session: DeviceSession
     ) -> AsyncIterator[dict]:
     ```
     Returns nothing else; appends the final assistant content to `conversation_history` and `_store.save(session)` BEFORE the `tts_stop` event so a disconnect mid-stream still persists the turn.
  3. Sentence buffer algorithm (pseudocode):
     ```
     SENTENCE_TERMINATORS = ".?!\n;:"
     MAX_SENTENCE_CHARS = 160
     buffer = ""
     def try_split() -> list[str]:
         out = []
         while True:
             # find earliest terminator
             idx = min((buffer.find(c) for c in SENTENCE_TERMINATORS if buffer.find(c) >= 0), default=-1)
             if idx >= 0:
                 sentence = buffer[:idx+1].strip()
                 buffer = buffer[idx+1:]
                 if sentence: out.append(sentence)
                 continue
             if len(buffer) >= MAX_SENTENCE_CHARS:
                 # force-flush at a word boundary if possible
                 cut = buffer.rfind(" ", 0, MAX_SENTENCE_CHARS)
                 if cut <= 0: cut = MAX_SENTENCE_CHARS
                 sentence = buffer[:cut].strip()
                 buffer = buffer[cut:]
                 if sentence: out.append(sentence)
                 continue
             break
         return out
     # at stream end: if buffer.strip(): emit it
     ```
  4. Tool-loop integration: replace the existing `for iteration in range(MAX_TOOL_ITERATIONS)` body with:
     ```
     for iteration in range(MAX_TOOL_ITERATIONS):
         tool_calls_accum = {}      # index -> {"id": str, "name": str, "arguments": str}
         content_accum = ""
         finish_reason = None
         tts_started = False
         frame_index = 0
         sentence_queue = asyncio.Queue()    # str sentences
         tts_task = None                     # spawned on first sentence

         async for event in self._llm_client.chat_stream(messages, tools=tools or None):
             if "content" in event:
                 piece = event["content"]
                 if piece:
                     if not tts_started:
                         yield {"type": "tts_start"}
                         tts_started = True
                         tts_task = asyncio.create_task(
                             self._run_tts_pipeline(sentence_queue, session, output_queue)
                         )
                     content_accum += piece
                     buffer += piece
                     for sentence in try_split():
                         yield {"type": "sentence_start", "text": sentence}
                         await sentence_queue.put(sentence)
             elif "tool_call_delta" in event:
                 d = event["tool_call_delta"]
                 slot = tool_calls_accum.setdefault(d["index"], {"id": None, "name": None, "arguments": ""})
                 if d["id"]: slot["id"] = d["id"]
                 if d["name"]: slot["name"] = d["name"]
                 slot["arguments"] += d["arguments"]
             elif "finish_reason" in event:
                 finish_reason = event["finish_reason"]

         # End of this LLM hop's stream.
         if tool_calls_accum and not content_accum.strip():
             # Pure tool-call hop — execute and continue.
             assistant_msg = self._build_assistant_msg_from_tool_calls(tool_calls_accum)
             messages.append(assistant_msg)
             await self._execute_tool_calls_and_append(messages, tool_calls_accum, session)
             continue

         # Content hop — finalize TTS pipeline.
         # Flush remaining buffer
         if buffer.strip():
             yield {"type": "sentence_start", "text": buffer.strip()}
             await sentence_queue.put(buffer.strip())
         await sentence_queue.put(None)   # sentinel
         # Drain the TTS task's output_queue, yielding audio_frame events
         await tts_task
         session.add_turn("assistant", content_accum.strip())
         await self._store.save(session)
         yield {"type": "tts_stop"}
         return

     # Iteration cap reached — same fallback as today but streamed.
     # Force-call non-streaming chat (existing self._llm_client.chat) for final answer
     # and emit it as a single sentence batch via the same pipeline.
     ```
     IMPORTANT for ordering of `audio_frame` vs new `sentence_start`: the consumer (main.py) needs `sentence_start` for sentence N before audio frames for sentence N. The simplest implementation: serialize the TTS pipeline so it processes one sentence at a time (already true via the queue), and emit `audio_frame` events DIRECTLY from `generate_response_stream` as the per-sentence TTS yields them. That means the LLM-side and TTS-side both produce events into ONE merged ordered stream that this function yields.
  5. Replace `sentence_queue`/`output_queue` plumbing with a single merged generator pattern:
     ```
     events = asyncio.Queue()   # everything yielded out of generate_response_stream
     # LLM-side task: pushes tts_start/sentence_start events AND pushes sentences into a sentence channel
     # TTS-side task: consumes sentences serially, runs stream_mp3_to_opus_frames per sentence, pushes audio_frame events to events
     # Main coroutine: yields from events queue until both tasks are done and queue is drained
     ```
     This avoids out-of-order audio. See implementation note: use `asyncio.Event` for "LLM done" and "TTS done" and a single `events: asyncio.Queue` with a None sentinel for shutdown.
  6. Per-sentence TTS task body:
     ```
     async def _tts_one_sentence(self, sentence: str, session, events: asyncio.Queue, frame_index_ref) -> None:
         for attempt in range(2):  # initial + 1 retry
             try:
                 mp3_iter = self._tts_client.synthesize_stream(sentence)
                 async for opus_frame in stream_mp3_to_opus_frames(
                     mp3_iter, session.audio_sample_rate, session.audio_frame_duration
                 ):
                     await events.put({"type": "audio_frame", "opus": opus_frame, "index": frame_index_ref[0]})
                     frame_index_ref[0] += 1
                 return
             except Exception as exc:
                 if attempt == 0:
                     logger.warning("tts retry sentence=%r error=%s", sentence[:40], exc)
                     await asyncio.sleep(0.2)
                     continue
                 logger.warning("tts gave up sentence=%r error=%s", sentence[:40], exc)
                 await events.put({"type": "error", "message": f"tts failed: {exc}"})
                 return
     ```
  7. Helper for tool-call assembly: `_build_assistant_msg_from_tool_calls(accum: dict[int, dict]) -> dict` — produces `{"role": "assistant", "content": None, "tool_calls": [{"id": ..., "type": "function", "function": {"name": ..., "arguments": ...}} for each index in sorted order]}`. This matches the OpenAI tool-call message format the existing non-streaming branch already uses (runtime.py line 243).
  8. Helper for tool execution: `_execute_tool_calls_and_append(messages, accum, session)` — iterates accum sorted by index; for each, `json.loads(arguments or "{}")` (catch `JSONDecodeError`, default `{}`); calls `self._mcp_client.call_tool(name, args)` (or returns "Tool not available" if no client/name); appends `{"role": "tool", "tool_call_id": id_or_uuid, "content": result}` to messages. SAME semantics as today (runtime.py lines 245-273).
  9. Iteration-cap fallback: after the for-loop exits without returning, call the existing non-streaming `self._llm_client.chat(messages, tools=None)`, take its `content`, emit as a single forced sentence (`yield sentence_start; queue; drain`), then `tts_stop`. Match current warning log message.
  10. Keep the existing `generate_response` method unchanged for now (used by legacy `process_turn` and existing tests; deleting it is a follow-up).
- Must do:
  - Append `conversation_history` only on successful CONTENT hop completion, not on tool-call hops (matches current semantics — tool-call assistant messages live only in `messages`, not in `conversation_history`).
  - `_store.save(session)` once at the end of the turn (before yielding `tts_stop`).
  - If the LLM stream raises mid-content (e.g., httpx error), let the exception propagate — `_process_turn` in main.py will catch it and send the error `tts.stop` (current behavior).
- Must not do:
  - Do NOT change `MAX_TOOL_ITERATIONS`.
  - Do NOT change MCP cache fetching (`_get_mcp_tools` unchanged).
  - Do NOT batch all sentences before TTS — that defeats the purpose.
  - Do NOT process sentences in parallel — serial keeps audio in order. (A future slice can pipeline N=2.)
- Verification command/evidence:
  - Unit test `tests/test_runtime_stream.py::test_generate_response_stream_emits_ordered_events`: mock `llm_client.chat_stream` to yield content deltas across sentence boundaries; mock `tts_client.synthesize_stream` to yield canned mp3-ish bytes; mock `stream_mp3_to_opus_frames` (via monkeypatching the import) to yield fake opus bytes. Assert event order is: `tts_start`, `sentence_start("Xin chào.")`, `audio_frame*N`, `sentence_start("Bạn khỏe không?")`, `audio_frame*M`, `tts_stop`.
  - Unit test `test_generate_response_stream_runs_tool_loop`: mock first `chat_stream` to yield `tool_call_delta` chunks + `finish_reason: tool_calls`, second `chat_stream` to yield content. Mock `_mcp_client.call_tool`. Assert: `tts_start` is emitted ONLY after the second hop's first content delta; messages list passed to second call contains assistant tool_calls + tool result.
  - Unit test `test_generate_response_stream_tts_retry`: TTS fails once then succeeds; assert audio is emitted on the second attempt and one `logger.warning` is captured.
  - Unit test `test_generate_response_stream_iteration_cap`: 5 tool-call hops in a row; assert non-streaming `chat()` is called once as fallback and content is emitted.
  - Run: `cd apps/xiaozhi-cloud && pytest tests/test_runtime_stream.py -v`. Exit code 0.

### Task 6: Wire `_process_turn` in `main.py` to the streaming generator.
- Objective: Replace the batched `generate_response()` + `transcode_to_opus_frames()` + frame loop with a single consume-the-event-stream loop.
- Files likely touched: `apps/xiaozhi-cloud/src/main.py`.
- Exact steps:
  1. Replace the body of `_process_turn` (lines 239-295) from after `transcribe_audio` onward with:
     ```
     await websocket.send_text(json.dumps({"type": "stt", "text": transcript, "session_id": session.session_id}))
     frame_timestamp = 0
     async for event in _runtime.generate_response_stream(session):
         t = event["type"]
         if t == "tts_start":
             await websocket.send_text(json.dumps({"type": "tts", "state": "start", "session_id": session.session_id}))
         elif t == "sentence_start":
             await websocket.send_text(json.dumps({
                 "type": "tts", "state": "sentence_start",
                 "text": event["text"], "session_id": session.session_id,
             }))
         elif t == "audio_frame":
             await websocket.send_bytes(build_audio_frame(
                 session.protocol_version, event["opus"], timestamp=frame_timestamp,
             ))
             frame_timestamp += session.audio_frame_duration
             if event["index"] + 1 > TTS_PREROLL_FRAMES:
                 await sleep(session.audio_frame_duration / 1000)
         elif t == "tts_stop":
             await sleep(TTS_STOP_DELAY_SECONDS)
             await websocket.send_text(json.dumps({"type": "tts", "state": "stop", "session_id": session.session_id}))
         elif t == "error":
             logger.warning("turn non-fatal error session_id=%s msg=%s", session.session_id, event["message"])
     await _runtime.transition(session, SessionPhase.READY)
     session.reset_audio()
     ```
  2. Keep the outer `try/except WebSocketDisconnect/Exception` exactly as today (lines 282-295), with the same error `tts.stop` send-on-failure pattern. The streaming generator can raise mid-iteration; that gets caught by the outer `except Exception`.
  3. Remove the `from .audio import transcode_to_opus_frames` import. Keep `build_audio_frame`.
- Must do: preserve current logging shape ("session interrupted", "client disconnected during turn", "turn processing failed"). Preserve `TTS_PREROLL_FRAMES`, `TTS_STOP_DELAY_SECONDS`.
- Must not do: do NOT add intermediate buffering. Forward audio frames out as fast as they come, subject to the existing pacing rule.
- Verification command/evidence:
  - Run existing tests: `cd apps/xiaozhi-cloud && pytest tests/test_runtime.py tests/test_parser.py tests/test_audio.py -v` — all green (these don't touch the streaming path).
  - Manual smoke (after deploy to staging): connect a device, observe staging logs show `tts_start` event sequence and per-sentence `sentence_start` lines before audio frames.

### Task 7: Fix the stale `test_turn.py` and remove dead `process_turn`/`TurnResult` if untested elsewhere.
- Objective: Bring tests in line with reality and remove now-unused code paths.
- Files likely touched: `apps/xiaozhi-cloud/tests/test_turn.py`, optionally `apps/xiaozhi-cloud/src/services/runtime.py`.
- Exact steps:
  1. `grep -rn "process_turn\|TurnResult" apps/xiaozhi-cloud/` — if the only references are `runtime.py:291` (definition) and `tests/test_turn.py`, then update `test_turn.py` to test `generate_response_stream` instead: mock `stt`, `llm.chat_stream` (async generator), `tts.synthesize_stream`, and assert events. Remove the old `test_process_turn_uses_stt_llm_and_tts` test.
  2. Decide whether to delete `process_turn` and `TurnResult`. If they're truly orphaned, delete them in this commit. If unsure, leave them (they're harmless).
- Must do: do not break test discovery; keep the file present (replace contents).
- Must not do: do not change `generate_response` (legacy non-streaming) unless explicitly deleting it; leaving it costs nothing.
- Verification command/evidence: `cd apps/xiaozhi-cloud && pytest -v` — all tests pass.

### Task 8: Manual end-to-end latency measurement on staging.
- Objective: Confirm the user-facing acceptance criterion.
- Files likely touched: none.
- Exact steps:
  1. Push branch, let CI deploy to staging (commit `5ace459` already established this works).
  2. From staging logs, instrument timestamps around: `stt` send, first `tts_start` send, first `audio_frame` `send_bytes`, last `audio_frame`, `tts_stop`. (Add `logger.info` lines if not already present; remove before final merge OR keep at DEBUG level.)
  3. Run 5 typical short Vietnamese voice queries on the device. Record per-turn `stt → first audio frame` latency.
  4. Acceptance: median of the 5 measurements ≤ 1000 ms (target <1 s on a typical short reply). Worst case ≤ 1500 ms.
- Must do: capture the log excerpts and put them in the PR description.
- Must not do: do not declare done based on local pytest alone; the win is end-to-end.

## Acceptance Criteria
1. **Unit tests pass**:
   - command: `cd apps/xiaozhi-cloud && pytest -v`
   - expected result: exit 0, all tests pass including new `test_llm_stream.py`, `test_tts_stream.py`, `test_audio_stream.py`, `test_runtime_stream.py`, and updated `test_turn.py`.
   - evidence: pytest summary line "X passed in Y.YYs", X ≥ pre-refactor count + (at least) 8.
2. **Streaming verification with DeepSeek proxy**:
   - command: `curl -N -s -X POST "$OPENAI_COMPATIBLE_BASE_URL/chat/completions" -H "Authorization: Bearer $OPENAI_COMPATIBLE_API_KEY" -H "Content-Type: application/json" -d '{"model":"<model>","stream":true,"messages":[{"role":"user","content":"three sentences"}]}'`
   - expected result: multiple `data: {...}` lines with `delta.content`, time-spread (use `ts` or similar to confirm chunks are >100 ms apart), terminated by `data: [DONE]`.
   - evidence: 10-line excerpt in PR description.
3. **No regression on existing protocol message order**:
   - command: read `apps/xiaozhi-cloud/src/main.py` `_process_turn` body.
   - expected result: emits, in order, exactly `stt` → `tts.start` → (`sentence_start` → binary opus frames)+ → `tts.stop`.
   - evidence: code inspection in review; staging log sample shows the same order.
4. **End-to-end latency** (manual but objective):
   - command: from staging logs, compute `T_first_audio_frame - T_stt_sent` over 5 short queries.
   - expected result: median ≤ 1000 ms, worst ≤ 1500 ms.
   - evidence: 5 timestamp triples pasted into the PR description.
5. **Tool-call hop still works**:
   - command: speak a query that triggers a known MCP tool ("turn off the light" or whichever tool exists in the project).
   - expected result: staging log shows `tool_calls iteration=...` then `mcp call_tool name=...` then content streams and audio plays. Total time ≤ pre-refactor + 500 ms (i.e., tool hop unchanged, content hop streams).
   - evidence: staging log excerpt in PR description.
6. **Edge TTS retry path is exercised at least once**:
   - command: run staging for 10 minutes of conversational use OR inject a mock failure in a unit test.
   - expected result: log line `tts retry sentence=...` appears at least once OR the unit test `test_generate_response_stream_tts_retry` passes (preferred and sufficient).
   - evidence: pytest output for the retry test.

## Risks
- **Risk**: DeepSeek proxy does NOT support `stream: true` or buffers responses (delivers all chunks at end).
  - Mitigation: Task 1 verifies this BEFORE any code change. If buffered, abort the slice and find alternative (direct DeepSeek key, switch model provider, or accept the slice cannot land).
- **Risk**: Tool-call delta JSON arguments may split mid-character on non-ASCII; current accumulation by string concat handles this correctly (it's UTF-8 byte-safe at the SSE level because httpx `aiter_lines` already decodes), but `json.loads` only runs after full concat, which is correct.
  - Mitigation: a unit test in Task 5 covers Vietnamese diacritics in tool arguments.
- **Risk**: ffmpeg streaming subprocess hangs if stdin is not closed promptly after mp3 ends.
  - Mitigation: the stdin-feeder task closes `proc.stdin` immediately after the async iterator is exhausted; add a 10 s wall-clock timeout around the whole `stream_mp3_to_opus_frames` per sentence; on timeout kill the process and treat as TTS failure → retry path.
- **Risk**: Out-of-order events between LLM-side and TTS-side tasks lead to audio frames arriving before their sentence_start.
  - Mitigation: serialize the TTS pipeline (single sentence at a time, FIFO queue) AND emit `sentence_start` from the LLM-side task BEFORE enqueueing the sentence for TTS. Since TTS-side cannot start producing audio for sentence N+1 until sentence N is fully drained (serial), and audio frames go through the same `events` queue (FIFO), order is preserved.
- **Risk**: Edge TTS produces no audio chunks (the staging-observed `NoAudioReceived`) and our retry still fails.
  - Mitigation: Decision 6 — skip the sentence, emit `error` event, continue. Net result: device shows the sentence text on its screen but no audio for that sentence. Acceptable; turn does not abort.
- **Risk**: The streaming generator raises mid-turn; the outer `except Exception` in `_process_turn` sends `tts.stop` but `tts.start` may not have been sent yet, leading to a device-side state mismatch.
  - Mitigation: the device tolerates `tts.stop` without prior `tts.start` (it's a no-op in current xiaozhi firmware). Confirm by inspecting `tts.stop` handling on the device side once on staging. If problematic, gate the error `tts.stop` send on a flag that tracks whether `tts.start` was emitted.
- **Risk**: A regression breaks the non-streaming tool path (very recently shipped in 5ace459).
  - Mitigation: the streaming path's tool-loop logic mirrors the existing one line-by-line in helpers `_build_assistant_msg_from_tool_calls` and `_execute_tool_calls_and_append`. Code review (Argus) should diff these against the existing inline implementation in `generate_response` to confirm semantic equivalence.

## Rollback Plan
- Branch-level: this is one feature branch; revert the merge commit on `feat/xiaozhi-custom-cloud` to restore commit `5ace459`. CI/CD will redeploy the previous image.
- File-level (no revert): set an env flag `XIAOZHI_STREAMING=0` and gate `_process_turn` between the new streaming consumer and the old batched call. **NOT recommended** because it doubles code paths; prefer revert.
- Image-level fast rollback: on the VPS, re-pull the previous tag and `docker compose up -d`. The previous image tag is preserved in GHCR.

## Verification Plan (For Hephaestus + Argus)
- **Hephaestus (implementer) must do, in order**:
  1. Task 1 (curl verification). If this fails, STOP and reopen the plan.
  2. Tasks 2-4 in any order (independent integrations). Run their unit tests after each.
  3. Task 5 (runtime streaming). Run `pytest tests/test_runtime_stream.py -v`.
  4. Task 6 (wire main.py). Run `pytest -v` (all tests).
  5. Task 7 (fix stale tests).
  6. Local docker run to confirm boot: `docker compose -f apps/xiaozhi-cloud/docker-compose.yml up --build` → `curl localhost:8000/health` returns `providers_ready` all true.
  7. Push branch, wait for staging deploy, then Task 8 manual measurement.
- **Argus (reviewer) must look at**:
  1. Decision 7 (tool-loop branching) implementation in `generate_response_stream` vs the existing logic in `generate_response`. They MUST be semantically equivalent for the tool-call path (same messages list shape, same call to `_get_mcp_tools`, same MAX_TOOL_ITERATIONS, same fallback `chat()` call at cap).
  2. Event ordering proof: trace through `generate_response_stream` for a 2-sentence reply and confirm `audio_frame` for sentence N never precedes `sentence_start` for sentence N or follows `sentence_start` for sentence N+1.
  3. ffmpeg subprocess lifecycle: stdin closed, stdout drained, stderr logged on non-zero exit, process awaited (no zombies).
  4. No new dependencies in `pyproject.toml`. The slice should add zero new packages.
  5. `logging` used everywhere (no `print`), no bare `except`, no `as any`-equivalent (Python: no `# type: ignore` outside the one pre-existing one in `_get_mcp_tools`).
  6. Latency numbers from Task 8 in PR description.

## Ready / Blocked
READY.

Pre-requisite for Hephaestus to start: nothing. Task 1 (curl verification) is the first thing the implementer does and is part of the slice, not a separate gating question.
