from __future__ import annotations

import asyncio
import math
import struct


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


async def decode_opus_to_pcm(data: bytes, sample_rate: int) -> bytes:
    for fmt in ("ogg", "opus"):
        try:
            return await _run_ffmpeg(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    fmt,
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
        except RuntimeError:
            continue
    raise RuntimeError("failed to decode opus audio")


async def decode_opus_to_wav(data: bytes, sample_rate: int) -> bytes:
    for fmt in ("ogg", "opus"):
        try:
            return await _run_ffmpeg(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    fmt,
                    "-i",
                    "pipe:0",
                    "-ar",
                    str(sample_rate),
                    "-ac",
                    "1",
                    "-f",
                    "wav",
                    "pipe:1",
                ],
                data,
            )
        except RuntimeError:
            continue
    raise RuntimeError("failed to decode opus audio")


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


def build_audio_frame(protocol_version: int, payload: bytes, timestamp: int = 0) -> bytes:
    if protocol_version == 2:
        header = struct.pack("!HHIII", 2, 0, 0, timestamp, len(payload))
        return header + payload

    if protocol_version == 3:
        header = struct.pack("!BBH", 0, 0, len(payload))
        return header + payload

    raise ValueError(f"unsupported protocol version: {protocol_version}")
