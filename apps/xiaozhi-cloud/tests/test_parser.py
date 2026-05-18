from src.protocol.parser import parse_audio_frame


def test_parse_v1_audio_frame() -> None:
    payload = b"raw-opus-data"
    parsed = parse_audio_frame(payload, protocol_version=1)
    assert parsed.protocol_version == 1
    assert parsed.payload == payload


def test_parse_v2_audio_frame() -> None:
    payload = b"opus-bytes"
    frame = (
        (2).to_bytes(2, "big")
        + (0).to_bytes(2, "big")
        + (0).to_bytes(4, "big")
        + (123).to_bytes(4, "big")
        + len(payload).to_bytes(4, "big")
        + payload
    )

    parsed = parse_audio_frame(frame, protocol_version=2)

    assert parsed.protocol_version == 2
    assert parsed.message_type == 0
    assert parsed.timestamp == 123
    assert parsed.payload == payload


def test_parse_v3_audio_frame() -> None:
    payload = b"opus-bytes"
    frame = bytes([0, 0]) + len(payload).to_bytes(2, "big") + payload

    parsed = parse_audio_frame(frame, protocol_version=3)

    assert parsed.protocol_version == 3
    assert parsed.message_type == 0
    assert parsed.timestamp == 0
    assert parsed.payload == payload
