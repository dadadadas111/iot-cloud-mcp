# iot-cloud-mcp

MCP (Model Context Protocol) gateway server that bridges AI assistants to the Rogo IoT Cloud platform. Built with NestJS, it translates MCP tool calls into structured REST API requests, enabling AI clients like ChatGPT and Claude to query and control IoT devices.

## Architecture

```
MCP Client (ChatGPT / Claude / n8n)
    │
    ▼
┌──────────────────────────────────────────────┐
│  POST /mcp/:projectApiKey                    │
│  ┌─ JWT auth ─ Session mgmt ─ JSON-RPC ─┐   │
│  │  McpController → ProtocolHandler      │   │
│  │  → ToolExecutor → IotApiService       │   │
│  └───────────────────────────────────────┘   │
│  Redis (sessions)    Local cache (servers)    │
└──────────────────────────────────────────────┘
    │
    ▼
Rogo IoT Cloud REST API
```

**Multi-tenant** — each project uses its own API key embedded in the URL. Sessions are scoped per-project, per-user.

## MCP Tools

| Tool                       | Description                         |
| -------------------------- | ----------------------------------- |
| `fetch_user`               | Get current user profile            |
| `search`                   | Search across devices, locations    |
| `list_devices`             | List all devices in a project       |
| `list_locations`           | List all locations                  |
| `list_groups`              | List device groups                  |
| `get_device`               | Get single device details + state   |
| `update_device`            | Update device properties            |
| `delete_device`            | Delete a device                     |
| `get_device_state`         | Get device state by ID              |
| `get_device_state_by_mac`  | Get device state by MAC address     |
| `get_location_state`       | Get all device states in a location |
| `control_device`           | Send control command (full)         |
| `control_device_simple`    | Send control command (simplified)   |
| `get_device_documentation` | Get device documentation            |
| `fetch`                    | Generic data fetch                  |

## Getting Started

### Prerequisites

- Node.js 18+
- Redis 6+
- Access to a Rogo IoT Cloud project API key

### Installation

```bash
git clone https://github.com/dadadadas111/iot-cloud-mcp.git
cd iot-cloud-mcp
npm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Key variables:

| Variable           | Required   | Default                 | Description                                |
| ------------------ | ---------- | ----------------------- | ------------------------------------------ |
| `IOT_API_BASE_URL` | Yes        | —                       | Rogo IoT Cloud API base URL                |
| `BASE_URL`         | Yes (prod) | `http://localhost:3001` | This server's public URL (OAuth discovery) |
| `REDIS_HOST`       | Yes        | `localhost`             | Redis hostname                             |
| `PORT`             | No         | `3001`                  | Server port                                |
| `MCP_SESSION_TTL`  | No         | `3600`                  | Session TTL in seconds                     |

See [`.env.example`](.env.example) for the full list with descriptions.

### Running

```bash
# Development (hot reload)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### Docker

```bash
# Production
docker compose up -d

# Staging
docker compose -f docker-compose.staging.yml up -d
```

## Authentication

The server implements OAuth 2.1 for MCP client authentication:

1. Client discovers auth endpoints via `/.well-known/oauth-authorization-server`
2. User authenticates through the `/authorize` flow (proxied to Rogo IoT Cloud)
3. Client exchanges authorization code for JWT tokens at `/token`
4. Bearer token included in all subsequent `/mcp/:projectApiKey` requests

## Project Structure

```
src/
├── main.ts                 # Bootstrap
├── app.module.ts           # Root module
├── mcp/                    # MCP protocol — controller, sessions, server factory
├── tools/                  # 15 MCP tool definitions + executor
│   ├── definitions/        # Individual tool files
│   └── services/           # Registry + executor
├── resources/              # MCP resource definitions
├── auth/                   # OAuth 2.1 flow
├── discovery/              # .well-known endpoints
├── proxy/                  # IoT API proxy layer (IotApiService)
├── redis/                  # Redis client module (global)
└── common/                 # Shared utils, constants, decorators
```

## Development

```bash
npm test              # Run tests
npx tsc --noEmit      # Type check
npm run lint          # Lint
npm run format        # Format with Prettier
```

## Deployment

CI/CD via GitHub Actions:

- **Push to `main`** → Build Docker image → Deploy to production
- **PR to `main`** → Build Docker image → Deploy to staging

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full ops runbook.

## Tech Stack

- **Runtime**: NestJS 10 + TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk` (Streamable HTTP transport)
- **Session Store**: Redis (ioredis)
- **Validation**: Zod v4
- **Auth**: OAuth 2.1 + JWT
- **Testing**: Jest
- **Deploy**: Docker + GitHub Actions

