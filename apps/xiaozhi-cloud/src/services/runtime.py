from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass

from fastapi import WebSocket

from ..protocol.models import AbortMessage, AudioParams, HelloMessage, ListenMessage, ListenState, ServerHelloMessage
from ..session.models import DeviceSession, SessionPhase
from ..session.store import SessionStore

logger = logging.getLogger(__name__)

# Maximum number of tool-call iterations per turn to prevent runaway loops.
MAX_TOOL_ITERATIONS = 5


@dataclass
class TurnResult:
    transcript: str
    response_text: str
    tts_audio: bytes


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

    async def generate_response(self, session: DeviceSession) -> tuple[str, bytes]:
        """
        LLM + optional tool loop + TTS.

        Flow:
          1. Fetch tool list from MCP (per-session cache, TTL 5 min).
          2. Call LLM with messages + tools.
          3. If the LLM returns tool_calls:
               a. Execute each tool call via MCP.
               b. Append assistant message + tool results to messages.
               c. Loop back to step 2 (up to MAX_TOOL_ITERATIONS hops).
          4. When LLM returns a plain text reply (no tool_calls), synthesise TTS.

        Returns (response_text, tts_audio).
        """
        if self._llm_client is None or self._tts_client is None:
            raise RuntimeError("LLM/TTS providers are not configured")

        system_prompt = "You are a helpful Vietnamese-speaking assistant. Keep replies concise and natural for voice conversation."
        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        messages.extend(session.conversation_history)

        tools = await self._get_mcp_tools(session)

        for iteration in range(MAX_TOOL_ITERATIONS):
            assistant_msg = await self._llm_client.chat(messages, tools=tools or None)

            tool_calls = assistant_msg.get("tool_calls") or []
            if not tool_calls:
                # Final text reply — done with the loop.
                response_text = (assistant_msg.get("content") or "").strip()
                if not response_text:
                    raise RuntimeError("empty llm response")

                session.add_turn("assistant", response_text)
                tts_audio = await self._tts_client.synthesize(response_text)
                await self._store.save(session)
                logger.info(
                    "generate_response done session_id=%s iterations=%d",
                    session.session_id,
                    iteration,
                )
                return response_text, tts_audio

            # LLM wants to call tools — execute them and feed results back.
            logger.info(
                "tool_calls iteration=%d session_id=%s calls=%s",
                iteration,
                session.session_id,
                [tc.get("function", {}).get("name") for tc in tool_calls],
            )

            # Append the assistant message (with tool_calls) to the history so
            # the next LLM call has the correct context.
            messages.append(assistant_msg)

            for tc in tool_calls:
                tool_call_id: str = tc.get("id", str(uuid.uuid4()))
                fn = tc.get("function", {})
                tool_name: str = fn.get("name", "")
                try:
                    arguments: dict = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    arguments = {}

                if self._mcp_client is not None and tool_name:
                    tool_result = await self._mcp_client.call_tool(tool_name, arguments)
                else:
                    tool_result = f"Tool '{tool_name}' is not available."

                logger.debug(
                    "tool_call id=%s name=%s result_preview=%s",
                    tool_call_id,
                    tool_name,
                    tool_result[:120],
                )

                # Append tool result in the format the LLM expects.
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": tool_result,
                    }
                )

        # Iteration cap reached — ask the LLM for a final answer without tools.
        logger.warning(
            "tool loop iteration cap reached session_id=%s max=%d — forcing final reply",
            session.session_id,
            MAX_TOOL_ITERATIONS,
        )
        final_msg = await self._llm_client.chat(messages, tools=None)
        response_text = (final_msg.get("content") or "").strip()
        if not response_text:
            raise RuntimeError("empty llm response after tool loop cap")

        session.add_turn("assistant", response_text)
        tts_audio = await self._tts_client.synthesize(response_text)
        await self._store.save(session)
        return response_text, tts_audio

    async def process_turn(self, session: DeviceSession, wav_audio: bytes) -> TurnResult:
        """Full pipeline — kept for backward compat (not used by the fast path)."""
        transcript = await self.transcribe_audio(session, wav_audio)
        response_text, tts_audio = await self.generate_response(session)
        return TurnResult(transcript=transcript, response_text=response_text, tts_audio=tts_audio)
