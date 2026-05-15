from __future__ import annotations

import httpx


class RogoMcpClient:
    def __init__(self, base_url: str, bearer_token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._bearer_token = bearer_token

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._bearer_token}",
            "Content-Type": "application/json",
        }

    async def post_jsonrpc(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(self._base_url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()
