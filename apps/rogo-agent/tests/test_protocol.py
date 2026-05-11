"""Tests for the device ↔ agent WebSocket protocol."""

import pytest
from src.audio.protocol import (
    AudioEndMessage,
    AudioStartMessage,
    HelloMessage,
    MessageType,
    PingMessage,
    parse_control_message,
)


def test_parse_hello():
    msg = parse_control_message({"type": "hello", "device_id": "dev-001"})
    assert isinstance(msg, HelloMessage)
    assert msg.device_id == "dev-001"
    assert msg.firmware_version == "unknown"


def test_parse_audio_end():
    msg = parse_control_message({"type": "audio_end"})
    assert isinstance(msg, AudioEndMessage)


def test_parse_audio_start():
    msg = parse_control_message({"type": "audio_start"})
    assert isinstance(msg, AudioStartMessage)


def test_parse_ping():
    msg = parse_control_message({"type": "ping"})
    assert isinstance(msg, PingMessage)


def test_parse_unknown_raises():
    with pytest.raises(ValueError, match="Unknown"):
        parse_control_message({"type": "response_start", "text": "hi"})


def test_hello_message_serializes():
    msg = HelloMessage(device_id="dev-001")
    data = msg.model_dump()
    assert data["type"] == MessageType.HELLO
    assert data["device_id"] == "dev-001"
