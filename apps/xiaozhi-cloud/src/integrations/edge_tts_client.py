from __future__ import annotations

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
