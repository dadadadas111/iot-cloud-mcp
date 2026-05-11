"""
AudioSessionGateway — WebSocket endpoint that handles device connections.

Message routing:
  binary frame  → audio pipeline (wakeword detection or STT buffering)
  JSON text     → control message dispatcher (audio_end, ping)

Uses ws.receive() directly so one loop handles both binary and text frames.
"""

import asyncio
import json
import logging
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from ..audio.protocol import (
    AudioEndMessage,
    HelloAckMessage,
    HelloMessage,
    MessageType,
    PongMessage,
    ResponseEndMessage,
    ResponseStartMessage,
    TranscriptMessage,
    parse_control_message,
)
from ..audio.session import AudioSession, SessionState
from ..config.settings import settings
from ..wakeword.pipeline import WakewordPipeline
from ..stt.interface import ISttService
from ..llm.interface import ILlmService
from ..tts.interface import ITtsService
from ..mcp_client.client import RogoMcpClient
from ..session.store import SessionStore

logger = logging.getLogger(__name__)

_PONG = PongMessage().model_dump_json()


class AudioSessionGateway:
    def __init__(
        self,
        wakeword: WakewordPipeline,
        stt: ISttService,
        llm: ILlmService,
        tts: ITtsService,
        mcp: RogoMcpClient,
        store: SessionStore,
    ) -> None:
        self._wakeword = wakeword
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._mcp = mcp
        self._store = store
        self._sessions: dict[str, AudioSession] = {}

    @property
    def active_sessions(self) -> int:
        return len(self._sessions)

    async def handle(self, websocket: WebSocket) -> None:
        await websocket.accept()
        session: AudioSession | None = None

        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            msg = parse_control_message(json.loads(raw))
            if not isinstance(msg, HelloMessage):
                await websocket.close(code=4000, reason="expected hello")
                return

            history = await self._store.load_history(msg.device_id)
            session_id = str(uuid.uuid4())
            session = AudioSession(
                session_id=session_id,
                device_id=msg.device_id,
                websocket=websocket,
                conversation_history=history,
            )
            self._sessions[session_id] = session
            logger.info(
                "device=%s connected session=%s history_turns=%d",
                msg.device_id,
                session_id,
                len(history),
            )

            ack = HelloAckMessage(session_id=session_id, sample_rate=settings.audio_sample_rate)
            await websocket.send_text(ack.model_dump_json())

            await self._message_loop(session)

        except asyncio.TimeoutError:
            logger.warning("device did not send hello in time")
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close(code=4008, reason="hello timeout")
        except WebSocketDisconnect:
            logger.info(
                "device disconnected session=%s",
                session.session_id if session else "unknown",
            )
        except Exception:
            logger.exception(
                "session error session=%s",
                session.session_id if session else "unknown",
            )
        finally:
            if session:
                await self._store.save_history(session.device_id, session.conversation_history)
                self._sessions.pop(session.session_id, None)

    async def _message_loop(self, session: AudioSession) -> None:
        ws = session.websocket

        while ws.client_state == WebSocketState.CONNECTED:
            message = await ws.receive()

            if message["type"] == "websocket.disconnect":
                break

            if message.get("bytes"):
                await self._handle_audio_chunk(session, message["bytes"])
            elif message.get("text"):
                try:
                    await self._handle_control(session, json.loads(message["text"]))
                except Exception:
                    logger.exception("bad control message session=%s", session.session_id)

    async def _handle_audio_chunk(self, session: AudioSession, chunk: bytes) -> None:
        if session.state in (SessionState.PROCESSING, SessionState.RESPONDING):
            return  # discard audio while pipeline is busy

        session.append_audio(chunk)

        if session.state == SessionState.IDLE:
            if self._wakeword.is_stub:
                # No wakeword model — treat every audio chunk as a potential utterance.
                # The audio_end control message still gates processing.
                session.transition(SessionState.LISTENING)
            else:
                detected = await self._wakeword.process_chunk(chunk)
                if detected:
                    logger.info("wakeword detected session=%s", session.session_id)
                    session.reset_audio()
                    session.transition(SessionState.LISTENING)

    async def _handle_control(self, session: AudioSession, data: dict) -> None:
        msg_type = data.get("type")

        if msg_type == MessageType.PING:
            await session.websocket.send_text(_PONG)
            return

        msg = parse_control_message(data)

        if isinstance(msg, AudioEndMessage):
            if session.state == SessionState.LISTENING:
                asyncio.create_task(
                    self._process_utterance(session),
                    name=f"utterance-{session.session_id}",
                )
            else:
                session.reset_audio()

    async def _process_utterance(self, session: AudioSession) -> None:
        session.transition(SessionState.PROCESSING)
        audio = session.get_audio_bytes()
        session.reset_audio()

        if not audio:
            session.transition(SessionState.IDLE)
            return

        try:
            transcript = await self._stt.transcribe(audio, sample_rate=settings.audio_sample_rate)
            logger.info("transcript='%s' session=%s", transcript, session.session_id)

            if not transcript.strip():
                session.transition(SessionState.IDLE)
                return

            await session.websocket.send_text(
                TranscriptMessage(text=transcript).model_dump_json()
            )

            session.add_turn("user", transcript)
            response_text = await self._llm.chat(
                messages=session.conversation_history,
                tools=await self._mcp.list_tools(),
                tool_caller=self._mcp.call_tool,
            )
            session.add_turn("assistant", response_text)

            session.transition(SessionState.RESPONDING)
            await session.websocket.send_text(
                ResponseStartMessage(text=response_text).model_dump_json()
            )

            async for audio_chunk in self._tts.synthesize(response_text):
                if session.websocket.client_state != WebSocketState.CONNECTED:
                    break
                await session.websocket.send_bytes(audio_chunk)

            await session.websocket.send_text(ResponseEndMessage().model_dump_json())

        except Exception:
            logger.exception("pipeline error session=%s", session.session_id)
        finally:
            session.transition(SessionState.IDLE)
