from __future__ import annotations

import json
import logging
from typing import AsyncIterator

import httpx

logger = logging.getLogger(__name__)


class OpenAiCompatibleLlmClient:
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model

    async def chat(self, messages: list[dict], tools: list[dict] | None = None) -> dict:
        """
        Send a chat completion request and return the full assistant message dict.

        The returned dict has the shape:
            {
                "role": "assistant",
                "content": str | None,
                "tool_calls": [...] | None,   # present when the model requests tools
            }

        Callers that only want the text content should use .get("content") or "".
        """
        body: dict = {
            "model": self._model,
            "messages": messages,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            payload = response.json()

        return payload["choices"][0]["message"]

    async def chat_stream(
        self, messages: list[dict], tools: list[dict] | None = None
    ) -> AsyncIterator[dict]:
        """
        Stream chat completion deltas. Yields dicts with one or more of:
          {"content": str}                      # token chunk
          {"tool_call_delta": {                 # tool call piece (assemble by index)
              "index": int,
              "id": str | None,                 # only set on first chunk for this index
              "name": str | None,               # only set on first chunk for this index
              "arguments": str,                 # concat across chunks
          }}
          {"finish_reason": str}                # "stop" | "tool_calls" | "length" | ...
        Terminates when the upstream emits [DONE]. Does NOT raise on benign
        end-of-stream; raises RuntimeError on HTTP errors.
        """
        body: dict = {
            "model": self._model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=None)) as client:
                async with client.stream("POST", url, headers=headers, json=body) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        text = line[6:]
                        if text == "[DONE]":
                            break
                        try:
                            event = json.loads(text)
                        except json.JSONDecodeError:
                            logger.warning("llm stream: unparseable SSE line: %s", line[:120])
                            continue

                        # Handle upstream error events embedded in the stream.
                        if "error" in event:
                            raise RuntimeError(f"llm stream upstream error: {event['error']}")

                        choices = event.get("choices")
                        if not choices:
                            continue

                        choice = choices[0]
                        delta = choice.get("delta", {})

                        # Emit content tokens (skip reasoning_content — internal chain-of-thought).
                        content = delta.get("content")
                        if content:
                            yield {"content": content}

                        # Emit tool call deltas for caller-side assembly.
                        for tc in delta.get("tool_calls") or []:
                            fn = tc.get("function", {})
                            yield {
                                "tool_call_delta": {
                                    "index": tc.get("index", 0),
                                    "id": tc.get("id") or None,
                                    "name": fn.get("name") or None,
                                    "arguments": fn.get("arguments") or "",
                                }
                            }

                        finish_reason = choice.get("finish_reason")
                        if finish_reason:
                            yield {"finish_reason": finish_reason}
        except httpx.HTTPError as exc:
            raise RuntimeError(f"llm stream failed: {exc}") from exc
