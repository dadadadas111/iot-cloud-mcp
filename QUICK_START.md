# 🚀 Quick Start Checklist - IoT Cloud MCP Bridge

Use this checklist to test and deploy your MCP bridge server.

---

## ✅ Current Status

- [x] Project created and dependencies installed
- [x] Build passes successfully (`npm run build`)
- [x] Authentication system implemented (Firebase JWT)
- [x] MVP API endpoints implemented (definitions, locations, groups, devices, state)
- [x] Documentation complete (README, setup guide, deployment guide)
- [x] Ready for testing and deployment

---

## 📋 Next Steps

### Step 1: Get Firebase Credentials 🔐

**What you need:** `firebase-service-account.json`

**How to get it:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (gear icon) → **Service Accounts**
4. Click **"Generate New Private Key"**
5. Download the JSON file
6. Save it as `firebase-service-account.json` in the `iot-cloud-mcp/` folder

**Security Note:** ⚠️ This file contains sensitive credentials. Never commit it to Git!

---

### Step 2: Test Locally 🧪

**2.1 Start the server:**

```bash
cd iot-cloud-mcp
npm run start:dev
```

You should see:

```
[Nest] INFO  [NestApplication] Nest application successfully started
[Nest] INFO  [main] Application is running on: http://localhost:3001
```

**2.2 Test health endpoint:**

```bash
curl http://localhost:3001/api/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-02-11T..."
}
```

**2.3 Test Swagger docs:**

Open in browser: http://localhost:3001/api/docs

You should see the full API documentation.

**2.4 Test authentication:**

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "YOUR_EMAIL",
    "password": "YOUR_PASSWORD"
  }'
```

Expected response:

```json
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "refresh_token": "AMf-vBw...",
  "expires_in": 3600
}
```

Save the `access_token` for next steps.

**2.5 Test protected endpoints:**

```bash
# Replace TOKEN with your access_token from step 2.4
TOKEN="eyJhbGci..."

# Get entity definitions (public endpoint)
curl http://localhost:3001/api/definitions

# Get your locations
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/locations

# Get your groups
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/groups

# Get your devices
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/devices

# Get specific device (replace DEVICE_ID)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/devices/DEVICE_ID

# Get device state (replace DEVICE_ID)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/devices/DEVICE_ID/state
```

---

### Step 3: Deploy to Render 🚀

**3.1 Push code to GitHub:**

If you haven't already:

```bash
cd iot-cloud-mcp
git init
git add .
git commit -m "Initial commit - IoT Cloud MCP Bridge Server"
git remote add origin https://github.com/YOUR_USERNAME/iot-cloud-mcp.git
git push -u origin main
```

**3.2 Create Render Web Service:**

Follow the detailed guide in [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)

Quick summary:

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start:prod`
   - **Root Directory:** Leave blank (or `iot-cloud-mcp` if monorepo)

**3.3 Add environment variables:**

In Render dashboard, add all these environment variables:

| Variable                   | Value                                                   |
| -------------------------- | ------------------------------------------------------- |
| `NODE_ENV`                 | `production`                                            |
| `PORT`                     | `3001`                                                  |
| `HOST`                     | `0.0.0.0`                                               |
| `IOT_API_BASE_URL`         | `https://staging.openapi.rogo.com.vn/api/v2.0/iot-core` |
| `IOT_API_KEY`              | `xxx`                  |
| `IOT_API_TIMEOUT`          | `30000`                                                 |
| `FIREBASE_SERVICE_ACCOUNT` | Paste entire JSON content (minified to single line)     |
| `ENABLE_CORS`              | `true`                                                  |
| `CORS_ORIGINS`             | `https://chat.openai.com,https://claude.ai`             |
| `ENABLE_RATE_LIMIT`        | `true`                                                  |
| `RATE_LIMIT_MAX`           | `100`                                                   |
| `LOG_LEVEL`                | `info`                                                  |

**Important:** For `FIREBASE_SERVICE_ACCOUNT`, copy the entire content of your `firebase-service-account.json` file and minify it to a single line.

**3.4 Deploy:**

Click **"Create Web Service"** and wait for deployment to complete (2-3 minutes).

You'll get a URL like: `https://iot-cloud-mcp-bridge.onrender.com`

**3.5 Test deployed endpoints:**

