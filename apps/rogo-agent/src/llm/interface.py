"""LLM service interface. Handles tool-calling loop internally."""

from abc import ABC, abstractmethod
from collections.abc import Callable, Awaitable
from typing import Any


class ILlmService(ABC):
    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_caller: Callable[[str, dict], Awaitable[Any]],
    ) -> str:
        """
        Run a chat turn with optional tool calling.

        tool_caller: async fn(tool_name, args) → result
        Returns: final text response after any tool calls are resolved.
        """
        ...
