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
from math import ceil

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

try:
    import webrtcvad
except ImportError:  # pragma: no cover - handled by timer fallback
    webrtcvad = None


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
        self._inactivity_tasks: dict[str, asyncio.Task] = {}
        self._hard_cutoff_tasks: dict[str, asyncio.Task] = {}
        self._utterance_tasks: dict[str, asyncio.Task] = {}
        self._vad_tasks: dict[str, asyncio.Task] = {}

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
                self._cancel_session_tasks(session.session_id)
                await self._store.save_history(session.device_id, session.conversation_history)
                self._sessions.pop(session.session_id, None)

    def _cancel_task(self, task: asyncio.Task | None) -> None:
        if task and not task.done():
            task.cancel()

    def _cancel_session_tasks(self, session_id: str) -> None:
        self._cancel_task(self._inactivity_tasks.pop(session_id, None))
        self._cancel_task(self._hard_cutoff_tasks.pop(session_id, None))
        self._cancel_task(self._utterance_tasks.pop(session_id, None))
        self._cancel_task(self._vad_tasks.pop(session_id, None))

    def _cancel_listening_timers(self, session_id: str) -> None:
        self._cancel_task(self._inactivity_tasks.pop(session_id, None))
        self._cancel_task(self._hard_cutoff_tasks.pop(session_id, None))
        self._cancel_task(self._vad_tasks.pop(session_id, None))

    def _enter_listening(self, session: AudioSession, reset_audio: bool = False) -> None:
        self._cancel_listening_timers(session.session_id)
        if reset_audio:
            session.reset_audio()
        if session.state != SessionState.LISTENING:
            session.transition(SessionState.LISTENING)
        self._schedule_hard_cutoff(session)
        self._schedule_vad_poll(session)

    def _schedule_inactivity_timeout(self, session: AudioSession) -> None:
        self._cancel_task(self._inactivity_tasks.pop(session.session_id, None))
        timeout_s = max(settings.silence_timeout_ms, 1) / 1000
        task = asyncio.create_task(
            self._watch_inactivity_timeout(session, timeout_s),
            name=f"xiaozhi-inactivity-{session.session_id}",
        )
        self._inactivity_tasks[session.session_id] = task

    def _schedule_hard_cutoff(self, session: AudioSession) -> None:
        self._cancel_task(self._hard_cutoff_tasks.pop(session.session_id, None))
        timeout_s = max(settings.xiaozhi_max_listening_ms, 1) / 1000
        task = asyncio.create_task(
            self._watch_hard_cutoff(session, timeout_s),
            name=f"xiaozhi-hard-cutoff-{session.session_id}",
        )
        self._hard_cutoff_tasks[session.session_id] = task

    def _schedule_vad_poll(self, session: AudioSession) -> None:
        if not settings.xiaozhi_vad_enabled or webrtcvad is None:
            return
        self._cancel_task(self._vad_tasks.pop(session.session_id, None))
        poll_s = max(settings.xiaozhi_vad_poll_ms, 1) / 1000
        task = asyncio.create_task(
            self._watch_vad_endpoint(session, poll_s),
            name=f"xiaozhi-vad-{session.session_id}",
        )
        self._vad_tasks[session.session_id] = task

    async def _watch_inactivity_timeout(self, session: AudioSession, timeout_s: float) -> None:
        try:
            await asyncio.sleep(timeout_s)
            if session.state == SessionState.LISTENING and session.audio_buffer:
                logger.info(
                    "xiaozhi inactivity timeout session=%s buffered_bytes=%d timeout_ms=%d",
                    session.session_id,
                    len(session.audio_buffer),
                    settings.silence_timeout_ms,
                )
                self._start_utterance_processing(session, reason="inactivity_timeout")
        except asyncio.CancelledError:
            pass
        finally:
            current = self._inactivity_tasks.get(session.session_id)
            if current is asyncio.current_task():
                self._inactivity_tasks.pop(session.session_id, None)

    async def _watch_hard_cutoff(self, session: AudioSession, timeout_s: float) -> None:
        try:
            await asyncio.sleep(timeout_s)
            if session.state == SessionState.LISTENING and session.audio_buffer:
                logger.info(
                    "xiaozhi hard cutoff session=%s buffered_bytes=%d timeout_ms=%d",
                    session.session_id,
                    len(session.audio_buffer),
                    settings.xiaozhi_max_listening_ms,
                )
                self._start_utterance_processing(session, reason="hard_cutoff")
        except asyncio.CancelledError:
            pass
        finally:
            current = self._hard_cutoff_tasks.get(session.session_id)
            if current is asyncio.current_task():
                self._hard_cutoff_tasks.pop(session.session_id, None)

    async def _watch_vad_endpoint(self, session: AudioSession, poll_s: float) -> None:
        last_checked_bytes = 0
        try:
            while session.state == SessionState.LISTENING:
                await asyncio.sleep(poll_s)
                if session.state != SessionState.LISTENING:
                    return

                buffered_bytes = len(session.audio_buffer)
                if buffered_bytes <= last_checked_bytes or buffered_bytes == 0:
                    continue
                last_checked_bytes = buffered_bytes

                pcm_audio = await self._get_audio_for_vad(session)
                if self._detect_vad_endpoint(pcm_audio):
                    logger.info(
                        "xiaozhi vad endpoint session=%s buffered_bytes=%d silence_ms=%d",
                        session.session_id,
                        buffered_bytes,
                        settings.xiaozhi_vad_silence_ms,
                    )
                    self._start_utterance_processing(session, reason="vad_silence")
                    return
        except asyncio.CancelledError:
            pass
        finally:
            current = self._vad_tasks.get(session.session_id)
            if current is asyncio.current_task():
                self._vad_tasks.pop(session.session_id, None)

    async def _get_audio_for_vad(self, session: AudioSession) -> bytes:
        audio = session.get_audio_bytes()
        if settings.xiaozhi_audio_format == "opus":
            return await _opus_to_pcm16(audio, settings.audio_sample_rate)
        return audio

    def _detect_vad_endpoint(self, pcm_audio: bytes) -> bool:
        if not settings.xiaozhi_vad_enabled or webrtcvad is None or not pcm_audio:
            return False

        frame_ms = settings.xiaozhi_vad_frame_ms
        sample_rate = settings.audio_sample_rate
        bytes_per_frame = int(sample_rate * frame_ms / 1000) * 2
        if bytes_per_frame <= 0 or len(pcm_audio) < bytes_per_frame:
            return False

        vad = webrtcvad.Vad(max(0, min(settings.xiaozhi_vad_aggressiveness, 3)))
        frame_count = len(pcm_audio) // bytes_per_frame
        voiced_frames: list[bool] = []

        for index in range(frame_count):
            start = index * bytes_per_frame
            frame = pcm_audio[start : start + bytes_per_frame]
            voiced_frames.append(vad.is_speech(frame, sample_rate))

        speech_frames = sum(voiced_frames)
        min_speech_frames = max(1, ceil(settings.xiaozhi_vad_min_speech_ms / frame_ms))
        if speech_frames < min_speech_frames:
            return False

        last_voiced_index = max(index for index, voiced in enumerate(voiced_frames) if voiced)
        trailing_silence_ms = (frame_count - last_voiced_index - 1) * frame_ms
        return trailing_silence_ms >= settings.xiaozhi_vad_silence_ms

    def _start_utterance_processing(self, session: AudioSession, reason: str) -> None:
        existing = self._utterance_tasks.get(session.session_id)
        if existing and not existing.done():
            logger.info(
                "xiaozhi utterance already scheduled session=%s reason=%s",
                session.session_id,
                reason,
            )
            return
        if session.state != SessionState.LISTENING:
            logger.info(
                "xiaozhi skip utterance scheduling session=%s state=%s reason=%s",
                session.session_id,
                session.state,
                reason,
            )
            return

        logger.info(
            "xiaozhi scheduling utterance processing session=%s buffered_bytes=%d reason=%s",
            session.session_id,
            len(session.audio_buffer),
            reason,
        )
        self._cancel_listening_timers(session.session_id)
        session.transition(SessionState.PROCESSING)
        task = asyncio.create_task(
            self._process_utterance(session, reason=reason),
            name=f"utterance-{session.session_id}",
        )
        self._utterance_tasks[session.session_id] = task

    async def _message_loop(self, session: AudioSession) -> None:
        ws = session.websocket
        while ws.client_state == WebSocketState.CONNECTED:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                logger.info(
                    "xiaozhi websocket disconnect session=%s state=%s code=%s reason=%s buffered_bytes=%d",
                    session.session_id,
                    session.state,
                    message.get("code"),
                    message.get("reason"),
                    len(session.audio_buffer),
                )
                break
            if message.get("bytes"):
                logger.info(
                    "xiaozhi audio chunk session=%s state=%s chunk_bytes=%d buffered_bytes_before=%d",
                    session.session_id,
                    session.state,
                    len(message["bytes"]),
                    len(session.audio_buffer),
                )
                await self._handle_audio(session, message["bytes"])
            elif message.get("text"):
                logger.info("text msg: %s state=%s", message["text"][:200], session.state)
                await self._handle_text(session, json.loads(message["text"]))

    async def _handle_audio(self, session: AudioSession, chunk: bytes) -> None:
        if session.state in (SessionState.PROCESSING, SessionState.RESPONDING):
            logger.info(
                "xiaozhi dropping audio chunk session=%s state=%s chunk_bytes=%d",
                session.session_id,
                session.state,
                len(chunk),
            )
            return
        session.append_audio(chunk)
        if session.state == SessionState.LISTENING:
            self._schedule_inactivity_timeout(session)
        logger.info(
            "xiaozhi buffered audio session=%s state=%s total_buffered_bytes=%d",
            session.session_id,
            session.state,
            len(session.audio_buffer),
        )

        if session.state == SessionState.IDLE:
            if await self._wakeword.process_chunk(chunk):
                logger.info("wakeword detected session=%s", session.session_id)
                session.reset_audio()
                self._enter_listening(session)

    async def _handle_text(self, session: AudioSession, data: dict) -> None:
        msg_type = data.get("type")

        if msg_type == "listen":
            state = data.get("state")
            if state in ("start", "detect"):
                # "start" = manual mode begin; "detect" = device wakeword fired, speech follows
                if session.state == SessionState.IDLE:
                    self._enter_listening(session, reset_audio=True)
                    # Device waits for this ACK before streaming audio (server-side wakeword mode)
                    await session.websocket.send_text(json.dumps({
                        "type": "listen",
                        "state": "detect",
                        "session_id": session.session_id,
                    }))
            elif state == "stop":
                logger.info(
                    "xiaozhi listen.stop session=%s state=%s buffered_bytes=%d",
                    session.session_id,
                    session.state,
                    len(session.audio_buffer),
                )
                if session.state == SessionState.LISTENING:
                    self._start_utterance_processing(session, reason="listen_stop")

        elif msg_type == "abort":
            self._cancel_session_tasks(session.session_id)
            session.reset_audio()
            session.transition(SessionState.IDLE)

    async def _process_utterance(self, session: AudioSession, reason: str = "direct") -> None:
        if session.state != SessionState.PROCESSING:
            session.transition(SessionState.PROCESSING)
        audio = session.get_audio_bytes()
        session.reset_audio()
        logger.info(
            "xiaozhi process_utterance start session=%s audio_bytes=%d format=%s reason=%s",
            session.session_id,
            len(audio),
            settings.xiaozhi_audio_format,
            reason,
        )

        if not audio:
            logger.info("xiaozhi process_utterance empty audio session=%s", session.session_id)
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
            current = self._utterance_tasks.get(session.session_id)
            if current is asyncio.current_task():
                self._utterance_tasks.pop(session.session_id, None)
            session.transition(SessionState.IDLE)
