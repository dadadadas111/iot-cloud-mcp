"""
Edge-TTS Vietnamese TTS — zero-infrastructure, good quality for demo.

Yields MP3 audio chunks directly from the Microsoft Edge TTS stream.
Xiaozhi ESP32 firmware plays MP3 via esp-adf; sending raw PCM16 would produce silence.
"""

import logging
from collections.abc import AsyncGenerator

from ..config.settings import settings
from .interface import ITtsService

logger = logging.getLogger(__name__)
CHUNK_SIZE = 4096  # bytes per yield


class EdgeTtsService(ITtsService):
    async def synthesize(self, text: str) -> AsyncGenerator[bytes, None]:
        try:
            import edge_tts  # lazy — not always installed in test environments

            communicate = edge_tts.Communicate(text, voice=settings.tts_voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    data = chunk["data"]
                    for i in range(0, len(data), CHUNK_SIZE):
                        yield data[i : i + CHUNK_SIZE]

        except Exception:
            logger.exception("TTS synthesis failed — sending empty response")
            return
