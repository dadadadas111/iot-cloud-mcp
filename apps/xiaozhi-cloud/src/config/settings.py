from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8080
    public_ws_url: str = "ws://localhost:8080/xiaozhi/v1/"
    public_ota_url: str = "http://localhost:8080/ota/"
    redis_url: str = "redis://localhost:6379/1"
    session_ttl_seconds: int = 3600
    audio_sample_rate: int = 16000
    audio_chunk_ms: int = 60
    silence_timeout_ms: int = 1500

    mcp_base_url: str = "http://localhost:3001"
    mcp_project_api_key: str = ""
    mcp_bearer_token: str = ""

    groq_api_key: str = ""
    groq_stt_model: str = "whisper-large-v3-turbo"

    openai_compatible_base_url: str = ""
    openai_compatible_api_key: str = ""
    openai_compatible_model: str = ""

    tts_provider: str = "edge"
    tts_voice: str = "vi-VN-HoaiMyNeural"
    piper_model_path: str = "/app/models/vi_VN-vais1000-medium.onnx"
    system_prompt: str = "You are a helpful Vietnamese-speaking assistant. Keep replies concise and natural for voice conversation."
    log_level: str = "INFO"


settings = Settings()
