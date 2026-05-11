"""
Service provider factory.
Reads STT_PROVIDER / LLM_PROVIDER / TTS_PROVIDER from settings
and returns the correct implementation.
"""

from .config.settings import settings
from .stt.interface import ISttService
from .tts.interface import ITtsService
from .llm.interface import ILlmService


def get_stt() -> ISttService:
    match settings.stt_provider:
        case "funasr":
            from .stt.funasr_stt import FunAsrSttService
            return FunAsrSttService()
        case _:
            from .stt.openai_stt import OpenAiSttService
            return OpenAiSttService()


def get_tts() -> ITtsService:
    match settings.tts_provider:
        case _:
            from .tts.edge_tts import EdgeTtsService
            return EdgeTtsService()


def get_llm() -> ILlmService:
    match settings.llm_provider:
        case "ollama":
            from .llm.ollama_llm import OllamaLlmService
            return OllamaLlmService()
        case "anthropic":
            from .llm.anthropic_llm import AnthropicLlmService
            return AnthropicLlmService()
        case _:  # "openai" | "openai_compatible" | anything else
            from .llm.openai_llm import OpenAiLlmService
            return OpenAiLlmService()
