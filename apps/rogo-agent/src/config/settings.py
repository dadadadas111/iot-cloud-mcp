from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Server
    host: str = "0.0.0.0"
    port: int = 8080
    public_url: str = "https://agent.rogo.com.vn"  # used in OTA config returned to devices

    # Redis
    redis_url: str = "redis://localhost:6379"
    session_ttl: int = 3600

    # Rogo MCP backend
    rogo_mcp_url: str
    rogo_email: str
    rogo_password: str

    # Wakeword
    wakeword_model: str = "hey_rogo"  # custom model path or openwakeword built-in
    wakeword_threshold: float = 0.5

    # STT
    stt_provider: str = "openai"  # "openai" | "funasr"
    stt_base_url: str = ""  # override endpoint, e.g. https://api.groq.com/openai/v1
    stt_api_key: str = ""   # override key; falls back to openai_api_key
    stt_model: str = "whisper-1"  # "whisper-1" (OpenAI) | "whisper-large-v3-turbo" (Groq)
    openai_api_key: str = ""
    funasr_url: str = "http://localhost:10095"

    # LLM
    llm_provider: str = "openai"  # "openai" | "openai_compatible" | "anthropic" | "ollama"
    llm_model: str = "gpt-4o-mini"
    llm_base_url: str = ""  # custom OpenAI-compatible base URL, e.g. https://my-llm.example.com/v1
    llm_api_key: str = ""  # API key for llm_base_url / openai_compatible; falls back to openai_api_key
    anthropic_api_key: str = ""

    # TTS
    tts_provider: str = "edge_tts"  # "edge_tts" | "fish_speech"
    tts_voice: str = "vi-VN-HoaiMyNeural"  # Vietnamese Edge-TTS voice
    fish_speech_url: str = "http://localhost:8080"

    # Audio
    audio_sample_rate: int = 16000
    audio_chunk_ms: int = 30  # VAD frame size from device
    silence_timeout_ms: int = 1500  # stop listening after this silence

    # Firmware protocol / Xiaozhi compat
    # firmware_protocol: "rogo" → /device/ws | "xiaozhi" → /xiaozhi/ws
    firmware_protocol: str = "xiaozhi"
    xiaozhi_audio_format: str = "opus"  # "opus" | "pcm" — audio encoding the device sends


settings = Settings()
