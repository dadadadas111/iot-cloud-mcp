from unittest.mock import AsyncMock, MagicMock

import pytest

from src.protocol.models import HelloMessage
from src.services.runtime import XiaozhiRuntime


@pytest.mark.asyncio
async def test_process_turn_uses_stt_llm_and_tts() -> None:
    store = MagicMock(save=AsyncMock())
    stt = MagicMock(transcribe=AsyncMock(return_value="xin chao"))
    llm = MagicMock(chat=AsyncMock(return_value="chao ban"))
    tts = MagicMock(synthesize=AsyncMock(return_value=b"mp3-audio"))
    runtime = XiaozhiRuntime(store, stt_client=stt, llm_client=llm, tts_client=tts)
    websocket = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "client-1"})

    session = await runtime.bootstrap_session(websocket, HelloMessage())
    result = await runtime.process_turn(session, b"wav-audio")

    assert result.transcript == "xin chao"
    assert result.response_text == "chao ban"
    assert result.tts_audio == b"mp3-audio"
    assert session.conversation_history[-2:] == [
        {"role": "user", "content": "xin chao"},
        {"role": "assistant", "content": "chao ban"},
    ]
