from __future__ import annotations

import httpx


class OpenAiCompatibleLlmClient:
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model

    async def chat(self, messages: list[dict], tools: list[dict] | None = None) -> str:
        body: dict = {
            "model": self._model,
            "messages": messages,
        }
        if tools:
            body["tools"] = tools

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

        return payload["choices"][0]["message"].get("content", "")
