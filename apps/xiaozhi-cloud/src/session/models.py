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
