# Firmware Fork Guide

How to fork `xinnan-tech/xiaozhi-esp32` and redirect it to the rogo-agent server.

## What changes

The stock xiaozhi-esp32 firmware hardcodes the OTA URL pointing to `api.xiaozhi.me`.
We change two defaults:

| Setting          | Stock value                                | Our value                              |
| ---------------- | ------------------------------------------ | -------------------------------------- |
| OTA URL          | `https://iot.xiaozhi.me/xiaozhi/ota/`      | `https://agent.rogo.com.vn/ota/`       |
| WebSocket server | resolved from OTA config (Xiaozhi cloud)   | resolved from our `/ota/` endpoint     |

The rogo-agent `/ota/` endpoint returns:
```json
{
  "websocket_url": "wss://agent.rogo.com.vn/device/ws",
  "firmware_version": "1.0.0"
}
```

Firmware connects to `websocket_url` and runs the rogo-agent protocol.

---

## Step 1 — Clone and set up build environment

```bash
git clone https://github.com/xinnan-tech/xiaozhi-esp32 rogo-firmware
cd rogo-firmware
git checkout -b rogo/main
```

Install ESP-IDF 5.4+:
```bash
# macOS/Linux
. $HOME/esp/esp-idf/export.sh

# or use the ESP-IDF VS Code extension
```

---

## Step 2 — Change the OTA URL default

Edit `main/Kconfig.projbuild` (or the equivalent config file for the board):

```
# Find the line like:
config OTA_URL
    default "https://iot.xiaozhi.me/xiaozhi/ota/"

# Change to:
config OTA_URL
    default "https://agent.rogo.com.vn/ota/"
```

Or search for the hardcoded URL:
```bash
grep -r "xiaozhi.me" main/ --include="*.c" --include="*.h" --include="*.cpp"
```

---

## Step 3 — (Optional) Change the wakeword

The stock firmware uses a built-in ESP-SR WakeNet wakeword ("小智" = "Xiao Zhi" in Chinese).

For the Phase 1 demo, **server-side wakeword** means the device just streams all
VAD-gated audio and the server decides if it's a wakeword. So the device-side
wakeword check can be **disabled** (just stream on VAD trigger).

To disable device-side wakeword:
```c
// In the main audio loop, comment out or bypass:
// if (wakeword_detected) { ... }
// Replace with: always trigger on VAD
```

For Phase 2, replace with a custom WakeNet model trained on "Hey Rogo" using
[ESP-SR model training tools](https://github.com/espressif/esp-sr).

---

## Step 4 — WebSocket protocol compatibility

The rogo-agent expects our `protocol.py` message format (JSON control + binary PCM16).

The xiaozhi-esp32 firmware uses a different protocol by default. You have two options:

### Option A (faster for demo): adapt rogo-agent to speak xiaozhi firmware protocol
Look at the xiaozhi firmware's WebSocket messages in:
`components/audio/audio_codec.c` or similar.

### Option B (cleaner long-term): patch firmware to use rogo-agent protocol
Change the firmware's WebSocket send/receive logic to use our JSON messages.
See `src/audio/protocol.py` for the exact format.

**Recommendation for Week 2 demo**: start with Option A to get hardware connected
fast, then migrate to Option B before the final demo.

---

## Step 5 — Build and flash

```bash
cd rogo-firmware
idf.py set-target esp32s3   # or esp32, depends on board
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

Or use [ESP Launchpad](https://espressif.github.io/esp-launchpad/) for web-based flashing.

---

## Step 6 — OTA redirect for existing devices (no reflash)

If the device runs firmware >= 1.6.1 (xiaozhi stock), you can redirect without reflashing:

1. Hold reset button until provisioning mode (LED blinks)
2. Connect to device WiFi AP (`xiaozhi-xxxx`)
3. Open `http://192.168.4.1`
4. Advanced Options → **OTA URL** → set to `https://agent.rogo.com.vn/ota/`
5. Save and reboot

On next boot, the device fetches our `/ota/` config and connects to rogo-agent.

---

## Xiaozhi firmware protocol (for Option A adapter)

Based on the xiaozhi-esp32-server source, the device sends:

```
Binary: raw PCM16 audio (16kHz, mono, variable chunk size)
Text JSON: {"type": "hello", "version": 3, "transport": "websocket", ...}
Text JSON: {"type": "listen", "state": "start"/"stop"/"detect", ...}
Text JSON: {"session_id": "...", "type": "abort"}
```

Server responds:
```
Text JSON: {"type": "hello", "session_id": "...", ...}
Text JSON: {"type": "tts", "state": "start"/"end", "text": "..."}
Binary: MP3 or Opus TTS audio
```

To adapt: modify `src/audio/protocol.py` and `gateway.py` to speak this protocol instead,
or add a translation layer in the gateway.

---

## References

- Firmware repo: https://github.com/xinnan-tech/xiaozhi-esp32
- ESP-SR (wakeword training): https://github.com/espressif/esp-sr
- ESP-IDF: https://docs.espressif.com/projects/esp-idf/en/latest/
- ESP Launchpad: https://espressif.github.io/esp-launchpad/
