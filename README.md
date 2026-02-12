# IoT Cloud MCP Server

A professional Model Context Protocol (MCP) server that bridges AI assistants with IoT Cloud REST API.

## Features

- 🔌 **MCP Protocol** - Server-Sent Events (SSE) endpoint for AI agent connectivity
- 🔐 **Simple Authentication** - Login tool for end-users, no auth required for agents
- 🚀 **Production Ready** - Built with NestJS and TypeScript
- 📊 **IoT Device Management** - Full access to devices, locations, groups, and definitions

## Architecture

```
┌─────────────────────────────────┐
│   AI Agent (Claude, ChatGPT)   │
│   Connects via SSE              │
└───────────┬─────────────────────┘
            │ No Authentication
┌───────────▼─────────────────────┐
│   MCP Server (SSE Endpoint)     │
│   GET /api/mcp/sse              │
└───────────┬─────────────────────┘
            │
            │ 1. Agent connects (no auth)
            │ 2. Agent calls 'login' tool
            │ 3. Server returns token
            │ 4. Token stored in connection
            │ 5. Subsequent tools use token
            │
┌───────────▼─────────────────────┐
│   IoT Cloud REST API            │
│   (Authentication via token)    │
└─────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- IoT Cloud API access (API key and base URL)

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API credentials
```

### Configuration

Create `.env` file:

```env
# Server
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# IoT Cloud REST API
IOT_API_BASE_URL=https://staging.openapi.rogo.com.vn/api/v2.0/iot-core
IOT_API_KEY=your-api-key-here
IOT_API_TIMEOUT=30000

# CORS
ENABLE_CORS=true
CORS_ORIGINS=http://localhost:3000,https://chat.openai.com,https://claude.ai

# Rate Limiting
ENABLE_RATE_LIMIT=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Logging
LOG_LEVEL=debug
```

### Running

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

Server will be available at `http://localhost:3001`

## MCP Protocol

### Connection

**Endpoint:** `GET /api/mcp/sse`

**No Authentication Required** - Agents can connect freely.

```bash
curl -N http://localhost:3001/api/mcp/sse
```

### Available Tools

#### ChatGPT-Compatible Tools

These tools follow ChatGPT's MCP connector specification for document search and retrieval:

##### 1. search

Search for IoT devices, locations, and groups across your entire system.

```json
{
  "name": "search",
  "arguments": {
    "query": "living room"
  }
}
```

**Response:**

```json
{
  "results": [
    {
      "id": "device:abc-123",
      "title": "Device: Living Room Light",
      "url": "https://mcp.dash.id.vn/device/abc-123"
    },
    {
      "id": "location:def-456",
      "title": "Location: Living Room",
      "url": "https://mcp.dash.id.vn/location/def-456"
    }
  ]
}
```

##### 2. fetch

Retrieve complete details of a specific device, location, or group.

```json
{
  "name": "fetch",
  "arguments": {
    "id": "device:abc-123"
  }
}
```

**Response:**

```json
{
  "id": "device:abc-123",
  "title": "Device: Living Room Light",
  "text": "{...full device JSON...}",
  "url": "https://mcp.dash.id.vn/device/abc-123",
  "metadata": {
    "type": "device",
    "uuid": "abc-123",
    "retrieved_at": "2026-02-12T10:00:00Z"
  }
}
```

#### Authentication Tool

##### 3. login

**MUST be called first** to authenticate end-users.

```json
{
  "name": "login",
  "arguments": {
    "email": "user@example.com",
    "password": "password123"
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful. You can now use other tools to interact with your IoT devices.",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user_id": "user-uuid"
}
```

The token is automatically stored in the connection context and used for subsequent tool calls.

#### Legacy IoT Tools

These tools provide direct access to IoT API resources (for non-ChatGPT MCP clients):

##### 4. get_devices

Get all IoT devices for the authenticated user.

```json
{
  "name": "get_devices",
  "arguments": {
    "locationId": "optional-location-id",
    "groupId": "optional-group-id"
  }
}
```

##### 5. get_device

Get details of a specific device by UUID.

```json
{
  "name": "get_device",
  "arguments": {
    "deviceId": "device-uuid"
  }
}
```

##### 6. get_device_state

Get current state and properties of a device.

```json
{
  "name": "get_device_state",
  "arguments": {
    "deviceId": "device-uuid"
  }
}
```

##### 7. get_locations

Get all location groups for the user.

```json
{
  "name": "get_locations",
  "arguments": {}
}
```

##### 8. get_groups

Get all device groups for the user.

```json
{
  "name": "get_groups",
  "arguments": {
    "locationId": "optional-location-id"
  }
}
```

##### 9. get_definitions

Get entity definitions and workflow examples.

```json
{
  "name": "get_definitions",
  "arguments": {
    "type": "entities" // or "workflows"
  }
}
```

## ChatGPT Integration

Your MCP server is now compatible with ChatGPT's connector specification.

### Using with ChatGPT

1. **In ChatGPT settings**, go to **Connectors**
2. **Add a new connector** with URL: `https://mcp.dash.id.vn/api/mcp/sse`
3. **No authentication required** for the connector itself
4. **In ChatGPT conversation:**
   - First: "Login to my IoT account with email user@example.com and password mypassword"
   - Then: "Search for all devices in my living room"
   - Or: "Show me details of device abc-123"

