"""
Anthropic Claude LLM adapter with tool-call loop.
Set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY in .env.

Uses claude-haiku-4-5 by default for low latency in voice context.
Swap to claude-sonnet-4-6 for better reasoning at the cost of ~1s extra latency.
"""

import json
import logging
from collections.abc import Callable, Awaitable
from typing import Any

import httpx

from ..config.settings import settings
from .interface import ILlmService
from .openai_llm import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 1024


class AnthropicLlmService(ILlmService):
    async def chat(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_caller: Callable[[str, dict], Awaitable[Any]],
    ) -> str:
        model = settings.llm_model if settings.llm_model else DEFAULT_MODEL
        headers = {
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        anthropic_tools = [_to_anthropic_tool(t) for t in tools]

        async with httpx.AsyncClient(timeout=60) as client:
            for _ in range(5):
                body: dict[str, Any] = {
                    "model": model,
                    "max_tokens": MAX_TOKENS,
                    "system": SYSTEM_PROMPT,
                    "messages": messages,
                }
                if anthropic_tools:
                    body["tools"] = anthropic_tools

                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=headers,
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()

                stop_reason = data.get("stop_reason")
                content_blocks = data.get("content", [])

                if stop_reason != "tool_use":
                    text_blocks = [b["text"] for b in content_blocks if b["type"] == "text"]
                    return " ".join(text_blocks).strip()

                # Process tool use blocks
                messages = list(messages) + [{"role": "assistant", "content": content_blocks}]
                tool_results = []
                for block in content_blocks:
                    if block["type"] != "tool_use":
                        continue
                    logger.info("tool_call name=%s", block["name"])
                    result = await tool_caller(block["name"], block.get("input", {}))
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block["id"],
                        "content": json.dumps(result),
                    })
                messages = list(messages) + [{"role": "user", "content": tool_results}]

        return "Xin lỗi, tôi không thể hoàn thành yêu cầu này."


def _to_anthropic_tool(mcp_tool: dict) -> dict:
    return {
        "name": mcp_tool["name"],
        "description": mcp_tool.get("description", ""),
        "input_schema": mcp_tool.get("inputSchema", {"type": "object", "properties": {}}),
    }
