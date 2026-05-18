from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass

from fastapi import WebSocket

from ..protocol.models import AbortMessage, AudioParams, HelloMessage, ListenMessage, ListenState, ServerHelloMessage
from ..session.models import DeviceSession, SessionPhase
from ..session.store import SessionStore

logger = logging.getLogger(__name__)


@dataclass
class TurnResult:
    transcript: str
    response_text: str
    tts_audio: bytes


class XiaozhiRuntime:
    def __init__(self, store: SessionStore, stt_client=None, llm_client=None, tts_client=None) -> None:
        self._store = store
        self._stt_client = stt_client
        self._llm_client = llm_client
        self._tts_client = tts_client

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

    async def generate_response(self, session: DeviceSession) -> tuple[str, bytes]:
        """LLM + TTS after STT — returns (response_text, tts_audio)."""
        if self._llm_client is None or self._tts_client is None:
            raise RuntimeError("LLM/TTS providers are not configured")

        messages = [{"role": "system", "content": "You are a helpful Vietnamese-speaking assistant. Keep replies concise and natural for voice conversation."}]
        messages.extend(session.conversation_history)
        response_text = (await self._llm_client.chat(messages)).strip()
        if not response_text:
            raise RuntimeError("empty llm response")

        session.add_turn("assistant", response_text)
        tts_audio = await self._tts_client.synthesize(response_text)
        await self._store.save(session)
        return response_text, tts_audio

    async def process_turn(self, session: DeviceSession, wav_audio: bytes) -> TurnResult:
        """Full pipeline — kept for backward compat (not used by the fast path)."""
        transcript = await self.transcribe_audio(session, wav_audio)
        response_text, tts_audio = await self.generate_response(session)
        return TurnResult(transcript=transcript, response_text=response_text, tts_audio=tts_audio)
