from enum import IntEnum, StrEnum
from pydantic import BaseModel, Field


class BinaryAudioType(IntEnum):
    OPUS = 0
    JSON = 1


class ClientMessageType(StrEnum):
    HELLO = "hello"
    LISTEN = "listen"
    ABORT = "abort"
    MCP = "mcp"


class ListenState(StrEnum):
    START = "start"
    STOP = "stop"
    DETECT = "detect"


class AudioParams(BaseModel):
    format: str = "opus"
    sample_rate: int = 16000
    channels: int = 1
    frame_duration: int = 60


class HelloMessage(BaseModel):
    type: ClientMessageType = ClientMessageType.HELLO
    version: int = Field(default=3)
    transport: str = "websocket"
    audio_params: AudioParams = Field(default_factory=AudioParams)
    session_id: str | None = None
    device_id: str | None = None
    client_id: str | None = None
    features: dict | None = None


class ListenMessage(BaseModel):
    type: ClientMessageType = ClientMessageType.LISTEN
    state: ListenState
    session_id: str | None = None
    mode: str | None = None
    text: str | None = None


class AbortMessage(BaseModel):
    type: ClientMessageType = ClientMessageType.ABORT
    session_id: str | None = None
    reason: str | None = None


class ServerHelloMessage(BaseModel):
    type: str = "hello"
    version: int
    transport: str = "websocket"
    session_id: str
    audio_params: AudioParams = Field(default_factory=AudioParams)


class OtaResponse(BaseModel):
    websocket: dict
    firmware: dict
