"""Tests for AudioSession state machine."""

import pytest
from unittest.mock import MagicMock

from src.audio.session import AudioSession, SessionState


def make_session() -> AudioSession:
    return AudioSession(
        session_id="test-session-id",
        device_id="dev-001",
        websocket=MagicMock(),
    )


def test_initial_state():
    s = make_session()
    assert s.state == SessionState.IDLE
    assert s.audio_buffer == bytearray()
    assert s.conversation_history == []


def test_append_and_reset_audio():
    s = make_session()
    s.append_audio(b"\x00\x01")
    s.append_audio(b"\x02\x03")
    assert s.get_audio_bytes() == b"\x00\x01\x02\x03"
    s.reset_audio()
    assert s.get_audio_bytes() == b""


def test_state_transition():
    s = make_session()
    s.transition(SessionState.LISTENING)
    assert s.state == SessionState.LISTENING


def test_conversation_history_pruned():
    s = make_session()
    for i in range(25):
        s.add_turn("user", f"message {i}")
    assert len(s.conversation_history) == 20
    assert s.conversation_history[-1]["content"] == "message 24"


def test_add_turn():
    s = make_session()
    s.add_turn("user", "bật đèn")
    s.add_turn("assistant", "Đã bật đèn phòng khách.")
    assert s.conversation_history[0]["role"] == "user"
    assert s.conversation_history[1]["role"] == "assistant"
