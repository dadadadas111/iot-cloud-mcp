# MCP Protocol Implementation

This server now implements the **Model Context Protocol (MCP)** v2024-11-05.

## What is MCP?

MCP is a standardized protocol that allows AI assistants (like Claude, ChatGPT) to:
- Discover what resources are available
- Read resources (device data, locations, groups)
- List and call tools (functions to interact with devices)

## Endpoints

### 1. Initialize (No Auth Required)

```bash
POST /api/mcp/initialize
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "initialize",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "logging": {},
      "resources": { "listChanged": true },
      "tools": { "listChanged": true },
      "sampling": {}
    },
    "serverInfo": {
      "name": "IoT Cloud MCP Bridge",
      "version": "1.0.0"
    }
  }
}
```

### 2. List Tools (No Auth Required)

```bash
POST /api/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "get_devices",
        "description": "Get all IoT devices for the authenticated user",
        "inputSchema": {
          "type": "object",
          "properties": {
            "locationId": { "type": "string", "description": "Optional: Filter devices by location ID" },
            "groupId": { "type": "string", "description": "Optional: Filter devices by group ID" }
          }
        }
      },
      ...
    ]
  }
}
```

### 3. List Resources (Auth Required)

```bash
POST /api/mcp/call
Content-Type: application/json
Authorization: Bearer {FIREBASE_TOKEN}

{
  "jsonrpc": "2.0",
  "method": "resources/list",
  "id": 3
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resources": [
      {
        "uri": "iot://devices",
        "name": "Devices",
        "description": "All IoT devices accessible to the user",
        "mimeType": "application/json"
      },
      {
        "uri": "iot://device/{uuid}",
        "name": "Device: Light 01",
        "description": "Device: SmartLight",
        "mimeType": "application/json"
      },
      ...
    ]
  }
}
```

### 4. Read Resource (Auth Required)

```bash
POST /api/mcp/call
Content-Type: application/json
Authorization: Bearer {FIREBASE_TOKEN}

{
  "jsonrpc": "2.0",
  "method": "resources/read",
  "params": {
    "uri": "iot://devices"
  },
  "id": 4
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "contents": [
      {
        "uri": "iot://devices",
        "mimeType": "application/json",
        "text": "[{\"uuid\": \"...\", \"name\": \"Light 01\", ...}]"
      }
    ]
  }
}
```

### 5. Call Tool (Auth Required)

```bash
POST /api/mcp/call
Content-Type: application/json
Authorization: Bearer {FIREBASE_TOKEN}

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_devices",
    "args": {
      "locationId": "location-123"
    }
  },
  "id": 5
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"uuid\": \"...\", \"name\": \"Light 01\", ...}]"
      }
    ]
  }
}
```

## Available Tools

### `get_devices`
Get all IoT devices for the user

**Parameters:**
- `locationId` (optional): Filter by location
- `groupId` (optional): Filter by group

### `get_device`
Get details of a specific device

**Parameters:**
- `deviceId` (required): Device UUID

### `get_device_state`
Get current state and properties of a device

**Parameters:**
- `deviceId` (required): Device UUID

### `get_locations`
Get all location groups

**Parameters:** None

### `get_groups`
Get all device groups

**Parameters:**
- `locationId` (optional): Filter by location

### `get_definitions`
Get entity definitions and workflow examples

**Parameters:**
- `type` (optional): "entities" or "workflows"

## Available Resources

### `iot://devices`
List of all user devices

### `iot://locations`
List of all user locations

### `iot://groups`
List of all device groups

### `iot://device/{uuid}`
Details of a specific device

## Authentication Flow

1. User logs in to your app: `POST /api/auth/login`
2. Gets Firebase token
3. Sends token in MCP requests: `Authorization: Bearer {token}`
4. Server validates token and returns user-scoped data

## Example: Complete MCP Flow

```bash
# Step 1: Initialize
curl -X POST http://localhost:3001/api/mcp/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1
  }'

# Step 2: List tools (no auth needed)
curl -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 2
  }'

# Step 3: Login to get token
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}' | jq -r '.access_token')

# Step 4: List resources (with auth)
curl -X POST http://localhost:3001/api/mcp/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/list",
    "id": 3
  }'

# Step 5: Call a tool (with auth)
curl -X POST http://localhost:3001/api/mcp/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_devices"
    },
    "id": 4
  }'
```

## Error Handling

All errors follow JSON-RPC 2.0 error format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal server error",
    "data": {}
  }
}
```

**Error codes:**
- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
- `-32001`: Resource not found
- `-32002`: Invalid request ID

## Integration with MCP Clients

Your server is now compatible with:

- **Claude Desktop App** - Via MCP client configuration
- **ChatGPT** - Via API/tool endpoints
- **Custom MCP Clients** - Any JSON-RPC 2.0 client

## MCP Specification

Full specification: https://spec.modelcontextprotocol.io/

Key points:
- ✅ JSON-RPC 2.0 protocol
- ✅ Resource listing and reading
- ✅ Tool definition and invocation
- ✅ Error handling
- ✅ Both authenticated and unauthenticated endpoints

## Testing Your MCP Setup

Use any JSON-RPC client or curl to test endpoints. Recommended tools:

- **Postman** - GUI testing with JSON-RPC support
- **Thunder Client** - VSCode extension
- **curl** - Command line (see examples above)
- **MCP Inspector** - Official debugging tool from Anthropic

## Next Steps

1. Deploy to production (Render recommended)
2. Get your server URL
3. Configure MCP client (Claude Desktop, ChatGPT, etc.)
4. Test tool execution
5. Monitor logs for issues

See [CHATGPT_APPS.md](./CHATGPT_APPS.md) for ChatGPT-specific setup.
