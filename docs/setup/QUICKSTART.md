# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your IoT Cloud API credentials:

```env
IOT_API_BASE_URL=https://staging.openapi.rogo.com.vn/api/v2.0/iot-core
IOT_API_KEY=your-api-key-here
```

### 3. Start the Server

```bash
npm run start:dev
```

Server will start at: **http://localhost:3001**

### 4. Test the Connection

In a new terminal, run the test script:

```bash
node test-mcp.js
```

You should see:

```
✅ Connected! Status: 200
✅ MCP Server initialized successfully!
✅ Received 7 tools: login, get_devices, get_device, ...
✅ Server is ready!
🎉 All checks passed!
```

### 5. Connect Your AI Agent

#### For Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "iot-cloud": {
      "url": "http://localhost:3001/api/mcp/sse"
    }
  }
}
```

Restart Claude Desktop, then try:

```
You: Login to my IoT account with email user@example.com and password mypassword
```

Claude will use the `login` tool to authenticate you!

## 📚 Next Steps

- **Read the [README.md](./README.md)** for full documentation
- **Check [API Documentation](http://localhost:3001/api/docs)** for available endpoints
- **Explore [MCP Protocol](./docs/MCP_PROTOCOL.md)** for technical details

## 🔧 Troubleshooting

### Server won't start

**Error:** `Cannot find module`

**Solution:**

```bash
rm -rf node_modules package-lock.json
npm install
```

### Cannot connect to IoT API

**Error:** `ECONNREFUSED`

**Solution:**

- Verify `IOT_API_BASE_URL` in `.env`
- Check your network/firewall settings
- Test API directly: `curl https://your-api-url/health`

### Test script fails

**Error:** `Connection error`

**Solution:**

- Make sure server is running: `npm run start:dev`
- Check port 3001 is not in use: `lsof -i :3001`

## 💡 Tips

1. **Use debug logging** during development:

   ```env
   LOG_LEVEL=debug
   ```

2. **Enable CORS** for web clients:

   ```env
   ENABLE_CORS=true
   CORS_ORIGINS=http://localhost:3000
   ```

3. **Increase rate limits** for testing:
   ```env
   RATE_LIMIT_MAX=1000
   ```

## ✅ You're Ready!

Your MCP server is now ready to bridge AI agents with your IoT devices!
