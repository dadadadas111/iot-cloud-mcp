# Self-Hosting Guide: Rogo IoT Cloud MCP Server (Development)

## Overview

This guide sets up the MCP server locally for development — with hot reload, so the server restarts automatically when you change code.

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **npm** — comes with Node.js
- **Redis 6+** — required for session storage

Verify:
```bash
node --version   # 18.x or higher
npm --version
redis-cli ping   # should return PONG
```

**Installing Redis** (if not already installed):

```bash
# Ubuntu / Debian
sudo apt install redis-server && sudo systemctl start redis

# macOS
brew install redis && brew services start redis
```

---

## Step 1 — Get the code

```bash
git clone https://github.com/dadadadas111/iot-cloud-mcp.git
cd iot-cloud-mcp
```

---

## Step 2 — Install dependencies

```bash
npm install
```

---

## Step 3 — Set up the environment

1. Use the `.env` file given to you via this link: [https://drive.google.com/file/d/1xntrCAkLImiYgkPfpUt7FzznJeTGGBe0/view?usp=drive_link]. Place it in the root of the `iot-cloud-mcp` directory.

2. Come to this dashboard: [https://iot-stag.rogo.com.vn/org/project/647707053bcdc39e3811584c/overview], add your IP to the whitelist.

3. Copy this URL. It will later be your MCP endpoint: [http://localhost:3001/mcp/rogo-64770705]

> **Important:** Do not commit or share .env file. It contains sensitive data.

---

## Step 4 — Start the dev server

```bash
npm run start:dev
```

The server starts with hot reload — any file you save triggers an automatic restart. You should see output like:

```
[NestFactory] Starting Nest application...
[NestApplication] Nest application successfully started
Application is running on: http://localhost:3001
```

## Step 5 — Connect an MCP client

Use the following URL as your MCP endpoint in any client:

```
http://localhost:3001/mcp/rogo-64770705
```

**Claude Desktop** — add to your MCP config:
```json
{
  "mcpServers": {
    "rogo-iot": {
      "url": "http://localhost:3001/mcp/rogo-64770705"
    }
  }
}
```

**n8n** — use the MCP Client node with the same URL above.

**ChatGPT Custom GPT** — set the Action endpoint to that URL.

---

## Stopping the server

Press `Ctrl+C` in the terminal where the server is running.

---

## Troubleshooting

**`Error: connect ECONNREFUSED 127.0.0.1:6379`** — Redis is not running. Start it:
```bash
sudo systemctl start redis   # Linux
brew services start redis    # macOS
```

**Port 3001 already in use** — change `PORT=3001` in `.env` to another port, then update your MCP client URL accordingly.

**Server crashes on startup** — check that all required variables in your `.env` are filled in (especially `IOT_API_BASE_URL`, `BASE_URL`, and the `ALIAS_REDIS_*` values).

**Oauth errors when connecting clients** — ensure your client is configured to use the correct MCP endpoint URL. Ask me if you need help with client setup!

