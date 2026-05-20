from __future__ import annotations

from typing import AsyncIterator

import edge_tts


class EdgeTtsClient:
    def __init__(self, voice: str) -> None:
        self._voice = voice

    async def synthesize(self, text: str) -> bytes:
        communicate = edge_tts.Communicate(text=text, voice=self._voice)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
        return bytes(audio)

    async def synthesize_stream(self, text: str) -> AsyncIterator[bytes]:
        """Yield raw mp3 chunks as edge-tts produces them. Raises if no audio
        chunks are received (matches edge_tts.NoAudioReceived semantics)."""
        communicate = edge_tts.Communicate(text=text, voice=self._voice)
        count = 0
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                count += 1
                yield chunk["data"]
        if count == 0:
            raise RuntimeError("edge tts produced no audio")
