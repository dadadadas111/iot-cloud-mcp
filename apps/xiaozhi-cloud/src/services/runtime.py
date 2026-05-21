from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import AsyncIterator

from fastapi import WebSocket

from ..audio import stream_mp3_to_opus_frames, stream_pcm_to_opus_frames
from ..protocol.models import AbortMessage, AudioParams, HelloMessage, ListenMessage, ListenState, ServerHelloMessage
from ..session.models import DeviceSession, SessionPhase
from ..session.store import SessionStore

logger = logging.getLogger(__name__)

# Maximum number of tool-call iterations per turn to prevent runaway loops.
MAX_TOOL_ITERATIONS = 5

SENTENCE_TERMINATORS = "?!\n;"
MAX_SENTENCE_CHARS = 160

# Matches a sentence boundary: simple terminators, or a period only when followed
# by whitespace/end-of-string (avoids splitting URLs, decimals, abbreviations).
_SPLIT_RE = re.compile(r'[?!\n;]|\.(?=\s|$)')


def _try_split(buffer: str) -> tuple[list[str], str]:
    """Extract complete sentences from buffer. Returns (sentences, remaining_buffer)."""
    out: list[str] = []
    while True:
        m = _SPLIT_RE.search(buffer)
        if m:
            sentence = buffer[: m.end()].strip()
            buffer = buffer[m.end() :]
            if sentence:
                out.append(sentence)
            continue
        if len(buffer) >= MAX_SENTENCE_CHARS:
            cut = buffer.rfind(" ", 0, MAX_SENTENCE_CHARS)
            if cut <= 0:
                cut = MAX_SENTENCE_CHARS
            sentence = buffer[:cut].strip()
            buffer = buffer[cut:]
            if sentence:
                out.append(sentence)
            continue
        break
    return out, buffer


