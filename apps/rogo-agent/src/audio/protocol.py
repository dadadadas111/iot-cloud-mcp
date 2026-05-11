"""
Device ↔ rogo-agent WebSocket message protocol.

Devices connect to wss://agent.rogo.com.vn/device/ws and exchange JSON
control messages and binary audio frames.

Control message flow:
  device → server: hello           (device registers, sends capabilities)
  server → device: hello_ack       (session ID assigned)
  device → server: audio_start     (VAD triggered — optional, server can infer from audio_end)
  device → server: <binary frames> (PCM16, 16kHz, mono, 30ms chunks)
  device → server: audio_end       (VAD silence — flush STT buffer)
  server → device: transcript      (STT result, for on-screen display)
  server → device: response_start  (LLM text + TTS about to stream)
  server → device: <binary frames> (TTS PCM16 response audio)
  server → device: response_end    (done, device can show idle)
  device → server: ping / server → device: pong (keepalive, 30s interval)
"""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class MessageType(StrEnum):
    # Device → server
    HELLO = "hello"
    AUDIO_START = "audio_start"
    AUDIO_END = "audio_end"
    PING = "ping"

    # Server → device
    HELLO_ACK = "hello_ack"
    TRANSCRIPT = "transcript"
    RESPONSE_START = "response_start"
    RESPONSE_END = "response_end"
    ERROR = "error"
    PONG = "pong"


class HelloMessage(BaseModel):
    type: MessageType = MessageType.HELLO
    device_id: str
    firmware_version: str = "unknown"
    capabilities: list[str] = []  # e.g. ["vad", "pcm16"]
    token: str = ""  # device auth token (validated in future; not enforced in demo)


class HelloAckMessage(BaseModel):
    type: MessageType = MessageType.HELLO_ACK
    session_id: str
    sample_rate: int = 16000
    encoding: str = "pcm16"


class AudioStartMessage(BaseModel):
    type: MessageType = MessageType.AUDIO_START


class AudioEndMessage(BaseModel):
    type: MessageType = MessageType.AUDIO_END


class PingMessage(BaseModel):
    type: MessageType = MessageType.PING


class PongMessage(BaseModel):
    type: MessageType = MessageType.PONG


class TranscriptMessage(BaseModel):
    type: MessageType = MessageType.TRANSCRIPT
    text: str
    confidence: float = 1.0


class ResponseStartMessage(BaseModel):
    type: MessageType = MessageType.RESPONSE_START
    text: str
    encoding: str = "pcm16"
    sample_rate: int = 16000


class ResponseEndMessage(BaseModel):
    type: MessageType = MessageType.RESPONSE_END


class ErrorMessage(BaseModel):
    type: MessageType = MessageType.ERROR
    code: str
    message: str


_TYPE_MAP: dict[str, type[BaseModel]] = {
    MessageType.HELLO: HelloMessage,
    MessageType.AUDIO_START: AudioStartMessage,
    MessageType.AUDIO_END: AudioEndMessage,
    MessageType.PING: PingMessage,
}


def parse_control_message(data: dict[str, Any]) -> BaseModel:
    msg_type = data.get("type")
    cls = _TYPE_MAP.get(msg_type)  # type: ignore[arg-type]
    if cls is None:
        raise ValueError(f"Unknown or non-device message type: {msg_type!r}")
    return cls(**{k: v for k, v in data.items() if k != "type"})
