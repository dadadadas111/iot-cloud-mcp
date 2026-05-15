## xiaozhi-cloud

Protocol-correct custom cloud service for Xiaozhi devices.

Target flow:

1. Xiaozhi device
2. `xiaozhi-cloud`
3. existing `iot-cloud-mcp` server
4. Rogo IoT Cloud API

### Principles

- Treat Xiaozhi OTA + WebSocket behavior as the source of truth.
- Keep custom-cloud concerns separate from the NestJS MCP server.
- Use Redis for conversational and connection session state.
- Use Groq for STT.
- Use an OpenAI-compatible provider for LLM responses.
- Build strong protocol logs first so live-device debugging is possible.

### Initial scope

- OTA endpoint
- WebSocket hello + session bootstrap
- Binary frame parsing for Xiaozhi WebSocket audio
- Redis-backed session repository
- Health endpoint

The audio/model/tool execution loop will be layered on top of this base.
