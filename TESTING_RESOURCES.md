# How to Test MCP Resources

## Prerequisites

1. Your MCP server should be running on `http://localhost:3001`
2. You need:
   - A valid project API key (e.g., `test-project`)
   - A valid JWT Bearer token

## Testing with cURL

### 1. Test resources/list

```bash
curl -X POST http://localhost:3001/mcp/YOUR_PROJECT_KEY \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "resources/list",
    "params": {}
  }'
```

Expected response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resources": [
      {
        "uri": "rogo://docs/device-attributes",
        "name": "Device Attributes Reference",
        "description": "Complete reference of device attributes...",
        "mimeType": "text/markdown"
      },
      {
        "uri": "rogo://docs/control-guide",
        "name": "Device Control Guide",
        "description": "How to control devices...",
        "mimeType": "text/markdown"
      },
      {
        "uri": "rogo://docs/state-guide",
        "name": "Device State Guide",
        "description": "How to read device state...",
        "mimeType": "text/markdown"
      }
    ]
  }
}
```

### 2. Test resources/read

```bash
# Read device attributes
curl -X POST http://localhost:3001/mcp/YOUR_PROJECT_KEY \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "resources/read",
    "params": {
      "uri": "rogo://docs/device-attributes"
    }
  }'

# Read control guide
curl -X POST http://localhost:3001/mcp/YOUR_PROJECT_KEY \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "resources/read",
    "params": {
      "uri": "rogo://docs/control-guide"
    }
  }'

# Read state guide
curl -X POST http://localhost:3001/mcp/YOUR_PROJECT_KEY \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "resources/read",
    "params": {
      "uri": "rogo://docs/state-guide"
    }
  }'
```

Expected response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "rogo://docs/device-attributes",
        "mimeType": "text/markdown",
        "text": "# Device Attributes Reference\n\n..."
      }
    ]
  }
}
```

## What to Look For in Server Logs

When resources are accessed, you should see:

```
[Nest] LOG [McpController] MCP request received - Project: test-project, Method: resources/list
[Nest] LOG [McpProtocolHandlerService] Client initialize request received
[Nest] LOG [McpProtocolHandlerService] 📋 Resources list requested
[Nest] LOG [McpProtocolHandlerService] Returning 3 registered resources

[Nest] LOG [McpController] MCP request received - Project: test-project, Method: resources/read
[Nest] LOG [McpProtocolHandlerService] 📖 Resource read requested: rogo://docs/device-attributes
[Nest] LOG [McpProtocolHandlerService] Reading resource: Device Attributes Reference
[Nest] LOG [ResourceRegistryService] 🔍 [RESOURCE ACCESS] device-attributes resource read requested
[Nest] LOG [ResourceRegistryService] ✅ [RESOURCE ACCESS] device-attributes resource read successful (12345 chars)
[Nest] LOG [McpProtocolHandlerService] ✅ Resource read successful: rogo://docs/device-attributes (12345 chars)
```

## Testing with MCP Client SDK

If you want to use the TypeScript SDK (requires `npx tsx` or similar):

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamablehttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3001/mcp/YOUR_PROJECT_KEY'),
);

const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);

// List resources
const list = await client.listResources();
console.log('Resources:', list.resources);

// Read a resource
const content = await client.readResource({
  uri: 'rogo://docs/device-attributes',
});
console.log('Content:', content.contents[0].text);

await client.close();
```

## Verification Checklist

- [ ] Server starts without errors
- [ ] `resources/list` returns 3 resources
- [ ] Each resource has correct URI, name, description, mimeType
- [ ] `resources/read` returns markdown content
- [ ] Server logs show resource access with 🔍 and ✅ emojis
- [ ] Resource content length is logged
- [ ] No errors in server console
