"""
Ollama LLM adapter — for fully self-hosted inference (Qwen2.5, LLaMA 3, etc.).
Swap in by setting LLM_PROVIDER=ollama and LLM_BASE_URL=http://localhost:11434.

Tool calling format follows OpenAI-compatible JSON; Ollama >= 0.3.1 supports this.
Falls back to the OpenAI adapter if base_url is not configured.
"""

import json
import logging
from collections.abc import Callable, Awaitable
from typing import Any

import httpx

from ..config.settings import settings
from .interface import ILlmService
from .openai_llm import SYSTEM_PROMPT, _to_openai_tool

logger = logging.getLogger(__name__)


class OllamaLlmService(ILlmService):
    def __init__(self) -> None:
        base = (settings.llm_base_url or "http://localhost:11434").rstrip("/")
        self._url = f"{base}/api/chat"

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_caller: Callable[[str, dict], Awaitable[Any]],
    ) -> str:
        payload_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

        async with httpx.AsyncClient(timeout=120) as client:
            for _ in range(5):
                body: dict[str, Any] = {
                    "model": settings.llm_model,
                    "messages": payload_messages,
                    "stream": False,
                }
                if tools:
                    body["tools"] = [_to_openai_tool(t) for t in tools]

                resp = await client.post(self._url, json=body)
                resp.raise_for_status()
                data = resp.json()

                msg = data["message"]
                tool_calls = msg.get("tool_calls") or []

                if not tool_calls:
                    return msg.get("content") or ""

                payload_messages.append(msg)
                for tc in tool_calls:
                    fn = tc["function"]
                    args = fn.get("arguments") or {}
                    if isinstance(args, str):
                        args = json.loads(args)
                    logger.info("tool_call name=%s", fn["name"])
                    result = await tool_caller(fn["name"], args)
                    payload_messages.append({
                        "role": "tool",
                        "content": json.dumps(result),
                    })

        return "Xin lỗi, tôi không thể hoàn thành yêu cầu này."
