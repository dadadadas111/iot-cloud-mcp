# Xiaozhi AI ↔ Rogo IoT Bridge

Connects a Xiaozhi AI device to the Rogo IoT platform. The bridge is a **transparent MCP proxy** — all tool calls from Xiaozhi are forwarded to the deployed Rogo MCP server, which handles the full IoT tool suite (24 tools).

## Architecture

```
Xiaozhi AI device
    ↕ (voice/audio)
Xiaozhi Cloud  ←→  [WebSocket MCP relay]
                            ↕
                    rogo-xiaozhi-bridge
                      bridge.py           — headless OAuth + token lifecycle
                      mcp_pipe.py         — WebSocket ↔ stdio bridge (Xiaozhi side)
                      bridge_server.py    — stdio ↔ HTTP MCP proxy (Rogo side)
                            ↕ HTTP + Bearer token
              Rogo MCP Server (https://<alias>.mcp.dash.id.vn)
                            ↕
                    Rogo IoT Cloud API
```

Each Rogo user runs **their own bridge instance** with their own credentials. One bridge = one Rogo account.

## How authentication works

On startup, `bridge.py` performs a **headless OAuth 2.1 login** to the Rogo MCP server:

1. `POST /login` with email + password + PKCE → receives 302 redirect with auth code
2. `POST /token` with auth code → receives Bearer token (valid 1 hour)
3. Token is passed to `bridge_server.py` via env var
4. `bridge.py` automatically re-authenticates ~60s before token expiry

No manual token management required.

## Prerequisites

- A Rogo account with access to a project
- A Xiaozhi device registered on [xiaozhi.me](https://xiaozhi.me) with MCP enabled
- A server/VPS with Docker (or Python 3.11+)

## Step 1 — Get your credentials

### Xiaozhi MCP endpoint

1. Log in to [xiaozhi.me](https://xiaozhi.me)
2. Go to your agent/device settings
3. Click **Get MCP Endpoint** → copy the `wss://api.xiaozhi.me/mcp/?token=...` URL

### Rogo MCP endpoint URL

This is the URL you use to connect Claude/ChatGPT to Rogo IoT. Format:

```
https://<alias>.mcp.dash.id.vn
```

Example: `https://rogo-64770705.mcp-stag.dash.id.vn`

## Step 2 — Deploy with Docker (recommended)

Clone or copy the `bridge/xiaozhi/` directory from this repository.

Download the Xiaozhi pipe script (required):

```bash
curl -fsSL https://raw.githubusercontent.com/78/mcp-calculator/main/mcp_pipe.py -o mcp_pipe.py
```

Create `.env` from the example:

```bash
cp .env.example .env
```

Fill in `.env`:

```env
XIAOZHI_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=<your-xiaozhi-token>
ROGO_MCP_URL=https://rogo-64770705.mcp-stag.dash.id.vn
ROGO_EMAIL=your-email@example.com
ROGO_PASSWORD=your-password
```

Build and start:

```bash
docker compose up -d
```

Verify it's working:

```bash
docker logs rogo-xiaozhi-bridge -f
```

Expected output:

```
[Bridge] Authenticating with Rogo MCP server...
[Bridge] Auth OK. Token expires in 3600s.
INFO - [bridge_server.py] Connecting to WebSocket server...
INFO - [bridge_server.py] Successfully connected to WebSocket server
[Proxy] Connected to Rogo MCP server.
```

## Step 3 — Deploy without Docker (Python only)

Requires Python 3.11+.

```bash
cd bridge/xiaozhi
pip install -r requirements.txt
curl -fsSL https://raw.githubusercontent.com/78/mcp-calculator/main/mcp_pipe.py -o mcp_pipe.py

export XIAOZHI_ENDPOINT="wss://api.xiaozhi.me/mcp/?token=..."
export ROGO_MCP_URL="https://rogo-64770705.mcp-stag.dash.id.vn"
export ROGO_EMAIL="your@email.com"
export ROGO_PASSWORD="yourpassword"

python bridge.py
```

For production, use a systemd service or screen session.

## Available tools

The bridge transparently proxies **all 24 Rogo MCP tools** to Xiaozhi — no reimplementation. Xiaozhi gets the same tool suite as Claude/ChatGPT.

Key tools for voice control:

| Tool                    | What it does                                       |
| ----------------------- | -------------------------------------------------- |
| `list_devices`          | List all IoT devices, optionally filtered by room  |
| `list_locations`        | List all rooms/areas                               |
| `get_device_state`      | Get current state of a device                      |
| `control_device_simple` | Control (on/off, brightness, temperature, AC mode) |
| `list_smarts`           | List smart scenes/automations                      |
| `activate_smart`        | Trigger a smart scene                              |

## Example conversation

> _"Liệt kê các thiết bị của tôi"_ → calls `list_devices`

> _"Bật đèn phòng khách"_ → calls `control_device_simple(uuid, "turn_on")`

> _"Đặt điều hòa phòng ngủ 25 độ"_ → calls `control_device_simple(uuid, "set_temperature", 25)`

> _"Kích hoạt cảnh tắt tất cả đèn"_ → calls `list_smarts` then `activate_smart`

## Troubleshooting

**`Login failed (4xx)` in logs**

- Verify `ROGO_EMAIL` and `ROGO_PASSWORD` are correct
- Check `ROGO_MCP_URL` matches your endpoint (staging vs production)

**Bridge connects but Xiaozhi doesn't use tools**

- Wait ~30s for Xiaozhi to sync after connection
- Check Xiaozhi console for a "Refresh MCP tools" option

**Container exits immediately**

```bash
docker logs rogo-xiaozhi-bridge
docker compose down && docker compose up --build
```

**Token refresh issues**
`bridge.py` handles auto re-auth. Restart if stuck: `docker compose restart`

## Multi-user setup

Each Rogo user needs their own bridge:

```
/srv/bridges/
  user-alice/   .env  ← Alice's Rogo credentials + Alice's Xiaozhi token
  user-bob/     .env  ← Bob's Rogo credentials + Bob's Xiaozhi token
```

## Security notes

- `.env` contains credentials — never commit it (covered by `.gitignore`)
- Xiaozhi tokens have expiry dates — regenerate from the Xiaozhi console when expired
- Point `ROGO_MCP_URL` to production (`mcp.dash.id.vn`) for production deployments
