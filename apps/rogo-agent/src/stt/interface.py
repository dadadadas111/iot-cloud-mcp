"""STT service interface. Swap implementations without touching callers."""

from abc import ABC, abstractmethod


class ISttService(ABC):
    @abstractmethod
    async def transcribe(self, pcm16_audio: bytes, sample_rate: int = 16000) -> str:
        """Transcribe raw PCM16 audio bytes to text."""
        ...
