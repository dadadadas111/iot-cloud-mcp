"""Tests for Xiaozhi websocket compatibility adapter."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.websockets import WebSocketState

from src.audio.session import AudioSession, SessionState
from src.audio.xiaozhi_adapter import XiaozhiGateway, _tts_to_opus


class FakeWebSocket:
    def __init__(self):
        self.client_state = WebSocketState.CONNECTED
        self.sent_text: list[dict] = []
        self.sent_bytes: list[bytes] = []

    async def send_text(self, payload: str) -> None:
        self.sent_text.append(json.loads(payload))

    async def send_bytes(self, payload: bytes) -> None:
        self.sent_bytes.append(payload)


async def _tts_chunks():
    yield b"mp3-part-1"
    yield b"mp3-part-2"


@pytest.mark.asyncio
async def test_process_utterance_sends_opus_and_tts_stop(monkeypatch):
    websocket = FakeWebSocket()
    monkeypatch.setattr("src.audio.xiaozhi_adapter.settings.xiaozhi_audio_format", "pcm")

    gateway = XiaozhiGateway(
        wakeword=MagicMock(),
        stt=MagicMock(transcribe=AsyncMock(return_value="bat den")),
        llm=MagicMock(chat=AsyncMock(return_value="Da bat den")),
        tts=MagicMock(synthesize=MagicMock(return_value=_tts_chunks())),
        mcp=MagicMock(list_tools=AsyncMock(return_value=[]), call_tool=AsyncMock()),
        store=MagicMock(),
    )
    session = AudioSession(
        session_id="session-1",
        device_id="device-1",
        websocket=websocket,
        state=SessionState.LISTENING,
    )
    session.append_audio(b"pcm-audio")

    async def fake_tts_to_opus(data: bytes, sample_rate: int) -> bytes:
        assert data == b"mp3-part-1mp3-part-2"
        assert sample_rate == 16000
        return b"opus-payload"

    monkeypatch.setattr("src.audio.xiaozhi_adapter._tts_to_opus", fake_tts_to_opus)

    await gateway._process_utterance(session)

    assert websocket.sent_bytes == [b"opus-payload"]
    assert b"mp3-part-1" not in b"".join(websocket.sent_bytes)
    assert websocket.sent_text[1]["type"] == "tts"
    assert websocket.sent_text[1]["state"] == "start"
    assert websocket.sent_text[2]["type"] == "tts"
    assert websocket.sent_text[2]["state"] == "stop"
    assert websocket.sent_text[3] == {
        "type": "listen",
        "state": "start",
        "mode": "auto",
        "session_id": "session-1",
    }
    assert session.state == SessionState.IDLE


@pytest.mark.asyncio
async def test_tts_to_opus_uses_ffmpeg(monkeypatch):
    captured = {}

    class FakeProc:
        returncode = 0

        async def communicate(self, data: bytes):
            captured["input"] = data
            return (b"opus-output", b"")

    async def fake_create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return FakeProc()

    monkeypatch.setattr("src.audio.xiaozhi_adapter.asyncio.create_subprocess_exec", fake_create_subprocess_exec)

    output = await _tts_to_opus(b"mp3-bytes", 16000)

    assert output == b"opus-output"
    assert captured["input"] == b"mp3-bytes"
    assert captured["args"] == (
        "ffmpeg",
        "-y",
        "-i",
        "pipe:0",
        "-c:a",
        "libopus",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "ogg",
        "pipe:1",
    )


@pytest.mark.asyncio
async def test_inactivity_timeout_triggers_processing(monkeypatch):
    websocket = FakeWebSocket()
    monkeypatch.setattr("src.audio.xiaozhi_adapter.settings.xiaozhi_audio_format", "pcm")
    monkeypatch.setattr("src.audio.xiaozhi_adapter.settings.silence_timeout_ms", 1)
    monkeypatch.setattr("src.audio.xiaozhi_adapter.settings.xiaozhi_max_listening_ms", 1000)

    gateway = XiaozhiGateway(
        wakeword=MagicMock(),
        stt=MagicMock(transcribe=AsyncMock(return_value="bat den")),
        llm=MagicMock(chat=AsyncMock(return_value="Da bat den")),
        tts=MagicMock(synthesize=MagicMock(return_value=_tts_chunks())),
        mcp=MagicMock(list_tools=AsyncMock(return_value=[]), call_tool=AsyncMock()),
        store=MagicMock(),
    )

    async def fake_tts_to_opus(data: bytes, sample_rate: int) -> bytes:
        return b"opus-payload"

    monkeypatch.setattr("src.audio.xiaozhi_adapter._tts_to_opus", fake_tts_to_opus)

    session = AudioSession(
        session_id="session-inactivity",
        device_id="device-1",
        websocket=websocket,
        state=SessionState.IDLE,
    )

    await gateway._handle_text(session, {"type": "listen", "state": "start", "mode": "auto"})
    await gateway._handle_audio(session, b"pcm-audio")
    await asyncio.sleep(0.05)

    assert websocket.sent_text[0] == {
        "type": "listen",
        "state": "detect",
        "session_id": "session-inactivity",
    }
    assert websocket.sent_text[1]["type"] == "stt"
    assert websocket.sent_text[2]["type"] == "tts"
    assert websocket.sent_text[2]["state"] == "start"
    assert websocket.sent_text[3]["type"] == "tts"
    assert websocket.sent_text[3]["state"] == "stop"
    assert session.state == SessionState.IDLE


@pytest.mark.asyncio
async def test_hard_cutoff_triggers_processing(monkeypatch):
    websocket = FakeWebSocket()
    monkeypatch.setattr("src.audio.xiaozhi_adapter.settings.xiaozhi_audio_format", "pcm")
    monkeypatch.setattr("src.audio.xiaozhi_adapter.settings.silence_timeout_ms", 1000)
    monkeypatch.setattr("src.audio.xiaozhi_adapter.settings.xiaozhi_max_listening_ms", 1)

    gateway = XiaozhiGateway(
        wakeword=MagicMock(),
        stt=MagicMock(transcribe=AsyncMock(return_value="bat den")),
        llm=MagicMock(chat=AsyncMock(return_value="Da bat den")),
        tts=MagicMock(synthesize=MagicMock(return_value=_tts_chunks())),
        mcp=MagicMock(list_tools=AsyncMock(return_value=[]), call_tool=AsyncMock()),
        store=MagicMock(),
    )

    async def fake_tts_to_opus(data: bytes, sample_rate: int) -> bytes:
        return b"opus-payload"

    monkeypatch.setattr("src.audio.xiaozhi_adapter._tts_to_opus", fake_tts_to_opus)

    session = AudioSession(
        session_id="session-hard-cutoff",
        device_id="device-1",
        websocket=websocket,
        state=SessionState.IDLE,
    )

    await gateway._handle_text(session, {"type": "listen", "state": "start", "mode": "auto"})
    await gateway._handle_audio(session, b"pcm-audio")
    await asyncio.sleep(0.05)

    assert websocket.sent_text[0] == {
        "type": "listen",
        "state": "detect",
        "session_id": "session-hard-cutoff",
    }
    assert websocket.sent_text[1]["type"] == "stt"
    assert websocket.sent_text[2]["type"] == "tts"
    assert websocket.sent_text[2]["state"] == "start"
    assert websocket.sent_text[3]["type"] == "tts"
    assert websocket.sent_text[3]["state"] == "stop"
    assert session.state == SessionState.IDLE
