"""
XiaozhiGateway — WebSocket gateway that speaks the xiaozhi firmware protocol.

Use this during Week 2 when devices still run stock xiaozhi-esp32 firmware
but connect to our server. Once firmware is patched to use rogo-agent protocol,
switch back to AudioSessionGateway.

Xiaozhi protocol (inferred from xinnan-tech/xiaozhi-esp32-server source):
  device → server (text): {"type":"hello","version":3,"transport":"websocket",...}
  server → device (text): {"type":"hello","session_id":"...","version":3,...}
  device → server (text): {"type":"listen","state":"start","mode":"auto"}
  device → server (binary): Opus-encoded audio frames (default) or raw PCM16
  device → server (text): {"type":"listen","state":"stop"}
  server → device (text): {"type":"tts","state":"start","text":"..."}
  server → device (binary): Opus TTS audio
  server → device (text): {"type":"tts","state":"stop"}
  device → server (text): {"type":"abort","session_id":"..."}

Audio format note:
  Stock xiaozhi-esp32 firmware sends Opus-encoded frames by default.
  Set XIAOZHI_AUDIO_FORMAT=pcm if using firmware that sends raw PCM16.
  Opus decoding uses ffmpeg subprocess (already in the Docker image).
"""

import asyncio
import json
import logging
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from ..audio.session import AudioSession, SessionState
from ..config.settings import settings
from ..wakeword.pipeline import WakewordPipeline
from ..stt.interface import ISttService
from ..llm.interface import ILlmService
from ..tts.interface import ITtsService
from ..mcp_client.client import RogoMcpClient
from ..session.store import SessionStore

logger = logging.getLogger(__name__)
XIAOZHI_TTS_CHUNK_SIZE = 4096


async def _opus_to_pcm16(data: bytes, sample_rate: int) -> bytes:
    """Decode an Opus stream (OGG container or raw) to PCM16 via ffmpeg."""
    # Try OGG/Opus container first (what most Xiaozhi firmware sends)
    for fmt in ("ogg", "opus"):
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-f", fmt, "-i", "pipe:0",
            "-f", "s16le", "-ar", str(sample_rate), "-ac", "1",
            "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate(data)
        if proc.returncode == 0 and stdout:
            return stdout
    logger.warning("opus decode failed — falling back to raw bytes")
    return data


