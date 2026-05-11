"""TTS service interface. Yields PCM16 audio chunks for streaming to device."""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class ITtsService(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        """Yield raw PCM16 audio chunks (16kHz mono)."""
        ...
        yield b""  # make type checker see this as a generator