class XiaozhiRuntime:
    def __init__(self, store: SessionStore, stt_client=None, llm_client=None, tts_client=None, mcp_client=None) -> None:
        self._store = store
        self._stt_client = stt_client
        self._llm_client = llm_client
        self._tts_client = tts_client
        self._mcp_client = mcp_client

    async def bootstrap_session(self, websocket: WebSocket, hello: HelloMessage) -> DeviceSession:
        protocol_version = int(websocket.headers["protocol-version"])
        session = DeviceSession(
            session_id=str(uuid.uuid4()),
            device_id=hello.device_id or websocket.headers["device-id"],
            client_id=hello.client_id or websocket.headers["client-id"],
            protocol_version=protocol_version or hello.version,
            audio_sample_rate=hello.audio_params.sample_rate,
            audio_channels=hello.audio_params.channels,
            audio_frame_duration=hello.audio_params.frame_duration,
            phase=SessionPhase.READY,
        )
        await self._store.save(session)
        logger.info(
            "session bootstrapped session_id=%s device_id=%s client_id=%s version=%s",
            session.session_id,
            session.device_id,
            session.client_id,
            session.protocol_version,
        )
        return session

    async def server_hello(self, session: DeviceSession) -> ServerHelloMessage:
        return ServerHelloMessage(
            version=session.protocol_version,
            session_id=session.session_id,
            audio_params=AudioParams(
                sample_rate=session.audio_sample_rate,
                channels=session.audio_channels,
                frame_duration=session.audio_frame_duration,
            ),
        )

    async def transition(self, session: DeviceSession, phase: SessionPhase) -> None:
        session.phase = phase
        await self._store.save(session)

    async def handle_control_message(
        self,
        session: DeviceSession,
        message: ListenMessage | AbortMessage,
    ) -> bool:
        self._validate_session_message(session, message.session_id)

        if isinstance(message, ListenMessage):
            return await self._handle_listen_message(session, message)

        session.last_abort_reason = message.reason
        await self.transition(session, SessionPhase.INTERRUPTED)
        logger.info(
            "session interrupted session_id=%s reason=%s",
            session.session_id,
            session.last_abort_reason,
        )
        session.reset_audio()
        return False

    def _validate_session_message(self, session: DeviceSession, message_session_id: str | None) -> None:
        if message_session_id is not None and message_session_id != session.session_id:
            raise ValueError("session_id mismatch")

    async def _handle_listen_message(self, session: DeviceSession, message: ListenMessage) -> bool:
        if message.state == ListenState.START:
            session.listen_mode = message.mode.value if message.mode else None
            session.reset_audio()
            session.listening_started_at = time.time()
            await self.transition(session, SessionPhase.LISTENING)
            logger.info(
                "session listening session_id=%s mode=%s",
                session.session_id,
                session.listen_mode,
            )
            return False

        if message.state == ListenState.DETECT:
            session.listen_mode = message.mode.value if message.mode else session.listen_mode
            session.reset_audio()
            session.listening_started_at = time.time()
            await self.transition(session, SessionPhase.LISTENING)
            logger.info(
                "wake detected session_id=%s text=%s",
                session.session_id,
                message.text,
            )
            return False

        if session.phase != SessionPhase.LISTENING:
            raise ValueError("listen.stop received while not listening")

        await self.transition(session, SessionPhase.PROCESSING)
        logger.info("session processing session_id=%s", session.session_id)
        return True

    async def handle_audio_frame(self, session: DeviceSession, payload: bytes) -> None:
        if session.phase != SessionPhase.LISTENING:
            logger.info(
                "dropping audio session_id=%s phase=%s payload_bytes=%s",
                session.session_id,
                session.phase,
                len(payload),
            )
            return
        session.append_audio(payload)
        await self._store.save(session)

    async def transcribe_audio(self, session: DeviceSession, wav_audio: bytes) -> str:
        """STT only — returns transcript and stores user turn in session."""
        if self._stt_client is None:
            raise RuntimeError("STT provider is not configured")

        transcript = (await self._stt_client.transcribe(wav_audio, filename="turn.wav")).strip()
        if not transcript:
            raise RuntimeError("empty transcript")

        session.add_turn("user", transcript)
        await self._store.save(session)
        return transcript

    async def _get_mcp_tools(self, session: DeviceSession) -> list[dict]:
        """
        Return the MCP tool list for this session, using the per-session cache.
        Fetches from the server on first call or when the cache is stale (TTL=5 min).
        On fetch failure, clears the cache and returns an empty list so the turn
        can still proceed without tools.
        """
        if self._mcp_client is None:
            return []

        if not session.is_mcp_tools_stale():
            # Cache is valid — use it.
            return session.mcp_tools  # type: ignore[return-value]

        try:
            tools = await self._mcp_client.list_tools_as_openai_schema()
            session.set_mcp_tools(tools)
            await self._store.save(session)
            logger.info(
                "mcp tools fetched session_id=%s count=%d",
                session.session_id,
                len(tools),
            )
            return tools
        except Exception as exc:
            # Refresh-on-error: invalidate cache so next turn retries.
            session.mcp_tools = None
            session.mcp_tools_fetched_at = None
            logger.warning(
                "mcp list_tools failed session_id=%s error=%s — proceeding without tools",
                session.session_id,
                exc,
            )
            return []

    async def generate_response_stream(
        self, session: DeviceSession
    ) -> AsyncIterator[dict]:
        """
        Stream LLM + tool-loop + sentence-pipelined TTS. Yields typed event dicts:
          {"type": "tts_start"}
          {"type": "sentence_start", "text": str}
          {"type": "audio_frame", "opus": bytes, "index": int}
          {"type": "tts_stop"}
          {"type": "error", "message": str}

        LLM streaming and TTS run concurrently on content hops: as soon as the first
        sentence boundary is detected in the LLM stream, TTS starts for that sentence
        while later tokens are still being generated. The events queue serialises output
        so the caller sees the correct ordering.

        Appends assistant content to conversation_history and saves session BEFORE
        yielding tts_stop so a disconnect mid-stream still persists the turn.
        """
        if self._llm_client is None or self._tts_client is None:
            raise RuntimeError("LLM/TTS providers are not configured")

        system_prompt = "You are a helpful Vietnamese-speaking assistant. Keep replies concise and natural for voice conversation."
        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        messages.extend(session.conversation_history)

        from ..config.settings import settings
        tools = [] if settings.llm_disable_tools else await self._get_mcp_tools(session)

        for iteration in range(MAX_TOOL_ITERATIONS):
            # Shared queues for this hop.
            # events_q: all events flowing out of generate_response_stream (excl. tts_stop).
            #   Sentinel None means TTS pipeline finished.
            # sentence_q: sentences from LLM side to TTS side. Sentinel None = LLM done.
            # hop_result: carries the hop type ("tool_calls" or "content") from LLM task to main.
            events_q: asyncio.Queue[dict | None] = asyncio.Queue()
            sentence_q: asyncio.Queue[str | None] = asyncio.Queue()
            hop_result: dict = {}
            frame_index_ref = [0]

            # tts_started is a one-element list so _llm_task can mutate it as a
            # closure cell shared across hops (Fix 4: emit tts_start in _llm_task).
            tts_started_ref = [False]

            async def _llm_task() -> None:
                """Drain LLM stream; emit tts_start on first enqueued sentence; push sentences."""
                tool_calls_accum: dict[int, dict] = {}
                content_accum_inner = ""
                buffer_inner = ""

                try:
                    async for llm_event in self._llm_client.chat_stream(messages, tools=tools or None):
                        if "content" in llm_event:
                            piece = llm_event["content"]
                            if piece:
                                content_accum_inner += piece
                                buffer_inner += piece
                                new_sentences, buffer_inner = _try_split(buffer_inner)
                                for sentence in new_sentences:
                                    # Emit tts_start exactly once, when the first sentence is
                                    # ready — guarantees a TTS audio path exists before the
                                    # client sees tts_start.
                                    if not tts_started_ref[0]:
                                        await events_q.put({"type": "tts_start"})
                                        tts_started_ref[0] = True
                                    await sentence_q.put(sentence)

                        elif "tool_call_delta" in llm_event:
                            d = llm_event["tool_call_delta"]
                            slot = tool_calls_accum.setdefault(
                                d["index"], {"id": None, "name": None, "arguments": ""}
                            )
                            if d["id"]:
                                slot["id"] = d["id"]
                            if d["name"]:
                                slot["name"] = d["name"]
                            slot["arguments"] += d["arguments"]

                    if tool_calls_accum and not content_accum_inner.strip():
                        hop_result["type"] = "tool_calls"
                        hop_result["accum"] = tool_calls_accum
                        await sentence_q.put(None)
                        return

                    # Fix 3: empty content with no tool_calls is an error.
                    if not content_accum_inner.strip() and not tool_calls_accum:
                        hop_result["type"] = "empty"
                        await sentence_q.put(None)
                        return

                    # Flush residual buffer as final sentence.
                    if buffer_inner.strip():
                        if not tts_started_ref[0]:
                            await events_q.put({"type": "tts_start"})
                            tts_started_ref[0] = True
                        await sentence_q.put(buffer_inner.strip())

                    hop_result["type"] = "content"
                    hop_result["content_accum"] = content_accum_inner.strip()
                    await sentence_q.put(None)

                except BaseException:
                    # Fix 1: always unblock _tts_task even if _llm_task dies.
                    await sentence_q.put(None)
                    raise

            async def _tts_task() -> None:
                """Consume sentences; emit sentence_start+audio per sentence."""
                try:
                    while True:
                        sentence = await sentence_q.get()
                        if sentence is None:
                            break
                        # sentence_start fires BEFORE this sentence's audio frames (Decision 5).
                        await events_q.put({"type": "sentence_start", "text": sentence})
                        await self._tts_one_sentence(sentence, session, events_q, frame_index_ref)
                finally:
                    await events_q.put(None)  # sentinel: unblock consumer even on failure

            llm_t = asyncio.create_task(_llm_task())
            tts_t = asyncio.create_task(_tts_task())

            try:
                while True:
                    ev = await events_q.get()
                    if ev is None:
                        break
                    yield ev
            except BaseException:
                llm_t.cancel()
                tts_t.cancel()
                raise

            # Fix 1: propagate exceptions from tasks (gather surfaces them cleanly).
            await asyncio.gather(llm_t, tts_t)

            # Fix 3: raise on empty response (no content, no tool_calls).
            if hop_result.get("type") == "empty":
                raise RuntimeError("empty llm response")

            if hop_result.get("type") == "tool_calls":
                tool_names = ", ".join(v.get("name", "?") for v in hop_result["accum"].values())
                yield {"type": "tool_thinking", "text": f"[{tool_names}]"}
                logger.info(
                    "tool_calls iteration=%d session_id=%s calls=%s",
                    iteration,
                    session.session_id,
                    [v.get("name") for v in hop_result["accum"].values()],
                )
                assistant_msg = self._build_assistant_msg_from_tool_calls(hop_result["accum"])
                messages.append(assistant_msg)
                session.add_message(assistant_msg)
                await self._execute_tool_calls_and_append(messages, hop_result["accum"], session)
                await self._store.save(session)
                continue

            # Content hop complete.
            session.add_turn("assistant", hop_result.get("content_accum", ""))
            await self._store.save(session)
            yield {"type": "tts_stop"}
            return

        # Iteration cap — force a non-streaming final answer.
        logger.warning(
            "tool loop iteration cap reached session_id=%s max=%d — forcing final reply",
            session.session_id,
            MAX_TOOL_ITERATIONS,
        )
        final_msg = await self._llm_client.chat(messages, tools=None)
        response_text = (final_msg.get("content") or "").strip()
        if not response_text:
            raise RuntimeError("empty llm response after tool loop cap")

        events_cap: asyncio.Queue[dict | None] = asyncio.Queue()
        frame_index_ref_cap = [0]

        async def _tts_cap() -> None:
            await self._tts_one_sentence(response_text, session, events_cap, frame_index_ref_cap)
            await events_cap.put(None)

        tts_task_cap = asyncio.create_task(_tts_cap())
        yield {"type": "tts_start"}
        yield {"type": "sentence_start", "text": response_text}

        try:
            while True:
                ev = await events_cap.get()
                if ev is None:
                    break
                yield ev
        except BaseException:
            tts_task_cap.cancel()
            raise
        await tts_task_cap

        session.add_turn("assistant", response_text)
        await self._store.save(session)
        yield {"type": "tts_stop"}

    async def _tts_one_sentence(
        self,
        sentence: str,
        session: DeviceSession,
        events: asyncio.Queue,
        frame_index_ref: list[int],
    ) -> None:
        """Run TTS + encode for one sentence, push audio_frame events. Retries once on failure."""
        for attempt in range(2):
            try:
                audio_iter = self._tts_client.synthesize_stream(sentence)
                if getattr(self._tts_client, "output_format", "mp3") == "pcm":
                    frame_source = stream_pcm_to_opus_frames(
                        audio_iter,
                        sample_rate=session.audio_sample_rate,
                        frame_ms=session.audio_frame_duration,
                        input_rate=getattr(self._tts_client, "sample_rate", session.audio_sample_rate),
                    )
                else:
                    frame_source = stream_mp3_to_opus_frames(
                        audio_iter,
                        sample_rate=session.audio_sample_rate,
                        frame_ms=session.audio_frame_duration,
                    )
                async for opus_frame in frame_source:
                    await events.put(
                        {"type": "audio_frame", "opus": opus_frame, "index": frame_index_ref[0]}
                    )
                    frame_index_ref[0] += 1
                return
            except Exception as exc:
                if attempt == 0:
                    logger.warning("tts retry sentence=%r error=%s", sentence[:40], exc)
                    await asyncio.sleep(0.2)
                    continue
                logger.warning("tts gave up sentence=%r error=%s", sentence[:40], exc)
                raise

    def _build_assistant_msg_from_tool_calls(self, accum: dict[int, dict]) -> dict:
        """Build OpenAI-format assistant message from accumulated tool call deltas."""
        tool_calls = [
            {
                "id": slot["id"] or str(uuid.uuid4()),
                "type": "function",
                "function": {
                    "name": slot["name"] or "",
                    "arguments": slot["arguments"],
                },
            }
            for _, slot in sorted(accum.items())
        ]
        return {"role": "assistant", "content": None, "tool_calls": tool_calls}

    async def _execute_tool_calls_and_append(
        self,
        messages: list[dict],
        accum: dict[int, dict],
        session: DeviceSession,
    ) -> None:
        """Execute each tool call and append the result messages."""
        for _, slot in sorted(accum.items()):
            tool_call_id = slot["id"] or str(uuid.uuid4())
            tool_name = slot["name"] or ""
            try:
                arguments: dict = json.loads(slot["arguments"] or "{}")
            except json.JSONDecodeError:
                arguments = {}

            if self._mcp_client is not None and tool_name:
                tool_result = await self._mcp_client.call_tool(tool_name, arguments)
            else:
                tool_result = f"Tool '{tool_name}' is not available."

            logger.debug(
                "mcp call_tool id=%s name=%s result_preview=%s",
                tool_call_id,
                tool_name,
                tool_result[:120],
            )

            tool_msg = {
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": tool_result,
            }
            messages.append(tool_msg)
            session.add_message(tool_msg)
