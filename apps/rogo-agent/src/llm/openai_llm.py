"""
OpenAI-compatible chat completion with tool-call loop.

Works with OpenAI (default), or any OpenAI-compatible endpoint via:
  LLM_BASE_URL=https://your-provider.example.com/v1
  LLM_API_KEY=your-key
"""

import json
import logging
from collections.abc import Callable, Awaitable
from typing import Any

import httpx

from ..config.settings import settings
from .interface import ILlmService

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
Bạn là trợ lý giọng nói thông minh của Rogo Smart Home. Bạn giúp người dùng điều khiển
các thiết bị nhà thông minh bằng tiếng Việt. Trả lời ngắn gọn, rõ ràng, phù hợp để đọc
to (không dùng Markdown, không liệt kê dài). Khi điều khiển thiết bị hãy xác nhận hành
động đã thực hiện.
""".strip()


class OpenAiLlmService(ILlmService):
    def __init__(self) -> None:
        base = settings.llm_base_url.rstrip("/") if settings.llm_base_url else "https://api.openai.com/v1"
        self._endpoint = f"{base}/chat/completions"
        self._api_key = settings.llm_api_key or settings.openai_api_key
        logger.info("LLM endpoint: %s", self._endpoint)

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_caller: Callable[[str, dict], Awaitable[Any]],
    ) -> str:
        payload_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

        async with httpx.AsyncClient(timeout=60) as client:
            for _ in range(5):  # max 5 tool-call rounds
                body: dict[str, Any] = {
                    "model": settings.llm_model,
                    "messages": payload_messages,
                }
                if tools:
                    body["tools"] = [_to_openai_tool(t) for t in tools]
                    body["tool_choice"] = "auto"

                resp = await client.post(
                    self._endpoint,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()
                choice = data["choices"][0]
                msg = choice["message"]

                if choice["finish_reason"] != "tool_calls":
                    return msg.get("content") or ""

                # Process tool calls
                payload_messages.append(msg)
                for tc in msg.get("tool_calls", []):
                    fn = tc["function"]
                    args = json.loads(fn.get("arguments", "{}"))
                    logger.info("tool_call name=%s", fn["name"])
                    result = await tool_caller(fn["name"], args)
                    payload_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": json.dumps(result),
                    })

        return "Xin lỗi, tôi không thể hoàn thành yêu cầu này."


def _to_openai_tool(mcp_tool: dict) -> dict:
    return {
        "type": "function",
        "function": {
            "name": mcp_tool["name"],
            "description": mcp_tool.get("description", ""),
            "parameters": mcp_tool.get("inputSchema", {"type": "object", "properties": {}}),
        },
    }
