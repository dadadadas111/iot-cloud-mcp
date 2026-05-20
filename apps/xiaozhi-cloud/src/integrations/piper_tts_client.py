from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncIterator

logger = logging.getLogger(__name__)


class PiperTtsClient:
    """Local TTS via Piper. Synthesizes raw PCM (s16le) on a thread executor."""

    output_format = "pcm"

    def __init__(self, model_path: str) -> None:
        from piper import PiperVoice  # lazy import — heavy load at startup
        self._voice = PiperVoice.load(model_path)
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="piper")
        logger.info("piper model loaded path=%s sample_rate=%d", model_path, self._voice.config.sample_rate)

    @property
    def sample_rate(self) -> int:
        return self._voice.config.sample_rate

    async def synthesize_stream(self, text: str) -> AsyncIterator[bytes]:
        """Yield raw PCM bytes (s16le) from Piper. Runs synthesis in executor."""
        loop = asyncio.get_running_loop()

        def _run() -> list[bytes]:
            return list(self._voice.synthesize_stream_raw(text))

        chunks = await loop.run_in_executor(self._executor, _run)
        for chunk in chunks:
            yield chunk
