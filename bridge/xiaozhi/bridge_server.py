#!/usr/bin/env python3
"""
Transparent MCP proxy: stdio ←→ Rogo MCP HTTP server.
Run via bridge.py (which handles OAuth) — do not invoke directly.

Env vars:
  ROGO_MCP_URL        Rogo MCP server endpoint (e.g. https://alias.mcp.dash.id.vn)
  ROGO_ACCESS_TOKEN   Bearer token obtained by bridge.py
"""

import asyncio, os, sys
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

ROGO_URL   = os.environ["ROGO_MCP_URL"]
ROGO_TOKEN = os.environ["ROGO_ACCESS_TOKEN"]

server = Server("rogo-proxy")
_session: ClientSession | None = None


@server.list_tools()
async def list_tools():
    return (await _session.list_tools()).tools


@server.call_tool()
async def call_tool(name: str, arguments: dict | None):
    result = await _session.call_tool(name, arguments or {})
    return result.content


async def main() -> None:
    global _session
    headers = {"Authorization": f"Bearer {ROGO_TOKEN}"}
    async with streamablehttp_client(ROGO_URL, headers=headers) as (r, w, _):
        async with ClientSession(r, w) as session:
            await session.initialize()
            _session = session
            print("[Proxy] Connected to Rogo MCP server.", file=sys.stderr, flush=True)
            async with stdio_server() as (stdin, stdout):
                await server.run(stdin, stdout, server.create_initialization_options())


asyncio.run(main())
