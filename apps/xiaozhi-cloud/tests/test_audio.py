from src.audio import build_audio_frame
from src.protocol.parser import parse_audio_frame


def test_build_v2_audio_frame_round_trip() -> None:
    payload = b"hello"
    frame = build_audio_frame(2, payload, timestamp=55)
    parsed = parse_audio_frame(frame)
    assert parsed.protocol_version == 2
    assert parsed.timestamp == 55
    assert parsed.payload == payload


def test_build_v3_audio_frame_round_trip() -> None:
    payload = b"hello"
    frame = build_audio_frame(3, payload)
    parsed = parse_audio_frame(frame)
    assert parsed.protocol_version == 3
    assert parsed.payload == payload
