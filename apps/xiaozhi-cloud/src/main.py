import json
import logging
import time
from asyncio import sleep, wait_for
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from .audio import build_audio_frame, calculate_rms, contains_speech, decode_opus_frames_to_pcm, decode_opus_frames_to_wav
from .config.settings import settings
from .integrations.edge_tts_client import EdgeTtsClient
from .integrations.groq_stt import GroqSttClient
from .integrations.openai_compatible_llm import OpenAiCompatibleLlmClient
from .integrations.rogo_mcp import RogoMcpClient
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
ENERGY_CHECK_INTERVAL = 5
VAD_AGGRESSIVENESS = 2
MIN_SILENCE_TIMEOUT_MS = 1000
VAD_GRACE_PERIOD_SECONDS = 2.0
TTS_PREROLL_FRAMES = 0
TTS_STOP_DELAY_SECONDS = 0.42
MIN_SPEECH_RMS = 42.0
MIN_VOICED_FRAMES = 4
MIN_VOICED_RATIO = 0.6

_FAREWELL_KEYWORDS = frozenset({
    "bye", "goodbye", "tạm biệt", "thôi nhé", "kết thúc",
    "bái bai", "chào tạm biệt", "gặp lại sau", "dừng lại",
    "dừng", "stop", "quit", "thoát", "cảm ơn nhé",
})

def _is_farewell(transcript: str) -> bool:
    lower = transcript.lower().strip()
    return any(kw in lower for kw in _FAREWELL_KEYWORDS)


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
if settings.tts_provider == "piper":
    from .integrations.piper_tts_client import PiperTtsClient
    _tts_client = PiperTtsClient(settings.piper_model_path)
else:
    _tts_client = EdgeTtsClient(settings.tts_voice)
_mcp_client = (
    RogoMcpClient(
        mcp_url=settings.mcp_base_url,
        bearer_token=settings.mcp_bearer_token,
    )
    if settings.mcp_base_url and settings.mcp_bearer_token
    else None
)
_runtime = XiaozhiRuntime(
    _store,
    stt_client=_stt_client,
    llm_client=_llm_client,
    tts_client=_tts_client,
    mcp_client=_mcp_client,
)


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
            "mcp": _mcp_client is not None,
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

        frames_since_energy_check = 0
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

                if session.phase == SessionPhase.LISTENING:
                    frames_since_energy_check += 1
                    if frames_since_energy_check >= ENERGY_CHECK_INTERVAL:
                        frames_since_energy_check = 0
                        await _check_silence_and_maybe_process(websocket, session)
    except WebSocketDisconnect:
        logger.info("websocket disconnected")


async def _check_silence_and_maybe_process(websocket: WebSocket, session) -> None:
    if session.phase != SessionPhase.LISTENING:
        return

    if session.listen_mode == "manual":
        return

    if session.audio_analyzed_offset >= len(session.audio_frames):
        return

    if session.listening_started_at is not None and time.time() - session.listening_started_at < VAD_GRACE_PERIOD_SECONDS:
        return

    try:
        pcm = await decode_opus_frames_to_pcm(
            session.audio_frames[session.audio_analyzed_offset :],
            session.audio_sample_rate,
        )
        rms = calculate_rms(pcm)
        speech_present = contains_speech(
            pcm,
            session.audio_sample_rate,
            aggressiveness=VAD_AGGRESSIVENESS,
            min_voiced_frames=MIN_VOICED_FRAMES,
            min_voiced_ratio=MIN_VOICED_RATIO,
        )
    except Exception as exc:
        logger.warning("energy check decode failed session_id=%s: %s", session.session_id, exc)
        return

    session.audio_analyzed_offset = len(session.audio_frames)

    if speech_present and rms >= MIN_SPEECH_RMS:
        session.speech_detected = True
        session.last_speech_time = time.time()
        logger.info("speech detected session_id=%s rms=%.1f", session.session_id, rms)
        return

    if not session.speech_detected or session.last_speech_time is None:
        return

    elapsed_ms = (time.time() - session.last_speech_time) * 1000
    logger.info(
        "silence check session_id=%s rms=%.1f elapsed_ms=%.0f",
        session.session_id,
        rms,
        elapsed_ms,
    )
    if elapsed_ms >= max(settings.silence_timeout_ms, MIN_SILENCE_TIMEOUT_MS):
        logger.info(
            "silence detected session_id=%s rms=%.1f elapsed_ms=%.0f",
            session.session_id,
            rms,
            elapsed_ms,
        )
        await _runtime.transition(session, SessionPhase.PROCESSING)
        await _process_turn(websocket, session)


async def _process_turn(websocket: WebSocket, session) -> None:
    try:
        if not session.audio_frames:
            await _runtime.transition(session, SessionPhase.READY)
            return

        wav_audio = await decode_opus_frames_to_wav(session.audio_frames, session.audio_sample_rate)
        await _runtime.transition(session, SessionPhase.RESPONDING)

        # 1) STT only — fast path
        transcript = await _runtime.transcribe_audio(session, wav_audio)
        await websocket.send_text(json.dumps({"type": "stt", "text": transcript, "session_id": session.session_id}))
        await websocket.send_text(json.dumps({"type": "tts", "state": "start", "session_id": session.session_id}))
        is_farewell = _is_farewell(transcript)

        # 2) Streaming LLM + sentence-pipelined TTS
        frame_timestamp = 0
        async for event in _runtime.generate_response_stream(session):
            t = event["type"]
            if t == "tts_start":
                pass  # already sent immediately after STT
            elif t == "tool_thinking":
                await websocket.send_text(json.dumps({
                    "type": "tts",
                    "state": "sentence_start",
                    "text": event["text"],
                    "session_id": session.session_id,
                }))
            elif t == "sentence_start":
                await websocket.send_text(json.dumps({
                    "type": "tts",
                    "state": "sentence_start",
                    "text": event["text"],
                    "session_id": session.session_id,
                }))
            elif t == "audio_frame":
                await websocket.send_bytes(
                    build_audio_frame(
                        session.protocol_version,
                        event["opus"],
                        timestamp=frame_timestamp,
                    )
                )
                frame_timestamp += session.audio_frame_duration
                if event["index"] + 1 > TTS_PREROLL_FRAMES:
                    await sleep(session.audio_frame_duration / 1000)
            elif t == "tts_stop":
                await sleep(TTS_STOP_DELAY_SECONDS)
                await websocket.send_text(json.dumps({"type": "tts", "state": "stop", "session_id": session.session_id}))
            elif t == "error":
                logger.warning("turn non-fatal error session_id=%s msg=%s", session.session_id, event["message"])

        if is_farewell:
            await _runtime.transition(session, SessionPhase.CLOSED)
            await websocket.close()
        else:
            await _runtime.transition(session, SessionPhase.READY)
            session.reset_audio()
    except WebSocketDisconnect:
        logger.warning("client disconnected during turn session_id=%s", session.session_id)
        await _runtime.transition(session, SessionPhase.READY)
        session.reset_audio()
    except Exception as exc:
        logger.exception("turn processing failed session_id=%s", session.session_id)
        try:
            await websocket.send_text(
                json.dumps({"type": "tts", "state": "stop", "session_id": session.session_id, "error": str(exc)})
            )
        except Exception:
            pass
        await _runtime.transition(session, SessionPhase.READY)
        session.reset_audio()


@app.websocket("/xiaozhi/ws")
async def xiaozhi_ws_alias(websocket: WebSocket) -> None:
    await xiaozhi_v1(websocket)
