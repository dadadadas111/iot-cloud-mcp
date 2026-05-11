"""
Redis-backed device session store.

Persists conversation history so devices can reconnect and continue a
conversation. Key: `agent:device:{device_id}` → JSON list of messages.
TTL: configurable, defaults to 1 hour.
"""

import json
import logging
from typing import Any

import redis.asyncio as aioredis

from ..config.settings import settings

logger = logging.getLogger(__name__)

_KEY_PREFIX = "agent:device:"


class SessionStore:
    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None

    async def connect(self) -> None:
        self._redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        await self._redis.ping()
        logger.info("SessionStore connected to Redis")

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    async def load_history(self, device_id: str) -> list[dict[str, Any]]:
        if not self._redis:
            return []
        raw = await self._redis.get(f"{_KEY_PREFIX}{device_id}")
        if not raw:
            return []
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return []

    async def save_history(self, device_id: str, history: list[dict[str, Any]]) -> None:
        if not self._redis:
            return
        await self._redis.setex(
            f"{_KEY_PREFIX}{device_id}",
            settings.session_ttl,
            json.dumps(history),
        )

    async def clear_history(self, device_id: str) -> None:
        if not self._redis:
            return
        await self._redis.delete(f"{_KEY_PREFIX}{device_id}")
