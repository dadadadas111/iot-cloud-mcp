"""Smoke test — FastAPI app starts and core endpoints respond correctly."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch


@pytest.fixture
def client():
    with (
        patch("src.main._store.connect", new=AsyncMock()),
        patch("src.main._store.close", new=AsyncMock()),
        patch("src.main._wakeword.load", new=AsyncMock()),
        patch("src.main._mcp.start", new=AsyncMock()),
        patch("src.main._mcp.stop", new=AsyncMock()),
        patch("src.main._mcp._ready") as mock_ready,
    ):
        mock_ready.is_set.return_value = False
        from src.main import app
        with TestClient(app) as c:
            yield c


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "active_sessions" in data
    assert "mcp_ready" in data
    assert "providers" in data


def test_ota_returns_wss_url(client):
    resp = client.get("/ota/")
    assert resp.status_code == 200
    data = resp.json()
    assert "websocket_url" in data
    url = data["websocket_url"]
    assert url.startswith("wss://") or url.startswith("ws://")
    assert "/ws" in url


def test_ota_url_matches_firmware_protocol(client):
    resp = client.get("/ota/")
    data = resp.json()
    from src.config.settings import settings
    expected_path = "/xiaozhi/ws" if settings.firmware_protocol == "xiaozhi" else "/device/ws"
    assert data["websocket_url"].endswith(expected_path)
