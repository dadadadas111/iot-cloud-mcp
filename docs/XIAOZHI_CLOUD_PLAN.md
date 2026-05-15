# Xiaozhi Cloud Plan

## Goal

Build a protocol-correct Xiaozhi custom cloud as a sibling service to the existing NestJS MCP server.

Target flow:

1. Xiaozhi device
2. `xiaozhi-cloud`
3. `iot-cloud-mcp`
4. Rogo IoT Cloud API

## Why a sibling service

- Xiaozhi transport and audio concerns are separate from MCP gateway concerns.
- The custom cloud needs its own release cadence, logs, env, and protocol tests.
- Future sibling apps should not trigger MCP deploys by default.

## Phases

### Phase 1

- service skeleton
- OTA endpoint
- WebSocket endpoint
- header logging
- hello handling
- binary frame parsing
- Redis session persistence

### Phase 2

- protocol state machine
- turn manager
- timeout + abort handling
- STT/LLM/TTS interfaces

### Phase 3

- Groq STT
- OpenAI-compatible LLM
- MCP bridge to existing Nest service
- tool invocation loop

### Phase 4

- production-ready deployment
- app-specific GitHub Actions
- VPS runbook
- live log validation

## Current status

This branch now contains the initial Phase 1 skeleton only.
