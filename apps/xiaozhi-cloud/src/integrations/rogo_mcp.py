from __future__ import annotations

import logging

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger(__name__)

# MCP tool schema shape expected by OpenAI-compatible /chat/completions:
#   {"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}


class RogoMcpClient:
    """
    Thin async client for the Rogo MCP HTTP server.

    URL:  {mcp_base_url}  (full endpoint — no suffix appended)
    Auth: Bearer {bearer_token}

    Each public method opens a fresh MCP HTTP session, performs the operation,
    and closes cleanly.  Tool list results are cached on DeviceSession by the
    caller; tool calls are typically rare (a few per turn at most).
    """

    def __init__(self, mcp_url: str, bearer_token: str) -> None:
        self._mcp_url = mcp_url
        self._headers = {"Authorization": f"Bearer {bearer_token}"}

    async def list_tools_as_openai_schema(self) -> list[dict]:
        """
        Fetch available tools from the MCP server and return them in the
        OpenAI function-calling schema format so they can be passed directly
        to the LLM chat endpoint.
        """
        async with streamablehttp_client(self._mcp_url, headers=self._headers) as (r, w, _):
            async with ClientSession(r, w) as session:
                await session.initialize()
                result = await session.list_tools()

        tools_openai: list[dict] = []
        for tool in result.tools:
            schema = tool.inputSchema if tool.inputSchema else {"type": "object", "properties": {}}
            tools_openai.append(
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description or "",
                        "parameters": schema,
                    },
                }
            )
        logger.debug("mcp list_tools returned %d tools", len(tools_openai))
        return tools_openai

    async def call_tool(self, name: str, arguments: dict) -> str:
        """
        Call a single MCP tool and return its text content as a string.
        On error, returns an error description string so the LLM can reason
        about the failure rather than crashing the turn.
        """
        try:
            async with streamablehttp_client(self._mcp_url, headers=self._headers) as (r, w, _):
                async with ClientSession(r, w) as session:
                    await session.initialize()
                    result = await session.call_tool(name, arguments)

            # Collect all text content blocks
            parts: list[str] = []
            for block in result.content:
                if hasattr(block, "text"):
                    parts.append(block.text)
                else:
                    parts.append(str(block))
            return "\n".join(parts) if parts else "(no output)"
        except Exception as exc:
            logger.warning("mcp call_tool name=%s failed: %s", name, exc)
            return "Tool temporarily unavailable."
