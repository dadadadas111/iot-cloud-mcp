"""
RogoMcpClient — long-lived MCP client connecting rogo-agent to rogo-mcp.

Uses the official MCP Python SDK (same transport as bridge_server.py).
Maintains one initialized ClientSession. Auto-reconnects on token expiry or
connection drop.

Auth: headless PKCE OAuth → Bearer token → passed in Authorization header to
the MCP streamable HTTP transport. Token is refreshed ~60s before expiry.
"""

import asyncio
import base64
import hashlib
import logging
import os
import secrets
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from ..config.settings import settings

logger = logging.getLogger(__name__)


def _pkce() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(os.urandom(48)).rstrip(b"=").decode()
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    return verifier, challenge


def _tool_to_dict(tool: Any) -> dict:
    """Convert MCP SDK Tool object to a plain dict for LLM adapters."""
    # inputSchema may be a dict or a Pydantic model depending on SDK version
    input_schema = getattr(tool, "inputSchema", None) or getattr(tool, "input_schema", None)
    if hasattr(input_schema, "model_dump"):
        input_schema = input_schema.model_dump()
    elif input_schema is None:
        input_schema = {"type": "object", "properties": {}}
    return {
        "name": tool.name,
        "description": tool.description or "",
        "inputSchema": input_schema,
    }


async def _login() -> tuple[str, int]:
    """Perform headless PKCE OAuth. Returns (access_token, expires_in)."""
    verifier, challenge = _pkce()
    state = secrets.token_urlsafe(16)

    async with httpx.AsyncClient(follow_redirects=False, timeout=30) as client:
        r = await client.post(
            f"{settings.rogo_mcp_url}/login",
            data={
                "email": settings.rogo_email,
                "password": settings.rogo_password,
                "client_id": "rogo-agent",
                "redirect_uri": "http://127.0.0.1/cb",
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )

    if r.status_code not in (302, 303):
        raise RuntimeError(f"MCP login failed ({r.status_code}): {r.text[:200]}")

    code = parse_qs(urlparse(r.headers["location"]).query).get("code", [None])[0]
    if not code:
        raise RuntimeError(f"No auth code in redirect: {r.headers.get('location')}")

    async with httpx.AsyncClient(timeout=30) as client:
        r2 = await client.post(
            f"{settings.rogo_mcp_url}/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": "rogo-agent",
            },
        )
        r2.raise_for_status()
        d = r2.json()

    return d["access_token"], int(d.get("expires_in", 3600))


class RogoMcpClient:
    """
    Shared MCP client for the rogo-agent process.

    Usage:
      await client.start()       # call once at app startup
      await client.stop()        # call once at app shutdown
      tools = await client.list_tools()
      result = await client.call_tool("control_device_simple", {...})
    """

    def __init__(self) -> None:
        self._session: ClientSession | None = None
        self._tools: list[Any] | None = None  # list of mcp.types.Tool
        self._ready = asyncio.Event()
        self._stopped = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._stopped = False
        self._task = asyncio.create_task(self._connection_loop(), name="mcp-client-loop")

    async def stop(self) -> None:
        self._stopped = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _connection_loop(self) -> None:
        while not self._stopped:
            self._ready.clear()
            self._session = None
            self._tools = None

            try:
                token, expires_in = await _login()
                logger.info("rogo-mcp auth OK, token valid for %ds", expires_in)

                async with streamablehttp_client(
                    settings.rogo_mcp_url,
                    headers={"Authorization": f"Bearer {token}"},
                ) as (read_stream, write_stream, _):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        self._session = session
                        self._ready.set()
                        logger.info("MCP session initialized")

                        # Pre-fetch tool list once after connect
                        result = await session.list_tools()
                        self._tools = result.tools

                        # Sleep until 60s before token expiry, then reconnect
                        sleep_for = max(expires_in - 60, 30)
                        await asyncio.sleep(sleep_for)
                        logger.info("Token near expiry — reconnecting MCP session")

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("MCP connection error — retrying in 10s")
                await asyncio.sleep(10)

    async def list_tools(self) -> list[dict]:
        await self._ready.wait()
        if self._tools is None:
            result = await self._session.list_tools()
            self._tools = result.tools
        return [_tool_to_dict(t) for t in self._tools]

    async def call_tool(self, name: str, arguments: dict) -> Any:
        await self._ready.wait()
        result = await self._session.call_tool(name, arguments)
        content = result.content
        if content and hasattr(content[0], "text"):
            return content[0].text
        return str(content)
