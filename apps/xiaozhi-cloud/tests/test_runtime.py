from unittest.mock import AsyncMock, MagicMock

import pytest

from src.protocol.models import AbortMessage, HelloMessage, ListenMessage, ListenMode, ListenState
from src.services.runtime import XiaozhiRuntime
from src.session.models import SessionPhase


@pytest.mark.asyncio
async def test_bootstrap_session_uses_headers_and_moves_to_ready() -> None:
    store = MagicMock(save=AsyncMock())
    runtime = XiaozhiRuntime(store)
    websocket = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "client-1"})

    session = await runtime.bootstrap_session(websocket, HelloMessage())

    assert session.device_id == "dev-1"
    assert session.client_id == "client-1"
    assert session.protocol_version == 3
    assert session.phase == SessionPhase.READY
    store.save.assert_awaited_once()


@pytest.mark.asyncio
async def test_listen_start_moves_session_to_listening() -> None:
    store = MagicMock(save=AsyncMock())
    runtime = XiaozhiRuntime(store)
    websocket = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "client-1"})
    session = await runtime.bootstrap_session(websocket, HelloMessage())

    outbound = await runtime.handle_control_message(
        session,
        ListenMessage(state=ListenState.START, mode=ListenMode.AUTO, session_id=session.session_id),
    )

    assert session.phase == SessionPhase.LISTENING
    assert outbound is False


@pytest.mark.asyncio
async def test_listen_stop_moves_listening_session_to_processing() -> None:
    store = MagicMock(save=AsyncMock())
    runtime = XiaozhiRuntime(store)
    websocket = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "client-1"})
    session = await runtime.bootstrap_session(websocket, HelloMessage())
    await runtime.handle_control_message(
        session,
        ListenMessage(state=ListenState.START, mode=ListenMode.AUTO, session_id=session.session_id),
    )

    await runtime.handle_control_message(
        session,
        ListenMessage(state=ListenState.STOP, session_id=session.session_id),
    )

    assert session.phase == SessionPhase.PROCESSING


@pytest.mark.asyncio
async def test_abort_moves_session_to_interrupted() -> None:
    store = MagicMock(save=AsyncMock())
    runtime = XiaozhiRuntime(store)
    websocket = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "client-1"})
    session = await runtime.bootstrap_session(websocket, HelloMessage())

    await runtime.handle_control_message(
        session,
        AbortMessage(session_id=session.session_id, reason="wake_word_detected"),
    )

    assert session.phase == SessionPhase.INTERRUPTED
    assert session.last_abort_reason == "wake_word_detected"


@pytest.mark.asyncio
async def test_mismatched_session_id_is_rejected() -> None:
    store = MagicMock(save=AsyncMock())
    runtime = XiaozhiRuntime(store)
    websocket = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "client-1"})
    session = await runtime.bootstrap_session(websocket, HelloMessage())

    with pytest.raises(ValueError, match="session_id mismatch"):
        await runtime.handle_control_message(
            session,
            ListenMessage(state=ListenState.START, mode=ListenMode.AUTO, session_id="wrong-session"),
        )
