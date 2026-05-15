from __future__ import annotations

import logging
import uuid

from fastapi import WebSocket

from ..protocol.models import AbortMessage, HelloMessage, ListenMessage, ListenState, ServerHelloMessage
from ..session.models import DeviceSession, SessionPhase
from ..session.store import SessionStore

logger = logging.getLogger(__name__)


class XiaozhiRuntime:
    def __init__(self, store: SessionStore) -> None:
        self._store = store

    async def bootstrap_session(self, websocket: WebSocket, hello: HelloMessage) -> DeviceSession:
        protocol_version = int(websocket.headers["protocol-version"])
        session = DeviceSession(
            session_id=str(uuid.uuid4()),
            device_id=hello.device_id or websocket.headers["device-id"],
            client_id=hello.client_id or websocket.headers["client-id"],
            protocol_version=protocol_version or hello.version,
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
        return ServerHelloMessage(version=session.protocol_version, session_id=session.session_id)

    async def transition(self, session: DeviceSession, phase: SessionPhase) -> None:
        session.phase = phase
        await self._store.save(session)

    async def handle_control_message(
        self,
        session: DeviceSession,
        message: ListenMessage | AbortMessage,
    ) -> list[dict]:
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
        return []

    def _validate_session_message(self, session: DeviceSession, message_session_id: str | None) -> None:
        if message_session_id is not None and message_session_id != session.session_id:
            raise ValueError("session_id mismatch")

    async def _handle_listen_message(self, session: DeviceSession, message: ListenMessage) -> list[dict]:
        if message.state == ListenState.START:
            session.listen_mode = message.mode.value if message.mode else None
            await self.transition(session, SessionPhase.LISTENING)
            logger.info(
                "session listening session_id=%s mode=%s",
                session.session_id,
                session.listen_mode,
            )
            return []

        if message.state == ListenState.DETECT:
            session.listen_mode = message.mode.value if message.mode else session.listen_mode
            await self.transition(session, SessionPhase.LISTENING)
            logger.info(
                "wake detected session_id=%s text=%s",
                session.session_id,
                message.text,
            )
            return []

        if session.phase != SessionPhase.LISTENING:
            raise ValueError("listen.stop received while not listening")

        await self.transition(session, SessionPhase.PROCESSING)
        logger.info("session processing session_id=%s", session.session_id)
        return []
