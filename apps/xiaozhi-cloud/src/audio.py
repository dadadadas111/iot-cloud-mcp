from __future__ import annotations

import asyncio
import logging
import math
import struct

_logger = logging.getLogger(__name__)


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


async def _try_ffmpeg(args: list[str], data: bytes) -> bytes | None:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(data)
    if proc.returncode != 0 or not stdout:
        _logger.warning("ffmpeg failed: %s", stderr.decode(errors="replace")[:500])
        return None
    return stdout


async def decode_length_prefixed_opus_to_pcm(data: bytes, sample_rate: int) -> bytes:
    result = await _try_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-f", "opus",
            "-ar", str(sample_rate),
            "-ac", "1",
            "-i", "pipe:0",
            "-ar", str(sample_rate),
            "-ac", "1",
            "-f", "s16le",
            "pipe:1",
        ],
        data,
    )
    if result is not None:
        return result

    return await _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-f", "opus",
            "-i", "pipe:0",
            "-ar", str(sample_rate),
            "-ac", "1",
            "-f", "s16le",
            "pipe:1",
        ],
        data,
    )


async def decode_opus_to_wav(data: bytes, sample_rate: int) -> bytes:
    return await _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-f", "opus",
            "-i", "pipe:0",
            "-ar", str(sample_rate),
            "-ac", "1",
            "-f", "wav",
            "pipe:1",
        ],
        data,
    )


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


def calculate_raw_energy(data: bytes) -> float:
    if not data:
        return 0.0
    return sum(b * b for b in data) / len(data)


def calculate_rms(pcm_s16le: bytes) -> float:
    if len(pcm_s16le) < 2:
        return 0.0
    samples = struct.unpack(f"<{len(pcm_s16le) // 2}h", pcm_s16le)
    mean_sq = sum(s * s for s in samples) / len(samples)
    return math.sqrt(mean_sq)


def build_audio_frame(protocol_version: int, payload: bytes, timestamp: int = 0) -> bytes:
    if protocol_version == 2:
        header = struct.pack("!HHIII", 2, 0, 0, timestamp, len(payload))
        return header + payload

    if protocol_version == 3:
        header = struct.pack("!BBH", 0, 0, len(payload))
        return header + payload

    raise ValueError(f"unsupported protocol version: {protocol_version}")
