from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.protocol.models import HelloMessage
from src.services.runtime import XiaozhiRuntime


async def _collect_events(runtime, session) -> list[dict]:
    events = []
    async for event in runtime.generate_response_stream(session):
        events.append(event)
    return events


@pytest.mark.asyncio
async def test_generate_response_stream_basic_content() -> None:
    """Full pipeline smoke: stt result feeds into streaming LLM + TTS pipeline."""
    store = MagicMock(save=AsyncMock())

    async def _chat_stream(messages, tools=None):
        yield {"content": "Xin chào bạn."}
        yield {"finish_reason": "stop"}

    llm = MagicMock()
    llm.chat_stream = _chat_stream

    tts = MagicMock()

    async def _synth_stream(text):
        yield b"mp3-bytes"

    tts.synthesize_stream = _synth_stream

    async def _fake_mp3_to_opus(mp3_iter, sample_rate, frame_ms, channels=1):
        async for _ in mp3_iter:
            pass
        yield b"opus-frame"

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "client-1"})
    session = await runtime.bootstrap_session(ws, HelloMessage())
    session.add_turn("user", "xin chao")

    with patch("src.services.runtime.stream_mp3_to_opus_frames", _fake_mp3_to_opus):
        events = await _collect_events(runtime, session)

    types = [e["type"] for e in events]
    assert types[0] == "tts_start"
    assert "sentence_start" in types
    assert "audio_frame" in types
    assert types[-1] == "tts_stop"

    # Conversation history updated.
    assert session.conversation_history[-1]["role"] == "assistant"
    assert session.conversation_history[-1]["content"] == "Xin chào bạn."
    # History capped at 20 entries.
    assert len(session.conversation_history) <= 20
