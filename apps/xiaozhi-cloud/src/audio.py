from __future__ import annotations

import asyncio
import ctypes
import io
import math
import struct
import wave
from ctypes.util import find_library

import webrtcvad


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
