from __future__ import annotations

import httpx


class GroqSttClient:
    def __init__(self, api_key: str, model: str, base_url: str = "https://api.groq.com/openai/v1") -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")

    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.ogg") -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self._base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                data={"model": self._model},
                files={"file": (filename, audio_bytes, "audio/ogg")},
            )
            response.raise_for_status()
            payload = response.json()
        return payload.get("text", "")
