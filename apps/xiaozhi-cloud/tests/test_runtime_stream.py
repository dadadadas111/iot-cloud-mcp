from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.protocol.models import HelloMessage
from src.services.runtime import XiaozhiRuntime


def _make_session(runtime):
    store = runtime._store
    websocket = MagicMock(headers={"protocol-version": "3", "device-id": "dev-1", "client-id": "c-1"})

    async def _bootstrap():
        return await runtime.bootstrap_session(websocket, HelloMessage())

    return _bootstrap


def _async_gen_from_list(items):
    """Return an async generator that yields items from a list."""
    async def _gen():
        for item in items:
            yield item
    return _gen()


def _make_llm_mock(responses: list[list[dict]]):
    """Build an LLM mock whose chat_stream() yields successive response lists."""
    call_idx = 0
    responses_copy = list(responses)

    async def _chat_stream(messages, tools=None):
        nonlocal call_idx
        items = responses_copy[call_idx % len(responses_copy)]
        call_idx += 1
        for item in items:
            yield item

    mock_llm = MagicMock()
    mock_llm.chat_stream = _chat_stream
    mock_llm.chat = AsyncMock()
    return mock_llm


def _make_tts_mock(chunks_per_call: list[bytes] | None = None):
    """Build a TTS mock whose synthesize_stream() yields canned mp3 bytes."""
    if chunks_per_call is None:
        chunks_per_call = [b"mp3-chunk"]

    async def _synthesize_stream(text):
        for chunk in chunks_per_call:
            yield chunk

    mock_tts = MagicMock()
    mock_tts.synthesize_stream = _synthesize_stream
    return mock_tts


async def _collect_events(runtime, session) -> list[dict]:
    events = []
    async for event in runtime.generate_response_stream(session):
        events.append(event)
    return events


@pytest.mark.asyncio
async def test_generate_response_stream_emits_ordered_events() -> None:
    """Two sentences → tts_start, sentence_start*2, audio_frames, tts_stop in order."""
    store = MagicMock(save=AsyncMock())
    llm = _make_llm_mock([
        [
            {"content": "Xin chào."},
            {"content": " Bạn khỏe không?"},
            {"finish_reason": "stop"},
        ]
    ])

    # TTS mock yields fake opus frames via stream_mp3_to_opus_frames mock.
    tts = _make_tts_mock([b"mp3-data"])

    # Mock stream_mp3_to_opus_frames to return a few fake opus frames per sentence.
    async def _fake_stream_mp3(mp3_iter, sample_rate, frame_ms, channels=1):
        # Drain the mp3 iterator (required to avoid generator leaks).
        async for _ in mp3_iter:
            pass
        yield b"opus-frame-1"
        yield b"opus-frame-2"

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "d", "client-id": "c"})
    session = await runtime.bootstrap_session(ws, HelloMessage())

    with patch("src.services.runtime.stream_mp3_to_opus_frames", _fake_stream_mp3):
        events = await _collect_events(runtime, session)

    types = [e["type"] for e in events]
    # Must start with tts_start.
    assert types[0] == "tts_start"
    # Must end with tts_stop.
    assert types[-1] == "tts_stop"
    # Both sentences must appear.
    sentence_events = [e for e in events if e["type"] == "sentence_start"]
    assert len(sentence_events) == 2
    assert sentence_events[0]["text"] == "Xin chào."
    assert sentence_events[1]["text"] == "Bạn khỏe không?"
    # Audio frames exist.
    audio_events = [e for e in events if e["type"] == "audio_frame"]
    assert len(audio_events) >= 2
    # Verify ordering: sentence_start for S2 comes after all audio for S1... actually
    # we verify that sentence_start(S1) < first audio_frame < sentence_start(S2) < second audio_frame.
    idx_ss1 = types.index("sentence_start")
    idx_ss2 = next(i for i, e in enumerate(events) if e["type"] == "sentence_start" and e["text"] == "Bạn khỏe không?")
    first_audio_after_ss1 = next((i for i, e in enumerate(events) if e["type"] == "audio_frame" and i > idx_ss1), None)
    assert first_audio_after_ss1 is not None
    assert first_audio_after_ss1 < idx_ss2, "audio frame for S1 must precede sentence_start for S2"

    # History updated.
    assert session.conversation_history[-1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_generate_response_stream_runs_tool_loop() -> None:
    """Tool-call hop followed by content hop: tts_start emitted only after content."""
    store = MagicMock(save=AsyncMock())

    # First hop: tool_calls only.
    # Second hop: content.
    call_count = 0

    async def _chat_stream(messages, tools=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            yield {
                "tool_call_delta": {
                    "index": 0,
                    "id": "call_xyz",
                    "name": "ping",
                    "arguments": "{}",
                }
            }
            yield {"finish_reason": "tool_calls"}
        else:
            yield {"content": "Xin chào."}
            yield {"finish_reason": "stop"}

    llm = MagicMock()
    llm.chat_stream = _chat_stream
    llm.chat = AsyncMock()

    mcp = MagicMock(call_tool=AsyncMock(return_value="pong"))
    tts = _make_tts_mock([b"mp3-data"])

    async def _fake_stream_mp3(mp3_iter, sample_rate, frame_ms, channels=1):
        async for _ in mp3_iter:
            pass
        yield b"opus-frame"

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts, mcp_client=mcp)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "d", "client-id": "c"})
    session = await runtime.bootstrap_session(ws, HelloMessage())

    with patch("src.services.runtime.stream_mp3_to_opus_frames", _fake_stream_mp3):
        events = await _collect_events(runtime, session)

    types = [e["type"] for e in events]
    assert "tts_start" in types
    assert "sentence_start" in types
    assert "tts_stop" in types
    # tts_start should appear only once (after the content hop, not after the tool hop).
    assert types.count("tts_start") == 1
    # Tool was called.
    mcp.call_tool.assert_awaited_once_with("ping", {})
    # Two LLM calls were made (one per hop).
    assert call_count == 2


