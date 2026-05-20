from __future__ import annotations

import asyncio
import ctypes
import io
import logging
import math
import struct
import wave
from ctypes.util import find_library
from typing import AsyncIterator

import webrtcvad

logger = logging.getLogger(__name__)


_opus_lib = None


def _load_opus_lib():
    global _opus_lib
    if _opus_lib is not None:
        return _opus_lib

    lib_name = find_library("opus")
    if lib_name is None:
        raise RuntimeError("libopus not found")

    lib = ctypes.CDLL(lib_name)
    lib.opus_decoder_create.argtypes = [
        ctypes.c_int32,
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_int),
    ]
    lib.opus_decoder_create.restype = ctypes.c_void_p
    lib.opus_decode.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_ubyte),
        ctypes.c_int32,
        ctypes.POINTER(ctypes.c_int16),
        ctypes.c_int,
        ctypes.c_int,
    ]
    lib.opus_decode.restype = ctypes.c_int
    lib.opus_encoder_create.argtypes = [
        ctypes.c_int32,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_int),
    ]
    lib.opus_encoder_create.restype = ctypes.c_void_p
    lib.opus_encode.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_int16),
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_ubyte),
        ctypes.c_int32,
    ]
    lib.opus_encode.restype = ctypes.c_int
    lib.opus_encoder_destroy.argtypes = [ctypes.c_void_p]
    lib.opus_encoder_destroy.restype = None
    lib.opus_decoder_destroy.argtypes = [ctypes.c_void_p]
    lib.opus_decoder_destroy.restype = None
    lib.opus_strerror.argtypes = [ctypes.c_int]
    lib.opus_strerror.restype = ctypes.c_char_p
    _opus_lib = lib
    return lib


def _decode_opus_frames(frames: list[bytes], sample_rate: int, channels: int = 1) -> bytes:
    if not frames:
        return b""

    lib = _load_opus_lib()
    error = ctypes.c_int()
    decoder = lib.opus_decoder_create(sample_rate, channels, ctypes.byref(error))
    if not decoder or error.value != 0:
        raise RuntimeError(f"opus decoder create failed: {error.value}")

    max_samples_per_channel = sample_rate * 120 // 1000
    pcm_chunks: list[bytes] = []

    try:
        for frame in frames:
            packet = (ctypes.c_ubyte * len(frame)).from_buffer_copy(frame)
            pcm_buffer = (ctypes.c_int16 * (max_samples_per_channel * channels))()
            decoded_samples = lib.opus_decode(
                decoder,
                packet,
                len(frame),
                pcm_buffer,
                max_samples_per_channel,
                0,
            )
            if decoded_samples < 0:
                message = lib.opus_strerror(decoded_samples).decode("utf-8", errors="replace")
                raise RuntimeError(f"opus decode failed: {message}")
            pcm_chunks.append(ctypes.string_at(pcm_buffer, decoded_samples * channels * 2))
    finally:
        lib.opus_decoder_destroy(decoder)

    return b"".join(pcm_chunks)


async def decode_opus_frames_to_pcm(frames: list[bytes], sample_rate: int, channels: int = 1) -> bytes:
    return await asyncio.to_thread(_decode_opus_frames, frames, sample_rate, channels)


async def decode_opus_frames_to_wav(frames: list[bytes], sample_rate: int, channels: int = 1) -> bytes:
    pcm = await decode_opus_frames_to_pcm(frames, sample_rate, channels)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm)
    return output.getvalue()


async def decode_audio_to_pcm(data: bytes, sample_rate: int) -> bytes:
    return await _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            "pipe:0",
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            "-f",
            "s16le",
            "pipe:1",
        ],
        data,
    )


def _encode_pcm_to_opus_frames(pcm_s16le: bytes, sample_rate: int, frame_ms: int, channels: int = 1) -> list[bytes]:
    if not pcm_s16le:
        return []

    lib = _load_opus_lib()
    error = ctypes.c_int()
    application = 2049
    encoder = lib.opus_encoder_create(sample_rate, channels, application, ctypes.byref(error))
    if not encoder or error.value != 0:
        raise RuntimeError(f"opus encoder create failed: {error.value}")

    samples_per_channel = sample_rate * frame_ms // 1000
    frame_bytes = samples_per_channel * channels * 2
    max_packet_size = 4000
    packets: list[bytes] = []

    try:
        for offset in range(0, len(pcm_s16le), frame_bytes):
            frame = pcm_s16le[offset : offset + frame_bytes]
            if len(frame) < frame_bytes:
                frame = frame + b"\x00" * (frame_bytes - len(frame))
            pcm_buffer = (ctypes.c_int16 * (samples_per_channel * channels)).from_buffer_copy(frame)
            output_buffer = (ctypes.c_ubyte * max_packet_size)()
            packet_size = lib.opus_encode(
                encoder,
                pcm_buffer,
                samples_per_channel,
                output_buffer,
                max_packet_size,
            )
            if packet_size < 0:
                message = lib.opus_strerror(packet_size).decode("utf-8", errors="replace")
                raise RuntimeError(f"opus encode failed: {message}")
            packets.append(bytes(output_buffer[:packet_size]))
    finally:
        lib.opus_encoder_destroy(encoder)

    return packets


