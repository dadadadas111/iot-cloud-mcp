from fastapi.testclient import TestClient

from src.main import app


def test_ota_returns_nested_websocket_shape() -> None:
    client = TestClient(app)
    response = client.get("/ota/")

    assert response.status_code == 200
    data = response.json()
    assert data["websocket"]["url"]
    assert data["firmware"]["version"] == "2.2.1"
