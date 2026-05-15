from __future__ import annotations

import struct
from dataclasses import dataclass


@dataclass
class ParsedAudioFrame:
    protocol_version: int
    message_type: int
    timestamp: int
    payload: bytes


def parse_audio_frame(payload: bytes) -> ParsedAudioFrame:
    if len(payload) >= 16:
        version, message_type, reserved, timestamp, payload_size = struct.unpack("!HHIII", payload[:16])
        if version == 2 and len(payload) >= 16 + payload_size:
            audio_payload = payload[16 : 16 + payload_size]
            return ParsedAudioFrame(
                protocol_version=version,
                message_type=message_type,
                timestamp=timestamp,
                payload=audio_payload,
            )

    if len(payload) >= 4:
        message_type, reserved, payload_size = struct.unpack("!BBH", payload[:4])
        if len(payload) >= 4 + payload_size:
            audio_payload = payload[4 : 4 + payload_size]
            return ParsedAudioFrame(
                protocol_version=3,
                message_type=message_type,
                timestamp=0,
                payload=audio_payload,
            )

    raise ValueError("Unsupported or truncated Xiaozhi audio frame")
