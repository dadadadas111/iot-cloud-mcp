"""
Whisper STT via any OpenAI-compatible transcription endpoint.

Defaults to api.openai.com. Override with:
  STT_BASE_URL=https://api.groq.com/openai/v1
  STT_API_KEY=gsk_...
  STT_MODEL=whisper-large-v3-turbo
"""

import io
import logging
import wave
import httpx

from ..config.settings import settings
from .interface import ISttService

logger = logging.getLogger(__name__)


class OpenAiSttService(ISttService):
    def __init__(self) -> None:
        base = settings.stt_base_url.rstrip("/") if settings.stt_base_url else "https://api.openai.com/v1"
        self._endpoint = f"{base}/audio/transcriptions"
        self._api_key = settings.stt_api_key or settings.openai_api_key
        self._model = settings.stt_model
        logger.info("STT endpoint: %s model: %s", self._endpoint, self._model)

    async def transcribe(self, pcm16_audio: bytes, sample_rate: int = 16000) -> str:
        wav_bytes = _pcm16_to_wav(pcm16_audio, sample_rate)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                self._endpoint,
                headers={"Authorization": f"Bearer {self._api_key}"},
                files={"file": ("audio.wav", wav_bytes, "audio/wav")},
                data={"model": self._model, "language": "vi"},
            )
            response.raise_for_status()
            return response.json()["text"].strip()


def _pcm16_to_wav(pcm16: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit = 2 bytes
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16)
    return buf.getvalue()
