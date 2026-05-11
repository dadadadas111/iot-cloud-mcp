"""
WakewordPipeline — wraps openWakeWord for server-side wakeword detection.

Consumes raw PCM16 audio chunks (16kHz mono) streamed from devices.
Returns True when the configured wakeword is detected above threshold.

Gracefully degrades to stub mode if openWakeWord or numpy are not installed,
so the service can start in development without all ML deps present.
"""

import logging

from ..config.settings import settings

logger = logging.getLogger(__name__)


class WakewordPipeline:
    def __init__(self) -> None:
        self._model = None
        self._model_name = settings.wakeword_model
        self._threshold = settings.wakeword_threshold

    async def load(self) -> None:
        try:
            from openwakeword.model import Model  # also imports numpy transitively

            self._model = Model(
                wakeword_models=[self._model_name],
                inference_framework="onnx",
            )
            logger.info("wakeword model loaded: %s", self._model_name)
        except Exception:
            logger.warning(
                "openWakeWord not available — wakeword disabled (stub mode). "
                "Every audio_end will be treated as a command."
            )
            self._model = None

    async def process_chunk(self, pcm16_chunk: bytes) -> bool:
        """Return True if wakeword detected in this audio chunk."""
        if self._model is None:
            return False

        import numpy as np  # only imported after successful load()

        audio = np.frombuffer(pcm16_chunk, dtype=np.int16).astype(np.float32) / 32768.0
        predictions = self._model.predict(audio)
        score = predictions.get(self._model_name, 0.0)

        if score >= self._threshold:
            logger.debug("wakeword score=%.3f TRIGGERED", score)
            self._model.reset()
            return True

        return False

    @property
    def is_stub(self) -> bool:
        return self._model is None
