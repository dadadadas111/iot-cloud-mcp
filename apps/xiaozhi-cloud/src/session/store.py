from __future__ import annotations

import json

from redis.asyncio import Redis

from .models import DeviceSession


class SessionStore:
    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds

    def _key(self, session_id: str) -> str:
        return f"xiaozhi:session:{session_id}"

    async def save(self, session: DeviceSession) -> None:
        payload = {
            "session_id": session.session_id,
            "device_id": session.device_id,
            "client_id": session.client_id,
            "protocol_version": session.protocol_version,
            "phase": session.phase,
            "conversation_history": session.conversation_history,
            "listen_mode": session.listen_mode,
            "last_abort_reason": session.last_abort_reason,
            "audio_buffer_bytes": len(session.audio_buffer),
        }
        await self._redis.set(self._key(session.session_id), json.dumps(payload), ex=self._ttl_seconds)

    async def load(self, session_id: str) -> dict | None:
        raw = await self._redis.get(self._key(session_id))
        if raw is None:
            return None
        return json.loads(raw)
