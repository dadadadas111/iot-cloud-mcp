"""
FunASR STT — self-hosted alternative to OpenAI Whisper.

Connects to a running FunASR WebSocket server (part of the xiaozhi-esp32-server
stack, or standalone). Swap in by setting STT_PROVIDER=funasr in .env.

FunASR server setup: docker run -p 10095:10095 registry.cn-hangzhou.aliyuncs.com/funasr_repo/funasr:...
"""

import io
import json
import logging
import wave

import websockets

from ..config.settings import settings
from .interface import ISttService

logger = logging.getLogger(__name__)


class FunAsrSttService(ISttService):
    async def transcribe(self, pcm16_audio: bytes, sample_rate: int = 16000) -> str:
        wav_bytes = _pcm16_to_wav(pcm16_audio, sample_rate)
        uri = settings.funasr_url.replace("http://", "ws://").replace("https://", "wss://")

        try:
            async with websockets.connect(uri, open_timeout=10) as ws:
                # FunASR protocol: send config first, then audio, then EOF
                await ws.send(json.dumps({
                    "mode": "offline",
                    "wav_format": "wav",
                    "is_speaking": True,
                    "hotwords": "",
                    "itn": True,
                }))
                await ws.send(wav_bytes)
                await ws.send(json.dumps({"is_speaking": False}))

                result = json.loads(await ws.recv())
                return result.get("text", "").strip()
        except Exception:
            logger.exception("FunASR transcription failed")
            return ""


def _pcm16_to_wav(pcm16: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16)
    return buf.getvalue()