@pytest.mark.asyncio
async def test_generate_response_stream_tts_retry(caplog) -> None:
    """TTS fails once then succeeds; one warning logged, audio still emitted."""
    store = MagicMock(save=AsyncMock())
    llm = _make_llm_mock([
        [{"content": "Xin chào."}, {"finish_reason": "stop"}]
    ])

    tts_call_count = 0

    async def _fail_then_succeed(text):
        nonlocal tts_call_count
        tts_call_count += 1
        if tts_call_count == 1:
            raise RuntimeError("edge tts produced no audio")
        yield b"mp3-data"

    tts = MagicMock()
    tts.synthesize_stream = _fail_then_succeed

    async def _fake_stream_mp3(mp3_iter, sample_rate, frame_ms, channels=1):
        async for _ in mp3_iter:
            pass
        yield b"opus-frame"

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "d", "client-id": "c"})
    session = await runtime.bootstrap_session(ws, HelloMessage())

    with caplog.at_level(logging.WARNING, logger="src.services.runtime"):
        with patch("src.services.runtime.stream_mp3_to_opus_frames", _fake_stream_mp3):
            events = await _collect_events(runtime, session)

    audio_events = [e for e in events if e["type"] == "audio_frame"]
    assert len(audio_events) >= 1
    # Warning was logged for the retry.
    assert any("tts retry" in rec.message for rec in caplog.records)


