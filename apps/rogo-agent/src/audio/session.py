"""
AudioSession: per-device conversation state for one WebSocket connection.

Lifecycle:
  IDLE → (wakeword detected) → LISTENING → (audio_end) → PROCESSING → IDLE
"""

import logging
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = logging.getLogger(__name__)


class SessionState(StrEnum):
    IDLE = "idle"          # connected, waiting for wakeword
    LISTENING = "listening"  # wakeword triggered, collecting utterance
    PROCESSING = "processing"  # STT + LLM + TTS in flight
    RESPONDING = "responding"  # streaming TTS back to device


@dataclass
class AudioSession:
    session_id: str
    device_id: str
    websocket: "WebSocket"
    state: SessionState = SessionState.IDLE
    audio_buffer: bytearray = field(default_factory=bytearray)
    conversation_history: list[dict] = field(default_factory=list)

    def reset_audio(self) -> None:
        self.audio_buffer = bytearray()

    def append_audio(self, chunk: bytes) -> None:
        self.audio_buffer.extend(chunk)

    def get_audio_bytes(self) -> bytes:
        return bytes(self.audio_buffer)

    def transition(self, new_state: SessionState) -> None:
        logger.debug("session=%s state=%s→%s", self.session_id, self.state, new_state)
        self.state = new_state

    def add_turn(self, role: str, content: str) -> None:
        self.conversation_history.append({"role": role, "content": content})
        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]