async def transcode_to_opus_frames(data: bytes, sample_rate: int, frame_ms: int) -> list[bytes]:
    pcm = await decode_audio_to_pcm(data, sample_rate)
    return await asyncio.to_thread(_encode_pcm_to_opus_frames, pcm, sample_rate, frame_ms)


class OpusStreamEncoder:
    """Stateful opus encoder for the lifetime of one sentence's TTS.

    Holds an open encoder handle and an internal residual buffer so callers
    can feed arbitrary PCM chunk sizes and receive exact-frame-size opus packets.
    """

    def __init__(self, sample_rate: int, frame_ms: int, channels: int = 1) -> None:
        self._sample_rate = sample_rate
        self._frame_ms = frame_ms
        self._channels = channels
        self._samples_per_frame = sample_rate * frame_ms // 1000
        self._frame_bytes = self._samples_per_frame * channels * 2
        self._residual = bytearray()

        lib = _load_opus_lib()
        error = ctypes.c_int()
        application = 2049  # OPUS_APPLICATION_AUDIO
        encoder = lib.opus_encoder_create(sample_rate, channels, application, ctypes.byref(error))
        if not encoder or error.value != 0:
            raise RuntimeError(f"opus encoder create failed: {error.value}")
        self._lib = lib
        self._encoder = encoder
        self._max_packet = 4000

    def encode_pcm_chunk(self, pcm_s16le: bytes) -> list[bytes]:
        """Append PCM, return zero or more full opus packets. Holds residual."""
        self._residual.extend(pcm_s16le)
        packets: list[bytes] = []
        while len(self._residual) >= self._frame_bytes:
            frame = bytes(self._residual[: self._frame_bytes])
            del self._residual[: self._frame_bytes]
            packets.append(self._encode_frame(frame))
        return packets

    def flush(self) -> list[bytes]:
        """Zero-pad and emit final packet if residual exists; idempotent."""
        if not self._residual:
            return []
        frame = bytes(self._residual) + b"\x00" * (self._frame_bytes - len(self._residual))
        self._residual.clear()
        return [self._encode_frame(frame)]

    def _encode_frame(self, frame: bytes) -> bytes:
        pcm_buffer = (ctypes.c_int16 * (self._samples_per_frame * self._channels)).from_buffer_copy(frame)
        output_buffer = (ctypes.c_ubyte * self._max_packet)()
        packet_size = self._lib.opus_encode(
            self._encoder,
            pcm_buffer,
            self._samples_per_frame,
            output_buffer,
            self._max_packet,
        )
        if packet_size < 0:
            message = self._lib.opus_strerror(packet_size).decode("utf-8", errors="replace")
            raise RuntimeError(f"opus encode failed: {message}")
        return bytes(output_buffer[:packet_size])

    def close(self) -> None:
        if self._encoder:
            self._lib.opus_encoder_destroy(self._encoder)
            self._encoder = None  # type: ignore[assignment]

    def __enter__(self) -> "OpusStreamEncoder":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


