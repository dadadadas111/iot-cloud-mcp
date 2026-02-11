# ChatGPT Apps Integration Guide

This guide explains how to integrate your IoT Cloud MCP Bridge Server with ChatGPT Apps.

## Overview

ChatGPT Apps allow you to connect custom APIs to ChatGPT without using custom GPTs. Your server acts as the backend API that ChatGPT calls.

## Prerequisites

- ✅ Server deployed to a public URL (with HTTPS)
- ✅ OpenAPI/Swagger documentation available
- ✅ Authentication configured (Firebase or simple API key)

## Step 1: Deploy Your Server

Your server needs to be publicly accessible. Options:

### Option A: Render (Recommended)
```bash
# Follow guide in: docs/deployment/RENDER_DEPLOYMENT.md
# You'll get a public URL like: https://iot-cloud-mcp-xxxxx.onrender.com
```

### Option B: Docker on Cloud
```bash
# Push image to registry
docker push ghcr.io/YOUR_USERNAME/iot-cloud-mcp:latest

# Deploy with docker-compose on your server
docker-compose up -d
```

### Option C: Other Platforms
- Heroku, Railway, AWS, Azure, Google Cloud, etc.

## Step 2: Verify Your API is Accessible

Test your public URL:

```bash
# Health check
curl https://your-deployed-url.com/api/health

# Swagger docs (if needed)
curl https://your-deployed-url.com/api/docs
```

Response should be `200 OK`:
```json
{
  "status": "ok",
  "message": "Health check passed"
}
```

## Step 3: Get Your OpenAPI Spec

Your API documentation is auto-generated:

```
https://your-deployed-url.com/api/docs-json
```

This is the spec ChatGPT will use to understand your API.

## Step 4: Create ChatGPT App

### In OpenAI Dashboard:

1. Go to https://platform.openai.com/apps
2. Click **"Create new app"**
3. Fill in the form:

| Field | Value |
|-------|-------|
| **Name** | IoT Cloud Bridge |
| **Description** | Control and monitor IoT devices |
| **App Logo** | (optional) |
| **Server URL** | `https://your-deployed-url.com/api` |

## Step 5: Configure Authentication

### Option A: Simple API Key (Easiest)

1. In OpenAI App dashboard, go to **Authentication**
2. Select **"API Key"**
3. Header name: `X-API-Key`
4. Paste your API key

**Your server setup:**
```env
# In your .env or deployment config
API_KEY=your-secret-key-here
```

Then protect endpoints:
```typescript
// In your controller
@UseGuards(ApiKeyGuard)
@Get('devices')
getDevices() {
  return this.deviceService.findAll();
}
```

### Option B: Firebase Token (Recommended)

1. In OpenAI App dashboard, go to **Authentication**
2. Select **"Custom"**
3. Header name: `Authorization`
4. User gets a token from your `/api/auth/login` endpoint

**Flow:**
```
1. User logs in: POST https://your-url/api/auth/login
   Body: {"email": "user@example.com", "password": "pass"}
   
2. Gets token: {"access_token": "eyJhbGc...", ...}

3. Uses token: Authorization: Bearer eyJhbGc...
```

### Option C: OAuth (Enterprise)

1. Set up OAuth provider (Firebase or separate)
2. Configure in OpenAI dashboard with:
   - Client ID
   - Client Secret
   - Authorization URL
   - Token URL

## Step 6: Define Your API Schema

OpenAI reads from your Swagger docs at:
```
GET https://your-deployed-url.com/api/docs-json
```

Make sure all endpoints are properly documented with:
- ✅ Request/response examples
- ✅ Required parameters
- ✅ Authentication info

**Example endpoint:**
```typescript
@Get('devices')
@ApiOperation({ summary: 'Get all devices' })
@ApiResponse({ status: 200, type: [DeviceDto] })
@UseGuards(FirebaseAuthGuard)
async getDevices(@User() user: DecodedIdToken) {
  return this.deviceService.findByUser(user.uid);
}
```

## Step 7: Test the Connection

In OpenAI App editor:

1. Click **"Test"** button
2. Select an API endpoint
3. Fill in required parameters
4. Click **"Send"**

Should return `200` with your API response.

## Step 8: Publish Your App

Once testing works:

