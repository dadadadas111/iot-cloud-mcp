from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.integrations.openai_compatible_llm import OpenAiCompatibleLlmClient

# Canned SSE byte stream: two content deltas, then finish_reason stop, then [DONE].
_SSE_CONTENT = "\n".join([
    'data: {"choices":[{"delta":{"content":"Xin","role":"assistant"},"index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    'data: {"choices":[{"delta":{"content":" chào."},"index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    "data: [DONE]",
    "",
])

# Canned SSE stream with a tool call (all fields in one chunk, as the proxy returns).
_SSE_TOOL_CALL = "\n".join([
    'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"function":{"arguments":"{}","name":"ping"},"id":"call_abc","index":0,"type":"function"}]},"index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls","index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    "data: [DONE]",
    "",
])

# SSE stream with reasoning_content only first (should be skipped), then content.
_SSE_REASONING_THEN_CONTENT = "\n".join([
    'data: {"choices":[{"delta":{"reasoning_content":"thinking","role":"assistant"},"index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    'data: {"choices":[{"delta":{"content":"Kết quả."},"index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}],"model":"m","object":"chat.completion.chunk"}',
    "",
    "data: [DONE]",
    "",
])


def _make_mock_response(sse_text: str):
    """Build a mock httpx streaming response whose aiter_lines() yields SSE lines."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()

    async def _aiter_lines():
        for line in sse_text.splitlines():
            yield line

    mock_response.aiter_lines = _aiter_lines
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)
    return mock_response


def _make_mock_client(mock_response):
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.stream = MagicMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_chat_stream_parses_sse_content() -> None:
    client = OpenAiCompatibleLlmClient("https://example.com/v1", "key", "model")
    mock_response = _make_mock_response(_SSE_CONTENT)
    mock_http_client = _make_mock_client(mock_response)

    with patch("httpx.AsyncClient", return_value=mock_http_client):
        events = [e async for e in client.chat_stream([{"role": "user", "content": "hi"}])]

    content_events = [e for e in events if "content" in e]
    finish_events = [e for e in events if "finish_reason" in e]

    assert len(content_events) == 2
    assert content_events[0]["content"] == "Xin"
    assert content_events[1]["content"] == " chào."
    assert len(finish_events) == 1
    assert finish_events[0]["finish_reason"] == "stop"


@pytest.mark.asyncio
async def test_chat_stream_parses_tool_call_delta() -> None:
    client = OpenAiCompatibleLlmClient("https://example.com/v1", "key", "model")
    mock_response = _make_mock_response(_SSE_TOOL_CALL)
    mock_http_client = _make_mock_client(mock_response)

    with patch("httpx.AsyncClient", return_value=mock_http_client):
        events = [e async for e in client.chat_stream([{"role": "user", "content": "ping"}])]

    tc_events = [e for e in events if "tool_call_delta" in e]
    finish_events = [e for e in events if "finish_reason" in e]

    assert len(tc_events) == 1
    tc = tc_events[0]["tool_call_delta"]
    assert tc["index"] == 0
    assert tc["id"] == "call_abc"
    assert tc["name"] == "ping"
    assert tc["arguments"] == "{}"
    assert len(finish_events) == 1
    assert finish_events[0]["finish_reason"] == "tool_calls"


@pytest.mark.asyncio
async def test_chat_stream_skips_reasoning_content() -> None:
    client = OpenAiCompatibleLlmClient("https://example.com/v1", "key", "model")
    mock_response = _make_mock_response(_SSE_REASONING_THEN_CONTENT)
    mock_http_client = _make_mock_client(mock_response)

    with patch("httpx.AsyncClient", return_value=mock_http_client):
        events = [e async for e in client.chat_stream([{"role": "user", "content": "hi"}])]

    content_events = [e for e in events if "content" in e]
    assert len(content_events) == 1
    assert content_events[0]["content"] == "Kết quả."