async def stream_mp3_to_opus_frames(
    mp3_iter: AsyncIterator[bytes],
    sample_rate: int,
    frame_ms: int,
    channels: int = 1,
) -> AsyncIterator[bytes]:
    """Pipe mp3 chunks through ffmpeg (stdin) to PCM (stdout), encode to opus
    frames, yield each opus frame as it is produced."""
    FFMPEG_TIMEOUT = 10.0
    READ_CHUNK = 8192
    _SENTINEL = object()

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", "pipe:0",
        "-ar", str(sample_rate), "-ac", str(channels), "-f", "s16le", "pipe:1",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Queue carries opus frames (bytes) or _SENTINEL when producer is done.
    queue: asyncio.Queue[object] = asyncio.Queue()

    async def _produce() -> None:
        """Feed mp3 to stdin and push opus frames into the queue."""
        assert proc.stdin is not None
        assert proc.stdout is not None
        feed_done = asyncio.Event()

        async def _feed() -> None:
            try:
                async for chunk in mp3_iter:
                    proc.stdin.write(chunk)
                    await proc.stdin.drain()
            finally:
                proc.stdin.close()
                feed_done.set()

        feed_task = asyncio.create_task(_feed())
        try:
            with OpusStreamEncoder(sample_rate, frame_ms, channels) as encoder:
                while True:
                    pcm_chunk = await proc.stdout.read(READ_CHUNK)
                    if not pcm_chunk:
                        break
                    for pkt in encoder.encode_pcm_chunk(pcm_chunk):
                        await queue.put(pkt)
                for pkt in encoder.flush():
                    await queue.put(pkt)
        except BaseException:
            feed_task.cancel()
            await asyncio.gather(feed_task, return_exceptions=True)
            raise
        else:
            # Normal finish: wait for the feed task to close stdin.
            await asyncio.gather(feed_task, return_exceptions=True)
        finally:
            await queue.put(_SENTINEL)

    producer = asyncio.create_task(_produce())

    try:
        deadline = asyncio.get_event_loop().time() + FFMPEG_TIMEOUT
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                producer.cancel()
                proc.kill()
                await proc.wait()
                raise RuntimeError("stream_mp3_to_opus_frames timed out")
            item = await asyncio.wait_for(queue.get(), timeout=remaining)
            if item is _SENTINEL:
                break
            yield item  # type: ignore[misc]
    except Exception:
        producer.cancel()
        proc.kill()
        await proc.wait()
        raise

    await producer
    await proc.wait()
    if proc.returncode != 0:
        assert proc.stderr is not None
        stderr_bytes = await proc.stderr.read()
        stderr_text = stderr_bytes.decode("utf-8", errors="replace")
        logger.warning("ffmpeg stream exited %d: %s", proc.returncode, stderr_text[:400])
        raise RuntimeError(f"ffmpeg stream failed (rc={proc.returncode})")


async def stream_pcm_to_opus_frames(
    pcm_iter: AsyncIterator[bytes],
    sample_rate: int,
    frame_ms: int,
    channels: int = 1,
) -> AsyncIterator[bytes]:
    """Convert streaming s16le PCM chunks to Opus frames.

    Faster than stream_mp3_to_opus_frames — no ffmpeg subprocess needed
    when the TTS provider already emits raw PCM (e.g. Piper).
    """
    with OpusStreamEncoder(sample_rate=sample_rate, frame_ms=frame_ms, channels=channels) as encoder:
        async for chunk in pcm_iter:
            for frame in encoder.encode_pcm_chunk(chunk):
                yield frame
        for frame in encoder.flush():
            yield frame


async def _run_ffmpeg(args: list[str], data: bytes) -> bytes:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate(data)
    if proc.returncode != 0 or not stdout:
        raise RuntimeError("ffmpeg process failed")
    return stdout


async def transcode_to_ogg_opus(data: bytes, sample_rate: int) -> bytes:
    return await _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            "pipe:0",
            "-c:a",
            "libopus",
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            "-f",
            "ogg",
            "pipe:1",
        ],
        data,
    )


def calculate_rms(pcm_s16le: bytes) -> float:
    if len(pcm_s16le) < 2:
        return 0.0
    samples = struct.unpack(f"<{len(pcm_s16le) // 2}h", pcm_s16le)
    mean_sq = sum(s * s for s in samples) / len(samples)
    return math.sqrt(mean_sq)


def contains_speech(
    pcm_s16le: bytes,
    sample_rate: int,
    frame_ms: int = 30,
    aggressiveness: int = 2,
    min_voiced_frames: int = 2,
    min_voiced_ratio: float = 0.34,
) -> bool:
    if sample_rate not in (8000, 16000, 32000, 48000):
        raise ValueError(f"unsupported VAD sample rate: {sample_rate}")

    bytes_per_frame = sample_rate * frame_ms // 1000 * 2
    if len(pcm_s16le) < bytes_per_frame:
        return False

    vad = webrtcvad.Vad(aggressiveness)
    voiced_frames = 0
    total_frames = 0

    for offset in range(0, len(pcm_s16le) - bytes_per_frame + 1, bytes_per_frame):
        frame = pcm_s16le[offset : offset + bytes_per_frame]
        total_frames += 1
        if vad.is_speech(frame, sample_rate):
            voiced_frames += 1

    if total_frames == 0:
        return False

    return voiced_frames >= min_voiced_frames or (voiced_frames / total_frames) >= min_voiced_ratio


def build_audio_frame(protocol_version: int, payload: bytes, timestamp: int = 0) -> bytes:
    if protocol_version == 1:
        return payload

    if protocol_version == 2:
        header = struct.pack("!HHIII", 2, 0, 0, timestamp, len(payload))
        return header + payload

    if protocol_version == 3:
        header = struct.pack("!BBH", 0, 0, len(payload))
        return header + payload

    raise ValueError(f"unsupported protocol version: {protocol_version}")
