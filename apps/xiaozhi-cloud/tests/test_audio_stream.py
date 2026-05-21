from __future__ import annotations

import asyncio
import os
import shutil
import struct

import pytest

from src.audio import OpusStreamEncoder, stream_mp3_to_opus_frames

SAMPLE_RATE = 16000
FRAME_MS = 60


def _make_pcm(num_frames: float) -> bytes:
    """Generate silent PCM s16le at SAMPLE_RATE for the given number of frames."""
    samples_per_frame = SAMPLE_RATE * FRAME_MS // 1000
    total_samples = int(samples_per_frame * num_frames)
    return struct.pack(f"<{total_samples}h", *([0] * total_samples))


def test_opus_stream_encoder_emits_full_frames() -> None:
    """Feed exactly 2.5 frames of PCM; expect 2 packets from encode, 1 from flush."""
    with OpusStreamEncoder(SAMPLE_RATE, FRAME_MS) as encoder:
        pcm = _make_pcm(2.5)
        packets = encoder.encode_pcm_chunk(pcm)
        assert len(packets) == 2
        flushed = encoder.flush()
        assert len(flushed) == 1


def test_opus_stream_encoder_flush_is_idempotent() -> None:
    with OpusStreamEncoder(SAMPLE_RATE, FRAME_MS) as encoder:
        pcm = _make_pcm(1.0)
        encoder.encode_pcm_chunk(pcm)
        first = encoder.flush()
        second = encoder.flush()
    assert len(first) == 0  # no residual after exact frame
    assert len(second) == 0


def test_opus_stream_encoder_partial_then_flush() -> None:
    """Feed half a frame; encode_pcm_chunk yields nothing, flush yields one."""
    with OpusStreamEncoder(SAMPLE_RATE, FRAME_MS) as encoder:
        pcm = _make_pcm(0.5)
        packets = encoder.encode_pcm_chunk(pcm)
        assert packets == []
        flushed = encoder.flush()
        assert len(flushed) == 1


def test_opus_stream_encoder_empty_input() -> None:
    with OpusStreamEncoder(SAMPLE_RATE, FRAME_MS) as encoder:
        assert encoder.encode_pcm_chunk(b"") == []
        assert encoder.flush() == []


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
@pytest.mark.asyncio
async def test_stream_mp3_to_opus_frames_smoke() -> None:
    """Integration smoke: feed a real mp3 fixture and assert at least one opus frame."""
    fixture = os.path.join(os.path.dirname(__file__), "fixtures", "short.mp3")
    assert os.path.exists(fixture), "fixture short.mp3 missing"

    async def _mp3_iter():
        with open(fixture, "rb") as f:
            while True:
                chunk = f.read(4096)
                if not chunk:
                    break
                yield chunk

    frames = [pkt async for pkt in stream_mp3_to_opus_frames(_mp3_iter(), SAMPLE_RATE, FRAME_MS)]
    assert len(frames) >= 1
    for frame in frames:
        assert isinstance(frame, bytes)
        assert len(frame) > 0