```bash
# Replace YOUR_APP_URL with your Render URL
curl https://YOUR_APP_URL.onrender.com/api/health

# Test login
curl -X POST https://YOUR_APP_URL.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "YOUR_EMAIL",
    "password": "YOUR_PASSWORD"
  }'

# Open Swagger docs in browser
# https://YOUR_APP_URL.onrender.com/api/docs
```

---

### Step 4: Integrate with ChatGPT 🤖

**4.1 Create a GPT:**

1. Go to ChatGPT → Explore GPTs → **"Create"**
2. Configure the GPT settings

**4.2 Add Actions:**

1. Go to **"Configure"** → **"Actions"** → **"Create new action"**
2. Click **"Import from URL"**
3. Paste your OpenAPI schema URL:
   ```
   https://YOUR_APP_URL.onrender.com/api/docs-json
   ```
4. ChatGPT will auto-import all endpoints

**4.3 Configure Authentication:**

Currently, users need to:

1. Login via `/api/auth/login` to get a token
2. Provide the token when using the GPT

**Future improvement:** You can set up OAuth flow for automatic authentication.

**4.4 Test the GPT:**

Ask ChatGPT questions like:

- "What are my locations?"
- "Show me all my devices"
- "What's the current state of device ABC123?"
- "List all groups in location XYZ"

---

## 🐛 Troubleshooting

### Local Testing Issues

**Error:** `Failed to initialize Firebase Admin SDK`

**Solution:**

- Check that `firebase-service-account.json` exists in `iot-cloud-mcp/` folder
- Verify the JSON file is valid (not corrupted)
- Check file permissions

**Error:** `Cannot connect to IoT API`

**Solution:**

- Verify `IOT_API_BASE_URL` in `.env` is correct
- Check `IOT_API_KEY` is valid
- Test the IoT API directly:
  ```bash
  curl -H "x-header-apikey: YOUR_KEY" \
    https://staging.openapi.rogo.com.vn/api/v2.0/iot-core/health
  ```

**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:**

- Another process is using port 3001
- Change port in `.env`: `PORT=3002`
- Or kill the process: `npx kill-port 3001`

### Deployment Issues

**Error:** Build fails on Render

**Solution:**

- Check build logs in Render dashboard
- Make sure Build Command is: `npm install && npm run build`
- Verify `package.json` has all dependencies

**Error:** Server crashes on startup

**Solution:**

- Check "Logs" tab in Render dashboard
- Common issues:
  - Missing `FIREBASE_SERVICE_ACCOUNT` environment variable
  - Invalid Firebase JSON format
  - Missing required environment variables

**Error:** CORS errors from ChatGPT

**Solution:**

- Add `https://chat.openai.com` to `CORS_ORIGINS`
- Restart Render service after changing environment variables

---

## 📚 Documentation Reference

| File                      | Purpose                       |
| ------------------------- | ----------------------------- |
| `README.md`               | Main documentation            |
| `SETUP_CHECKLIST.md`      | Step-by-step setup            |
| `RENDER_DEPLOYMENT.md`    | Detailed deployment guide     |
| `IMPLEMENTATION_NOTES.md` | Session progress & AI prompts |
| `SESSION_SUMMARY.md`      | Complete session overview     |

---

## ✅ Success Indicators

You'll know everything is working when:

- ✅ Local server starts without errors
- ✅ Health check returns `{"status": "ok"}`
- ✅ Swagger docs load at `/api/docs`
- ✅ Login returns a Firebase token
- ✅ Protected endpoints work with token
- ✅ Render deployment succeeds
- ✅ ChatGPT can call your endpoints

---

## 🎯 What to Do After Success

1. **Monitor:** Watch Render logs for any errors
2. **Test thoroughly:** Try all endpoints with different data
3. **Secure:** Review environment variables, rotate keys if needed
4. **Extend:** Add POST/PATCH/DELETE operations if needed
5. **Document:** Add custom instructions for ChatGPT GPT
6. **Share:** Test with other users

---

## 💡 Tips

- **Free Tier Sleep:** Render free tier sleeps after 15 minutes of inactivity. First request takes ~30 seconds.
- **Keep logs:** Save successful curl commands for quick testing
- **Version control:** Commit working versions before making changes
- **Backup credentials:** Keep Firebase service account JSON in a secure location

---

**Need help?** Check the documentation files or open an issue!

🎉 **Good luck with your deployment!**
