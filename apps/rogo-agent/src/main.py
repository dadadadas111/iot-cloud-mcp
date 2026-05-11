"""rogo-agent entry point."""

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, WebSocket

from .config.settings import settings
from .wakeword.pipeline import WakewordPipeline
from .mcp_client.client import RogoMcpClient
from .session.store import SessionStore
from .audio.gateway import AudioSessionGateway
from .providers import get_stt, get_tts, get_llm
from .audio.xiaozhi_adapter import XiaozhiGateway

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_wakeword = WakewordPipeline()
_stt = get_stt()
_tts = get_tts()
_llm = get_llm()
_mcp = RogoMcpClient()
_store = SessionStore()
_gateway = AudioSessionGateway(_wakeword, _stt, _llm, _tts, _mcp, _store)
# Xiaozhi-compatible gateway for devices still running stock xiaozhi-esp32 firmware
_xiaozhi_gateway = XiaozhiGateway(_wakeword, _stt, _llm, _tts, _mcp, _store)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _store.connect()
    await _wakeword.load()
    await _mcp.start()
    logger.info(
        "rogo-agent ready — stt=%s llm=%s tts=%s public_url=%s",
        settings.stt_provider,
        settings.llm_provider,
        settings.tts_provider,
        settings.public_url,
    )
    yield
    await _mcp.stop()
    await _store.close()
    logger.info("rogo-agent shutdown complete")


app = FastAPI(title="rogo-agent", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "active_sessions": _gateway.active_sessions,
        "mcp_ready": _mcp._ready.is_set(),
        "providers": {
            "stt": settings.stt_provider,
            "llm": settings.llm_provider,
            "tts": settings.tts_provider,
        },
    }


@app.get("/ota/")
async def ota_config() -> dict:
    """
    OTA config endpoint polled by ESP32 firmware on boot.
    firmware_protocol=xiaozhi → send xiaozhi-compatible WebSocket path
    firmware_protocol=rogo    → send rogo-native WebSocket path
    """
    base = settings.public_url.rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    path = "/xiaozhi/ws" if settings.firmware_protocol == "xiaozhi" else "/device/ws"
    return {
        "websocket_url": ws_base + path,
        "firmware_version": "1.0.0",
    }


@app.websocket("/device/ws")
async def device_ws(websocket: WebSocket) -> None:
    """Rogo-native protocol (patched firmware)."""
    await _gateway.handle(websocket)


@app.websocket("/xiaozhi/ws")
async def xiaozhi_ws(websocket: WebSocket) -> None:
    """Xiaozhi-compatible protocol (stock firmware, no reflash needed for demo)."""
    await _xiaozhi_gateway.handle(websocket)


if __name__ == "__main__":
    uvicorn.run("src.main:app", host=settings.host, port=settings.port, reload=False)
