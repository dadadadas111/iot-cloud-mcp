# Connect Xiaozhi AI to Rogo IoT

One-command setup. Takes about 5 minutes.

## What you need

- A Xiaozhi AI device registered at [xiaozhi.me](https://xiaozhi.me)
- A Rogo IoT account at [iot.rogo.com.vn](https://iot.rogo.com.vn)
- A server or VPS with [Docker](https://docs.docker.com/get-docker/) installed

---

## Step 1 — Get your Xiaozhi MCP endpoint

1. Log in to [xiaozhi.me](https://xiaozhi.me)
2. Go to your agent settings
3. Click **Get MCP Endpoint**
4. Copy the URL — it looks like: `wss://api.xiaozhi.me/mcp/?token=...`

> Xiaozhi's UI may change. Refer to their official documentation at [xiaozhi.dev](https://xiaozhi.dev) if these steps are outdated.

---

## Step 2 — Get your Rogo MCP URL

1. Log in to [iot.rogo.com.vn](https://iot.rogo.com.vn)
2. Open your project
3. Go to **Cloud Service → MCP Service**
4. Copy the MCP endpoint URL — it looks like: `https://xxx.mcp.dash.id.vn`

---

## Step 3 — Run the installer

On your server, run:

```bash
bash <(curl -fsSL https://mcp.dash.id.vn/bridge/install.sh)
```

The installer will ask for:

| Prompt                | Where to find it              |
| --------------------- | ----------------------------- |
| Xiaozhi MCP endpoint  | Step 1                        |
| Rogo MCP URL          | Step 2                        |
| Rogo email & password | Your Rogo account credentials |

It will set everything up and print **✓ Connected!** when done.

---

## Done

Xiaozhi can now control your Rogo IoT devices by voice. Try:

- _"List my devices"_
- _"Turn on the living room light"_
- _"Set the bedroom AC to 24 degrees"_
- _"Activate the goodnight scene"_

---

## Managing the bridge

```bash
# View live logs
docker logs rogo-xiaozhi-bridge -f

# Restart
cd ~/rogo-xiaozhi-bridge && docker compose restart

# Stop
cd ~/rogo-xiaozhi-bridge && docker compose down
```

The bridge auto-restarts on reboot and handles token refresh automatically.
