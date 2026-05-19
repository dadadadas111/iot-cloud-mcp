from __future__ import annotations

import time
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
    audio_sample_rate: int
    audio_channels: int
    audio_frame_duration: int
    phase: SessionPhase = SessionPhase.CONNECTED
    conversation_history: list[dict] = field(default_factory=list)
    listen_mode: str | None = None
    last_abort_reason: str | None = None
    audio_frames: list[bytes] = field(default_factory=list)
    last_speech_time: float | None = None
    audio_analyzed_offset: int = 0
    speech_detected: bool = False
    listening_started_at: float | None = None
    # MCP tool cache — fetched once per session; None means not yet fetched.
    mcp_tools: list[dict] | None = None
    mcp_tools_fetched_at: float | None = None

    def append_audio(self, chunk: bytes) -> None:
        self.audio_frames.append(chunk)

    def reset_audio(self) -> None:
        self.audio_frames = []
        self.audio_analyzed_offset = 0
        self.last_speech_time = None
        self.speech_detected = False
        self.listening_started_at = None

    def get_audio_bytes(self) -> bytes:
        return b"".join(self.audio_frames)

    def add_turn(self, role: str, content: str) -> None:
        self.conversation_history.append({"role": role, "content": content})
        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]

    def is_mcp_tools_stale(self, ttl_seconds: float = 300.0) -> bool:
        """Return True if the tool cache is empty or older than ttl_seconds."""
        if self.mcp_tools is None or self.mcp_tools_fetched_at is None:
            return True
        return (time.time() - self.mcp_tools_fetched_at) > ttl_seconds

    def set_mcp_tools(self, tools: list[dict]) -> None:
        self.mcp_tools = tools
        self.mcp_tools_fetched_at = time.time()