@pytest.mark.asyncio
async def test_generate_response_stream_iteration_cap() -> None:
    """5 tool-call hops exhaust the cap; non-streaming chat() called as fallback."""
    store = MagicMock(save=AsyncMock())

    tool_call_hop_items = [
        {
            "tool_call_delta": {
                "index": 0,
                "id": "call_abc",
                "name": "ping",
                "arguments": "{}",
            }
        },
        {"finish_reason": "tool_calls"},
    ]

    hop_count = 0

    async def _chat_stream(messages, tools=None):
        nonlocal hop_count
        hop_count += 1
        for item in tool_call_hop_items:
            yield item

    llm = MagicMock()
    llm.chat_stream = _chat_stream
    llm.chat = AsyncMock(return_value={"content": "Xin lỗi.", "tool_calls": None})

    mcp = MagicMock(call_tool=AsyncMock(return_value="pong"))
    tts = _make_tts_mock([b"mp3-data"])

    async def _fake_stream_mp3(mp3_iter, sample_rate, frame_ms, channels=1):
        async for _ in mp3_iter:
            pass
        yield b"opus-frame"

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts, mcp_client=mcp)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "d", "client-id": "c"})
    session = await runtime.bootstrap_session(ws, HelloMessage())

    with patch("src.services.runtime.stream_mp3_to_opus_frames", _fake_stream_mp3):
        events = await _collect_events(runtime, session)

    # Non-streaming chat() was called once as fallback.
    llm.chat.assert_awaited_once()
    # 5 streaming hops were made.
    assert hop_count == 5
    # Content from fallback was emitted.
    types = [e["type"] for e in events]
    assert "tts_start" in types
    assert "tts_stop" in types
    sentence_events = [e for e in events if e["type"] == "sentence_start"]
    assert any("Xin lỗi" in e["text"] for e in sentence_events)


@pytest.mark.asyncio
async def test_generate_response_stream_llm_error_raises_not_hangs() -> None:
    """Fix 1: if chat_stream raises, the generator raises rather than hanging."""
    store = MagicMock(save=AsyncMock())

    async def _chat_stream_error(messages, tools=None):
        yield {"content": "Xin"}
        raise RuntimeError("llm stream failed: upstream error")

    llm = MagicMock()
    llm.chat_stream = _chat_stream_error

    tts = _make_tts_mock([b"mp3-data"])

    async def _fake_stream_mp3(mp3_iter, sample_rate, frame_ms, channels=1):
        async for _ in mp3_iter:
            pass
        yield b"opus-frame"

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "d", "client-id": "c"})
    session = await runtime.bootstrap_session(ws, HelloMessage())

    with patch("src.services.runtime.stream_mp3_to_opus_frames", _fake_stream_mp3):
        with pytest.raises(RuntimeError, match="llm stream failed"):
            # Must raise within a reasonable timeout rather than deadlocking.
            await asyncio.wait_for(_collect_events(runtime, session), timeout=5.0)


@pytest.mark.asyncio
async def test_generate_response_stream_empty_response_raises() -> None:
    """Fix 3: empty LLM stream (no content, no tool_calls) raises RuntimeError."""
    store = MagicMock(save=AsyncMock())

    async def _chat_stream_empty(messages, tools=None):
        yield {"finish_reason": "stop"}

    llm = MagicMock()
    llm.chat_stream = _chat_stream_empty

    tts = _make_tts_mock([b"mp3-data"])

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "d", "client-id": "c"})
    session = await runtime.bootstrap_session(ws, HelloMessage())

    with pytest.raises(RuntimeError, match="empty llm response"):
        await _collect_events(runtime, session)


@pytest.mark.asyncio
async def test_generate_response_stream_tts_start_before_sentence_start() -> None:
    """Fix 4: tts_start fires before sentence_start (on first content delta, not first dequeue)."""
    store = MagicMock(save=AsyncMock())
    llm = _make_llm_mock([
        [
            {"content": "Xin chào."},
            {"finish_reason": "stop"},
        ]
    ])
    tts = _make_tts_mock([b"mp3-data"])

    async def _fake_stream_mp3(mp3_iter, sample_rate, frame_ms, channels=1):
        async for _ in mp3_iter:
            pass
        yield b"opus-frame"

    runtime = XiaozhiRuntime(store, llm_client=llm, tts_client=tts)
    ws = MagicMock(headers={"protocol-version": "3", "device-id": "d", "client-id": "c"})
    session = await runtime.bootstrap_session(ws, HelloMessage())

    with patch("src.services.runtime.stream_mp3_to_opus_frames", _fake_stream_mp3):
        events = await _collect_events(runtime, session)

    types = [e["type"] for e in events]
    assert "tts_start" in types
    assert "sentence_start" in types
    idx_tts_start = types.index("tts_start")
    idx_sentence_start = types.index("sentence_start")
    assert idx_tts_start < idx_sentence_start, "tts_start must precede sentence_start"
