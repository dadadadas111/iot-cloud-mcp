from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.integrations.edge_tts_client import EdgeTtsClient


def _make_communicate_mock(chunks: list[dict]):
    """Build a mock edge_tts.Communicate whose stream() yields canned dicts."""
    mock_communicate = MagicMock()

    async def _stream():
        for chunk in chunks:
            yield chunk

    mock_communicate.stream = _stream

    mock_class = MagicMock(return_value=mock_communicate)
    return mock_class


@pytest.mark.asyncio
async def test_synthesize_stream_yields_audio_chunks() -> None:
    chunks = [
        {"type": "audio", "data": b"mp3-chunk-1"},
        {"type": "WordBoundary", "data": b"ignored"},
        {"type": "audio", "data": b"mp3-chunk-2"},
    ]
    client = EdgeTtsClient("vi-VN-HoaiMyNeural")

    with patch("edge_tts.Communicate", _make_communicate_mock(chunks)):
        result = [chunk async for chunk in client.synthesize_stream("Xin chào.")]

    assert result == [b"mp3-chunk-1", b"mp3-chunk-2"]


@pytest.mark.asyncio
async def test_synthesize_stream_raises_if_no_audio() -> None:
    chunks = [
        {"type": "WordBoundary", "data": b"ignored"},
    ]
    client = EdgeTtsClient("vi-VN-HoaiMyNeural")

    with patch("edge_tts.Communicate", _make_communicate_mock(chunks)):
        with pytest.raises(RuntimeError, match="edge tts produced no audio"):
            async for _ in client.synthesize_stream("Xin chào."):
                pass