### Using with ChatGPT Deep Research (via API)

Add your MCP server to a deep research request:

```bash
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5-deep-research",
    "instructions": "You are a helpful assistant with access to IoT device data.",
    "tools": [
      {
        "type": "mcp",
        "mcp": {
          "url": "https://mcp.dash.id.vn/api/mcp/sse",
          "approval_settings": {
            "approval_required": false
          }
        }
      }
    ],
    "messages": [
      {
        "role": "user",
        "content": "Login with email user@example.com and password mypassword, then search for all temperature sensors"
      }
    ]
  }'
```

## Claude Desktop Integration

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "iot-cloud": {
      "url": "http://localhost:3001/api/mcp/sse"
    }
  }
}
```

Then use Claude Desktop to interact with your IoT devices:

```
You: Login to my IoT account with email user@example.com and password mypassword

Claude: [Calls login tool] ✓ Login successful

You: Show me all my devices

Claude: [Calls get_devices tool] Here are your devices: ...

You: What's the current state of device abc-123?

Claude: [Calls get_device_state tool] The device is currently: ...
```

## API Documentation

**Swagger UI:** http://localhost:3001/api/docs

**OpenAPI JSON:** http://localhost:3001/api/docs-json

## Authentication Flow

1. **Agent Connects** → No authentication required
2. **User Provides Credentials** → Agent calls `login` tool with email/password
3. **Server Authenticates** → Calls IoT Cloud API login endpoint
4. **Token Returned** → JWT token stored in connection context
5. **Subsequent Calls** → All other tools use the stored token automatically

### Security Notes

- SSE endpoint is **intentionally unauthenticated** for agent connectivity
- End-user authentication happens via the `login` tool
- Tokens are stored per-connection and never exposed to the agent
- All IoT API calls are authenticated with the user's token

## Project Structure

```
iot-cloud-mcp/
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module
│   ├── auth/                      # Authentication module
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts     # REST login endpoint (optional)
│   │   └── auth.service.ts        # IoT API login logic
│   ├── api/
│   │   ├── api.module.ts
│   │   └── controllers/
│   │       └── mcp.controller.ts  # MCP SSE endpoint
│   ├── mcp/                       # MCP protocol implementation
│   │   ├── mcp.module.ts
│   │   ├── services/
│   │   │   └── mcp.service.ts     # MCP tools and resources
│   │   └── types/
│   │       └── mcp.types.ts       # MCP protocol types
│   ├── services/
│   │   └── api-client.service.ts  # HTTP client for IoT API
│   └── health.controller.ts       # Health check endpoint
├── .env                           # Environment variables
├── package.json
└── README.md
```

## Development

```bash
# Install dependencies
npm install

# Run in watch mode
npm run start:dev

# Build for production
npm run build

# Run tests
npm run test

# Lint code
npm run lint
```

## Docker Deployment

```bash
# Build image
docker build -t iot-cloud-mcp .

# Run container
docker run -d \
  --name iot-cloud-mcp \
  -p 3001:3001 \
  --env-file .env \
  iot-cloud-mcp

# Or use docker-compose
docker-compose up -d
```

## Environment Variables

| Variable            | Required | Default       | Description              |
| ------------------- | -------- | ------------- | ------------------------ |
| `NODE_ENV`          | No       | `development` | Environment mode         |
| `PORT`              | No       | `3001`        | Server port              |
| `HOST`              | No       | `0.0.0.0`     | Server host              |
| `IOT_API_BASE_URL`  | **Yes**  | -             | IoT Cloud API base URL   |
| `IOT_API_KEY`       | **Yes**  | -             | IoT Cloud API key        |
| `IOT_API_TIMEOUT`   | No       | `30000`       | API request timeout (ms) |
| `ENABLE_CORS`       | No       | `true`        | Enable CORS              |
| `CORS_ORIGINS`      | No       | `*`           | Allowed CORS origins     |
| `ENABLE_RATE_LIMIT` | No       | `true`        | Enable rate limiting     |
| `RATE_LIMIT_MAX`    | No       | `100`         | Max requests per window  |
| `RATE_LIMIT_WINDOW` | No       | `60000`       | Rate limit window (ms)   |
| `LOG_LEVEL`         | No       | `info`        | Logging level            |

## Troubleshooting

### Cannot Connect to IoT API

**Issue:** `Cannot connect to IoT API`

**Solution:**

- Verify `IOT_API_BASE_URL` is correct
- Check `IOT_API_KEY` is valid
- Test API directly: `curl -H "x-header-apikey: YOUR_KEY" https://api-url/health`

### Login Tool Fails

**Issue:** `Authentication failed`

**Solution:**

- Verify email and password are correct
- Check IoT API is accessible
- Review server logs for detailed error messages

### SSE Connection Drops

**Issue:** Connection closes unexpectedly

**Solution:**

- Check network stability
- Verify CORS settings if connecting from browser
- Review keep-alive timeout settings

## License

MIT

## Support

For issues and questions, open an issue on GitHub.