async def _tts_to_opus(data: bytes, sample_rate: int) -> bytes:
    """Transcode provider TTS audio to Opus for Xiaozhi firmware playback."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y",
        "-i", "pipe:0",
        "-c:a", "libopus",
        "-ar", str(sample_rate),
        "-ac", "1",
        "-f", "ogg",
        "pipe:1",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate(data)
    if proc.returncode != 0 or not stdout:
        raise RuntimeError("tts opus transcode failed")
    return stdout


class XiaozhiGateway:
    """
    Drop-in replacement for AudioSessionGateway when devices run stock xiaozhi firmware.
    Translates between xiaozhi protocol and our internal service layer.
    """

    def __init__(
        self,
        wakeword: WakewordPipeline,
        stt: ISttService,
        llm: ILlmService,
        tts: ITtsService,
        mcp: RogoMcpClient,
        store: SessionStore,
    ) -> None:
        self._wakeword = wakeword
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._mcp = mcp
        self._store = store
        self._sessions: dict[str, AudioSession] = {}

    @property
    def active_sessions(self) -> int:
        return len(self._sessions)

    async def handle(self, websocket: WebSocket) -> None:
        await websocket.accept()
        session: AudioSession | None = None

        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            data = json.loads(raw)

            if data.get("type") != "hello":
                await websocket.close(code=4000, reason="expected hello")
                return

            device_id = data.get("device_id") or data.get("client_id") or str(uuid.uuid4())
            history = await self._store.load_history(device_id)
            session_id = str(uuid.uuid4())
            session = AudioSession(
                session_id=session_id,
                device_id=device_id,
                websocket=websocket,
                conversation_history=history,
            )
            self._sessions[session_id] = session
            logger.info("xiaozhi device=%s connected session=%s", device_id, session_id)

            await websocket.send_text(json.dumps({
                "type": "hello",
                "version": 3,
                "transport": "websocket",
                "session_id": session_id,
                "status": "ok",
            }))

            await self._message_loop(session)

        except asyncio.TimeoutError:
            logger.warning("xiaozhi device did not send hello in time")
        except WebSocketDisconnect:
            logger.info("xiaozhi device disconnected session=%s",
                        session.session_id if session else "unknown")
        except Exception:
            logger.exception("xiaozhi session error session=%s",
                             session.session_id if session else "unknown")
        finally:
            if session:
                await self._store.save_history(session.device_id, session.conversation_history)
                self._sessions.pop(session.session_id, None)

    async def _message_loop(self, session: AudioSession) -> None:
        ws = session.websocket
        while ws.client_state == WebSocketState.CONNECTED:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("bytes"):
                logger.debug("audio chunk %d bytes state=%s", len(message["bytes"]), session.state)
                await self._handle_audio(session, message["bytes"])
            elif message.get("text"):
                logger.info("text msg: %s state=%s", message["text"][:200], session.state)
                await self._handle_text(session, json.loads(message["text"]))

    async def _handle_audio(self, session: AudioSession, chunk: bytes) -> None:
        if session.state in (SessionState.PROCESSING, SessionState.RESPONDING):
            return
        session.append_audio(chunk)

        if session.state == SessionState.IDLE:
            if await self._wakeword.process_chunk(chunk):
                logger.info("wakeword detected session=%s", session.session_id)
                session.reset_audio()
                session.transition(SessionState.LISTENING)

    async def _handle_text(self, session: AudioSession, data: dict) -> None:
        msg_type = data.get("type")

        if msg_type == "listen":
            state = data.get("state")
            if state in ("start", "detect"):
                # "start" = manual mode begin; "detect" = device wakeword fired, speech follows
                if session.state == SessionState.IDLE:
                    session.transition(SessionState.LISTENING)
                    session.reset_audio()
                    # Device waits for this ACK before streaming audio (server-side wakeword mode)
                    await session.websocket.send_text(json.dumps({
                        "type": "listen",
                        "state": "detect",
                        "session_id": session.session_id,
                    }))
            elif state == "stop":
                if session.state == SessionState.LISTENING:
                    asyncio.create_task(
                        self._process_utterance(session),
                        name=f"utterance-{session.session_id}",
                    )

        elif msg_type == "abort":
            session.reset_audio()
            session.transition(SessionState.IDLE)

    async def _process_utterance(self, session: AudioSession) -> None:
        session.transition(SessionState.PROCESSING)
        audio = session.get_audio_bytes()
        session.reset_audio()

        if not audio:
            session.transition(SessionState.IDLE)
            return

        try:
            if settings.xiaozhi_audio_format == "opus":
                audio = await _opus_to_pcm16(audio, settings.audio_sample_rate)

            transcript = await self._stt.transcribe(audio, sample_rate=settings.audio_sample_rate)
            logger.info("transcript='%s' session=%s", transcript, session.session_id)
            if not transcript.strip():
                session.transition(SessionState.IDLE)
                return

            # Send STT result back (xiaozhi format)
            await session.websocket.send_text(json.dumps({
                "type": "stt",
                "text": transcript,
                "session_id": session.session_id,
            }))

            session.add_turn("user", transcript)
            response_text = await self._llm.chat(
                messages=session.conversation_history,
                tools=await self._mcp.list_tools(),
                tool_caller=self._mcp.call_tool,
            )
            session.add_turn("assistant", response_text)

            session.transition(SessionState.RESPONDING)
            await session.websocket.send_text(json.dumps({
                "type": "tts",
                "state": "start",
                "text": response_text,
                "session_id": session.session_id,
            }))

            tts_audio = bytearray()
            async for audio_chunk in self._tts.synthesize(response_text):
                if session.websocket.client_state != WebSocketState.CONNECTED:
                    break

                tts_audio.extend(audio_chunk)

            if session.websocket.client_state == WebSocketState.CONNECTED and tts_audio:
                opus_audio = await _tts_to_opus(bytes(tts_audio), settings.audio_sample_rate)
                for i in range(0, len(opus_audio), XIAOZHI_TTS_CHUNK_SIZE):
                    await session.websocket.send_bytes(opus_audio[i : i + XIAOZHI_TTS_CHUNK_SIZE])

            await session.websocket.send_text(json.dumps({
                "type": "tts",
                "state": "stop",
                "session_id": session.session_id,
            }))

            # Return device to listening loop
            await session.websocket.send_text(json.dumps({
                "type": "listen",
                "state": "start",
                "mode": "auto",
                "session_id": session.session_id,
            }))

        except Exception:
            logger.exception("pipeline error session=%s", session.session_id)
        finally:
            session.transition(SessionState.IDLE)