1. Click **"Create"** or **"Publish"**
2. App is now available to ChatGPT users
3. Users can enable it in ChatGPT settings

## Common Issues & Fixes

### "Failed to fetch API schema"

**Problem:** OpenAI can't reach your Swagger docs

**Solutions:**
```bash
# 1. Check CORS is enabled
curl -I https://your-url/api/docs-json

# Response should include:
# Access-Control-Allow-Origin: *

# 2. If not, check .env
ENABLE_CORS=true

# 3. Check server is running
curl https://your-url/api/health
```

### "Authentication failed"

**Problem:** Token/key not being sent correctly

**Solutions:**
```bash
# Test with API key
curl -H "X-API-Key: your-key" https://your-url/api/devices

# Test with token
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-url/api/devices

# Should return 200, not 401
```

### API returns 500 errors

**Check logs:**
```bash
# If on Render
# Go to Render dashboard → Logs tab

# If on Docker
docker-compose logs -f iot-cloud-mcp
```

### "Endpoint not found" or 404

**Problem:** OpenAI calling wrong URL

**Check:**
```bash
# Verify your API base path
curl https://your-url/api/devices

# NOT: https://your-url/api/api/devices
# NOT: https://your-url/devices
```

## Example: Full Setup Walkthrough

### 1. Deploy to Render
```bash
# Create .env with production values
NODE_ENV=production
IOT_API_BASE_URL=https://your-iot-api.com
IOT_API_KEY=your-api-key
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
ENABLE_CORS=true
CORS_ORIGINS=*
```

### 2. Deploy Docker image
```bash
# Push to GHCR
docker push ghcr.io/YOUR_USERNAME/iot-cloud-mcp:latest

# On Render: connect GitHub repo, auto-deploy
# URL: https://iot-cloud-mcp-xxxxx.onrender.com
```

### 3. Verify API works
```bash
# Get token
curl -X POST https://iot-cloud-mcp-xxxxx.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Use token to call API
TOKEN="eyJhbGc..."
curl -H "Authorization: Bearer $TOKEN" \
  https://iot-cloud-mcp-xxxxx.onrender.com/api/devices
```

### 4. Create OpenAI App
```
Name: IoT Cloud Bridge
Server URL: https://iot-cloud-mcp-xxxxx.onrender.com/api
Authentication: Bearer Token (Firebase)
```

### 5. Enable in ChatGPT
- Go to ChatGPT settings
- Find "IoT Cloud Bridge" app
- Click Enable
- Start using it!

## Usage Examples in ChatGPT

**Get all devices:**
> "Show me all my IoT devices"

ChatGPT will call:
```
GET /api/devices
Headers: Authorization: Bearer {user_token}
```

**Get device state:**
> "What's the current state of my living room light?"

ChatGPT will call:
```
GET /api/devices/{id}/state
Headers: Authorization: Bearer {user_token}
```

**Get groups:**
> "List all my device groups"

ChatGPT will call:
```
GET /api/groups
Headers: Authorization: Bearer {user_token}
```

## Security Best Practices

✅ **Always use HTTPS** - Never use `http://` URLs

✅ **Validate all inputs** - Even from ChatGPT

✅ **Rate limit requests** - Stop abuse
```env
ENABLE_RATE_LIMIT=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
```

✅ **Log API calls** - For debugging
```env
LOG_LEVEL=debug
```

✅ **Use strong authentication** - Firebase tokens are secure

✅ **Keep secrets safe** - Never expose API keys in logs

## Environment Variables for Production

```env
# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# API
IOT_API_BASE_URL=https://your-api.com
IOT_API_KEY=your-key
IOT_API_TIMEOUT=30000

# Firebase
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Security
ENABLE_CORS=true
CORS_ORIGINS=https://chat.openai.com,https://platform.openai.com
ENABLE_RATE_LIMIT=true
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
```

## Next Steps

1. Deploy your server to a public URL
2. Test endpoints manually with curl
3. Create app in OpenAI dashboard
4. Configure authentication
5. Test endpoints in app editor
6. Publish and share with users

## Support

- Check Render/deployment logs for errors
- Verify CORS headers: `curl -I https://your-url/api/health`
- Test auth: `curl -H "Authorization: Bearer TOKEN" https://your-url/api/devices`
- Review [main README](../../README.md) for API details
