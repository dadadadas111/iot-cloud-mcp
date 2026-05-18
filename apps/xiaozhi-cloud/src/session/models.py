from dataclasses import dataclass, field
from enum import StrEnum


class SessionPhase(StrEnum):
    CONNECTED = "connected"
    READY = "ready"
    LISTENING = "listening"
    PROCESSING = "processing"
    RESPONDING = "responding"
    INTERRUPTED = "interrupted"
    CLOSED = "closed"


@dataclass
class DeviceSession:
    session_id: str
    device_id: str
    client_id: str
    protocol_version: int
    phase: SessionPhase = SessionPhase.CONNECTED
    conversation_history: list[dict] = field(default_factory=list)
    listen_mode: str | None = None
    last_abort_reason: str | None = None
    audio_buffer: bytearray = field(default_factory=bytearray)
    last_speech_time: float | None = None
    audio_analyzed_offset: int = 0

    def append_audio(self, chunk: bytes) -> None:
        self.audio_buffer.extend(chunk)

    def reset_audio(self) -> None:
        self.audio_buffer = bytearray()
        self.audio_analyzed_offset = 0
        self.last_speech_time = None

    def get_audio_bytes(self) -> bytes:
        return bytes(self.audio_buffer)

    def add_turn(self, role: str, content: str) -> None:
        self.conversation_history.append({"role": role, "content": content})
        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]
