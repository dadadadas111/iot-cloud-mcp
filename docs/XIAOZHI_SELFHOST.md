# Xiaozhi Self-Hosting Plan

Full private deployment of the Xiaozhi AI stack — no dependency on `api.xiaozhi.me` or any external cloud service. Rogo MCP server remains unchanged.

---

## Architecture

```
ESP32 devices
    ↕ WSS (firmware OTA redirect — no reflash needed)
┌──────────────────────────────────────────────────────┐
│                   Private Server(s)                  │
│                                                      │
│  xiaozhi-esp32-server                                │
│    ├── FunASR        (STT — fully local)             │
│    ├── Ollama        (LLM — fully local)             │
│    └── FishSpeech    (TTS — fully local)             │
│                         ↕                            │
│  mcp-endpoint-server    (MCP relay — self-hosted)    │
│                         ↕                            │
│  rogo-xiaozhi-bridge    (existing, minor change)     │
└──────────────────────────────────────────────────────┘
                          ↕ HTTPS
              Rogo MCP server  (unchanged)
                          ↕
              Rogo IoT Cloud API
```

All device traffic, AI inference, and MCP tool routing stays within your infrastructure. The only outbound connection is bridge → Rogo MCP server.

---

## Components

| Component              | Repo                                                                                    | Role                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `xiaozhi-esp32-server` | [xinnan-tech/xiaozhi-esp32-server](https://github.com/xinnan-tech/xiaozhi-esp32-server) | Handles device WebSocket connections, STT/LLM/TTS pipeline, admin UI               |
| `mcp-endpoint-server`  | [xinnan-tech/mcp-endpoint-server](https://github.com/xinnan-tech/mcp-endpoint-server)   | MCP relay between Xiaozhi server and tool servers (replaces `api.xiaozhi.me/mcp/`) |
| `rogo-xiaozhi-bridge`  | This repo — `bridge/xiaozhi/`                                                           | Connects to self-hosted MCP relay, proxies to Rogo MCP server                      |
| Rogo MCP server        | This repo                                                                               | **No changes needed**                                                              |

---

## Hardware Requirements

### Minimum — Single server

| Resource | Requirement        | Notes                                                               |
| -------- | ------------------ | ------------------------------------------------------------------- |
| CPU      | 8 cores            | FunASR + Ollama CPU mode                                            |
| RAM      | 32 GB              | Ollama 7B model needs ~8GB, FunASR ~4GB, system overhead            |
| GPU      | 12 GB VRAM         | Strongly recommended — Ollama on CPU works but ~5–10s response time |
| Storage  | 200 GB SSD         | Models + MySQL data + logs                                          |
| Network  | Public IP + domain | TLS required for 4G-connected devices                               |

### Recommended — Two servers

**App server** (lighter load):

| Resource | Spec                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| CPU      | 4 cores                                                                                 |
| RAM      | 8 GB                                                                                    |
| Storage  | 50 GB                                                                                   |
| Role     | xiaozhi-esp32-server (app layer) + mcp-endpoint-server + bridge + Nginx + MySQL + Redis |

**AI server** (GPU-heavy):

| Resource | Spec                         |
| -------- | ---------------------------- |
| CPU      | 8 cores                      |
| RAM      | 32 GB                        |
| GPU      | 12–24 GB VRAM                |
| Storage  | 150 GB                       |
| Role     | FunASR + Ollama + FishSpeech |

---

## Phase 1 — Infrastructure & Networking

### 1.1 DNS

Point a subdomain at your app server:

```
xiaozhi.company.com  →  <app-server-ip>
```

### 1.2 TLS certificate

```bash
certbot certonly --nginx -d xiaozhi.company.com
```

Required for 4G-connected ESP32 devices (they only accept WSS, not plain WS). Also good practice for Wi-Fi devices.

### 1.3 Nginx configuration

```nginx
server {
    listen 443 ssl;
    server_name xiaozhi.company.com;

    ssl_certificate     /etc/letsencrypt/live/xiaozhi.company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xiaozhi.company.com/privkey.pem;

    # ESP32 device connections → xiaozhi-esp32-server
    location /xiaozhi/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    # MCP relay → mcp-endpoint-server
    location /mcp_endpoint/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    # Admin UI → Java backend
    location /admin/ {
        proxy_pass http://localhost:9090;
    }
}
```

### 1.4 Firewall

```bash
# Allow inbound
ufw allow 443/tcp    # devices + bridge + admin

# Block direct access to internal services
ufw deny 8000        # xiaozhi-server (nginx only)
ufw deny 5001        # mcp-endpoint-server (nginx only)
ufw deny 3306        # MySQL (internal only)
ufw deny 6379        # Redis (internal only)
ufw deny 11434       # Ollama (internal only)
```

---

## Phase 2 — Deploy xiaozhi-esp32-server

### 2.1 Clone and configure

```bash
git clone https://github.com/xinnan-tech/xiaozhi-esp32-server
cd xiaozhi-esp32-server
cp .config.yaml.example .config.yaml
```

### 2.2 `.config.yaml` — Local AI stack

Configure all AI components to run locally. Do **not** use the default streaming cloud APIs (Xunfei, Alibaba, Volcengine).

```yaml
# Speech-to-Text — FunASR (local, no external calls)
asr:
  type: fun_asr
  model_dir: ./models/SenseVoiceSmall
  # Model downloads automatically on first start (~300 MB)

# Language Model — Ollama (local)
llm:
  type: ollama
  # Choose model based on available GPU VRAM:
  #   qwen2.5:7b   →  ~8 GB VRAM  (recommended minimum)
  #   qwen2.5:14b  →  ~16 GB VRAM (better quality)
  #   qwen2.5:32b  →  ~32 GB VRAM (best quality)
  model: qwen2.5:7b
  base_url: http://localhost:11434 # or http://ai-server:11434 if separate

# Text-to-Speech — FishSpeech (local)
tts:
  type: fish_speech
  model_dir: ./models/fish-speech-1.5
  # Model downloads automatically on first start (~500 MB)

# VAD — SileroVAD (local, included)
vad:
  type: silero_vad

# MCP tools — point to self-hosted mcp-endpoint-server
mcp:
  endpoint: ws://localhost:5001/mcp_endpoint/call/
```

### 2.3 Install Ollama and pull model

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b     # ~4.7 GB download
```

### 2.4 Start with Docker Compose

```bash
docker compose up -d
```

The stack starts: Python WebSocket server (port 8000) + Java admin API (port 9090) + Vue frontend + MySQL + Redis.

FunASR and FishSpeech models download automatically on first boot.

### 2.5 Verify

```bash
# Check all containers are healthy
docker compose ps

# Tail logs for errors
docker compose logs -f xiaozhi-server
```

Admin UI available at `https://xiaozhi.company.com/admin/` after Nginx is configured.

---

## Phase 3 — Deploy mcp-endpoint-server

```bash
git clone https://github.com/xinnan-tech/mcp-endpoint-server
cd mcp-endpoint-server
docker compose up -d
```

Exposes two WebSocket endpoints:

| Endpoint                                 | Used by                                |
| ---------------------------------------- | -------------------------------------- |
| `ws://localhost:5001/mcp_endpoint/mcp/`  | Bridge connects here (registers tools) |
| `ws://localhost:5001/mcp_endpoint/call/` | xiaozhi-esp32-server calls tools here  |

Verify it's running:

```bash
curl -s http://localhost:5001/health   # or check docker logs
```

---

## Phase 4 — Update the bridge

Only one change: `XIAOZHI_ENDPOINT` now points to the self-hosted relay instead of Xiaozhi cloud.

**`.env` before (cloud):**

```env
XIAOZHI_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=<token>
ROGO_MCP_URL=https://rogo-xxx.mcp.dash.id.vn
ROGO_EMAIL=user@company.com
ROGO_PASSWORD=xxx
```

**`.env` after (self-hosted):**

```env
XIAOZHI_ENDPOINT=wss://xiaozhi.company.com/mcp_endpoint/mcp/?token=<internal-token>
ROGO_MCP_URL=https://rogo-xxx.mcp.dash.id.vn
ROGO_EMAIL=user@company.com
ROGO_PASSWORD=xxx
```

The internal token format depends on mcp-endpoint-server's auth implementation — check its README for how tokens are issued.

> **Rogo MCP server requires no changes.** Bridge → Rogo HTTP flow is identical.

Restart the bridge after updating `.env`:

```bash
cd ~/rogo-xiaozhi-bridge
docker compose down && docker compose up -d
```

---

## Phase 5 — Redirect ESP32 devices

Requires firmware v1.6.1 or later. No reflashing needed.

### 5.1 Per-device redirect (existing hardware)

1. Hold the device's reset button until it enters provisioning mode
2. Connect your phone/laptop to the device's Wi-Fi AP (named `xiaozhi-xxxx`)
3. Open the provisioning page at `http://192.168.4.1`
4. Click **Advanced Options**
5. Set **OTA URL** to: `https://xiaozhi.company.com/xiaozhi/ota/`
6. Save and reboot

The device fetches the OTA config from your server, which returns your WebSocket address. All subsequent connections go to your private server.

### 5.2 New devices at manufacture time

To bake the URL into firmware before shipping:

1. Clone [xinnan-tech/xiaozhi-esp32](https://github.com/xinnan-tech/xiaozhi-esp32)
2. Edit `main/Kconfig.projbuild`:
   ```
   default "https://xiaozhi.company.com/xiaozhi/ota/"
   ```
3. Build with ESP-IDF 5.4+: `idf.py build`
4. Flash via [ESP Launchpad](https://espressif.github.io/esp-launchpad/)

---

## Phase 6 — Security Hardening

The xiaozhi-esp32-server authors explicitly warn the project has **not passed security evaluation**. These steps are mandatory before any production or customer-facing deployment.

### Authentication

- [ ] Change default MySQL root password and create a dedicated DB user
- [ ] Change default admin UI credentials immediately after first login
- [ ] Review mcp-endpoint-server token auth — implement token rotation
- [ ] Add API authentication to any internal endpoints exposed via Nginx

### Network

- [ ] Ensure MySQL, Redis, Ollama are bound to `127.0.0.1` only (not `0.0.0.0`)
- [ ] Rate limit WebSocket connections in Nginx:
  ```nginx
  limit_req_zone $binary_remote_addr zone=ws:10m rate=10r/s;
  limit_req zone=ws burst=20 nodelay;
  ```
- [ ] Restrict admin UI access by IP if possible

### Monitoring

- [ ] Set up log aggregation (Loki + Grafana, or ELK)
- [ ] Alert on: service crashes, abnormal connection counts, auth failures
- [ ] Backup MySQL data on a schedule (agent configs, user sessions)

---

## Effort Estimate

| Phase                   | Effort        | Notes                                                      |
| ----------------------- | ------------- | ---------------------------------------------------------- |
| 1. Infrastructure       | 1 day         | Server provisioning + DNS + Nginx + TLS                    |
| 2. xiaozhi-esp32-server | 2–3 days      | AI config is the hardest part; model tuning for Vietnamese |
| 3. mcp-endpoint-server  | 0.5 day       | Straightforward Docker deploy                              |
| 4. Update bridge        | 2 hours       | Single env var change + test                               |
| 5. Redirect devices     | 30 min/device | First-time physical access required                        |
| 6. Security hardening   | 2–3 days      | Cannot skip for production                                 |
| **Total**               | **~2 weeks**  | For internal demo-ready deployment                         |

Add 1–2 weeks for production readiness (load testing, monitoring, runbook).

---

## Open Questions to Validate During Implementation

These cannot be confirmed from documentation alone — need hands-on testing:

1. **mcp-endpoint-server ↔ bridge protocol compatibility** — the token format and auth handshake between our bridge and mcp-endpoint-server needs to be verified. May require a small code change in `bridge.py`.

2. **xiaozhi-esp32-server ↔ mcp-endpoint-server version compatibility** — the two repos update independently. Pin versions and test together before deploying.

3. **Ollama CPU-only latency** — if no GPU is available, measure actual response times with `qwen2.5:7b` on CPU to determine if it is acceptable for voice UX (~5–10s is the expected range).

4. **FishSpeech Vietnamese quality** — the model is trained primarily on Chinese/English. Evaluate output quality for Vietnamese TTS before committing. May need to switch to an alternative (PaddleSpeech, Edge TTS as fallback, or a fine-tuned model).

5. **mcp-endpoint-server scalability** — not tested at scale. If multiple users connect simultaneously, evaluate connection limits and message queuing behavior.

---

## Migration Strategy (Cloud → Self-hosted)

Do not migrate all devices at once. Run cloud and self-hosted in parallel:

1. Deploy self-hosted stack and validate with 1–2 test devices
2. Migrate devices in small batches (10 at a time)
3. Keep the cloud bridge running for non-migrated devices
4. Once all devices are migrated, shut down the cloud bridge

The two stacks do not conflict — each device connects to exactly one OTA URL.

---

## References

- xiaozhi-esp32-server: https://github.com/xinnan-tech/xiaozhi-esp32-server
- mcp-endpoint-server: https://github.com/xinnan-tech/mcp-endpoint-server
- xiaozhi-esp32 firmware: https://github.com/xinnan-tech/xiaozhi-esp32
- ESP Launchpad (web flasher): https://espressif.github.io/esp-launchpad/
- Ollama: https://ollama.com
- FunASR: https://github.com/modelscope/FunASR
- FishSpeech: https://github.com/fishaudio/fish-speech
