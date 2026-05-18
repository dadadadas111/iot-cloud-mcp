import json
import logging
from asyncio import wait_for
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from .audio import build_audio_frame, decode_opus_to_wav, transcode_to_ogg_opus
from .config.settings import settings
from .integrations.edge_tts_client import EdgeTtsClient
from .integrations.groq_stt import GroqSttClient
from .integrations.openai_compatible_llm import OpenAiCompatibleLlmClient
from .protocol.models import HelloMessage, OtaResponse, parse_client_message
from .protocol.parser import parse_audio_frame
from .services.runtime import XiaozhiRuntime
from .session.models import SessionPhase
from .session.store import SessionStore

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

REQUIRED_WS_HEADERS = ("protocol-version", "device-id", "client-id")

_redis = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
_store = SessionStore(_redis, settings.session_ttl_seconds)
_stt_client = GroqSttClient(settings.groq_api_key, settings.groq_stt_model) if settings.groq_api_key else None
_llm_client = (
    OpenAiCompatibleLlmClient(
        settings.openai_compatible_base_url,
        settings.openai_compatible_api_key,
        settings.openai_compatible_model,
    )
    if settings.openai_compatible_base_url and settings.openai_compatible_api_key and settings.openai_compatible_model
    else None
)
_tts_client = EdgeTtsClient(settings.tts_voice)
_runtime = XiaozhiRuntime(_store, stt_client=_stt_client, llm_client=_llm_client, tts_client=_tts_client)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await _redis.aclose()


app = FastAPI(title="xiaozhi-cloud", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "xiaozhi-cloud",
        "redis": settings.redis_url,
        "mcp_base_url": settings.mcp_base_url,
        "stt_model": settings.groq_stt_model,
        "llm_model": settings.openai_compatible_model,
        "providers_ready": {
            "stt": _stt_client is not None,
            "llm": _llm_client is not None,
            "tts": _tts_client is not None,
        },
    }


@app.api_route("/ota/", methods=["GET", "POST"])
async def ota(request: Request) -> dict:
    body = await request.body()
    logger.info(
        "ota request device_id=%s client_id=%s activation_version=%s body=%s",
        request.headers.get("device-id"),
        request.headers.get("client-id"),
        request.headers.get("activation-version"),
        body.decode(errors="replace"),
    )
    response = OtaResponse(
        websocket={"url": settings.public_ws_url},
        firmware={"version": "2.2.1"},
    )
    return response.model_dump()


@app.websocket("/xiaozhi/v1/")
async def xiaozhi_v1(websocket: WebSocket) -> None:
    missing_headers = [name for name in REQUIRED_WS_HEADERS if not websocket.headers.get(name)]
    if missing_headers:
        await websocket.close(code=4400, reason=f"missing headers: {', '.join(missing_headers)}")
        return

    await websocket.accept()
    logger.info(
        "websocket connected authorization=%s protocol_version=%s device_id=%s client_id=%s",
        "present" if websocket.headers.get("authorization") else "missing",
        websocket.headers.get("protocol-version"),
        websocket.headers.get("device-id"),
        websocket.headers.get("client-id"),
    )

    try:
        raw = await wait_for(websocket.receive_text(), timeout=10.0)
        hello = HelloMessage.model_validate(json.loads(raw))
        session = await _runtime.bootstrap_session(websocket, hello)
        server_hello = await _runtime.server_hello(session)
        await websocket.send_text(server_hello.model_dump_json())

        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("text"):
                client_message = parse_client_message(json.loads(message["text"]))
                if isinstance(client_message, HelloMessage):
                    logger.info("duplicate hello ignored session_id=%s", session.session_id)
                    continue
                should_process = await _runtime.handle_control_message(session, client_message)
                logger.info("text frame session_id=%s payload=%s", session.session_id, message["text"][:500])
                if should_process:
                    await _process_turn(websocket, session)
            elif message.get("bytes"):
                try:
                    frame = parse_audio_frame(message["bytes"], session.protocol_version)
                except ValueError:
                    logger.warning(
                        "bad audio frame session_id=%s version=%s bytes=%s",
                        session.session_id,
                        session.protocol_version,
                        len(message["bytes"]),
                    )
                    continue
                await _runtime.handle_audio_frame(session, frame.payload)
                logger.info(
                    "audio frame session_id=%s protocol_version=%s message_type=%s timestamp=%s payload_bytes=%s",
                    session.session_id,
                    frame.protocol_version,
                    frame.message_type,
                    frame.timestamp,
                    len(frame.payload),
                )
    except WebSocketDisconnect:
        logger.info("websocket disconnected")


async def _process_turn(websocket: WebSocket, session) -> None:
    try:
        raw_audio = session.get_audio_bytes()
        if not raw_audio:
            await _runtime.transition(session, SessionPhase.READY)
            return

        wav_audio = await decode_opus_to_wav(raw_audio, settings.audio_sample_rate)
        turn = await _runtime.process_turn(session, wav_audio)
        await websocket.send_text(json.dumps({"type": "stt", "text": turn.transcript, "session_id": session.session_id}))
        await _runtime.transition(session, SessionPhase.RESPONDING)
        await websocket.send_text(
            json.dumps(
                {
                    "type": "tts",
                    "state": "start",
                    "text": turn.response_text,
                    "session_id": session.session_id,
                }
            )
        )

        opus_audio = await transcode_to_ogg_opus(turn.tts_audio, settings.audio_sample_rate)
        for offset in range(0, len(opus_audio), 4096):
            chunk = opus_audio[offset : offset + 4096]
            await websocket.send_bytes(build_audio_frame(session.protocol_version, chunk))

        await websocket.send_text(json.dumps({"type": "tts", "state": "stop", "session_id": session.session_id}))
        await _runtime.transition(session, SessionPhase.READY)
        session.reset_audio()
    except Exception as exc:
        logger.exception("turn processing failed session_id=%s", session.session_id)
        await websocket.send_text(
            json.dumps(
                {
                    "type": "tts",
                    "state": "stop",
                    "session_id": session.session_id,
                    "error": str(exc),
                }
            )
        )
        await _runtime.transition(session, SessionPhase.READY)
        session.reset_audio()


@app.websocket("/xiaozhi/ws")
async def xiaozhi_ws_alias(websocket: WebSocket) -> None:
    await xiaozhi_v1(websocket)
