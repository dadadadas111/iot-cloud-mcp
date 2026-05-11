"""Test configuration — set required env vars before any settings are imported."""

import os
import pytest

# Set required env vars before pydantic-settings loads
os.environ.setdefault("ROGO_MCP_URL", "https://test.mcp.example.com")
os.environ.setdefault("ROGO_EMAIL", "test@example.com")
os.environ.setdefault("ROGO_PASSWORD", "test-password")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("PUBLIC_URL", "https://test.rogo.example.com")
