# Deploying to Render

This guide explains how to deploy the IoT Cloud MCP Bridge Server to Render for online testing with ChatGPT Actions.

## Prerequisites

- Render account (free tier available at https://render.com)
- Firebase service account JSON file
- IoT Cloud API credentials

## Deployment Steps

### 1. Prepare Your Repository

Render deploys directly from Git repositories (GitHub, GitLab, or Bitbucket). You have two options:

**Option A: Push to GitHub**

```bash
# Create a new repository on GitHub
# Then push the iot-cloud-mcp folder
cd iot-cloud-mcp
git init
git add .
git commit -m "Initial commit - MCP Bridge Server"
git remote add origin https://github.com/yourusername/iot-cloud-mcp.git
git push -u origin main
```

**Option B: Use existing repository**
If you plan to keep `iot-cloud-mcp` in the main repo temporarily for testing, Render can still deploy it.

### 2. Create Web Service on Render

1. **Log in to Render:** https://dashboard.render.com
2. **Click "New +"** → Select **"Web Service"**
3. **Connect your repository:**
   - Connect your GitHub/GitLab account
   - Select your repository
   - Click "Connect"

### 3. Configure Build Settings

Fill in the following settings:

| Setting            | Value                                              |
| ------------------ | -------------------------------------------------- |
| **Name**           | `iot-cloud-mcp-bridge` (or your preferred name)    |
| **Region**         | Choose closest to your users                       |
| **Branch**         | `main` (or your default branch)                    |
| **Root Directory** | `iot-cloud-mcp` (if using monorepo) or leave blank |
| **Runtime**        | `Node`                                             |
| **Build Command**  | `npm install && npm run build`                     |
| **Start Command**  | `npm run start:prod`                               |
| **Instance Type**  | `Free` (for testing) or `Starter` (for production) |

### 4. Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these variables one by one:

| Key                        | Value                                                   | Notes                                |
| -------------------------- | ------------------------------------------------------- | ------------------------------------ |
| `NODE_ENV`                 | `production`                                            |                                      |
| `PORT`                     | `3001`                                                  | Render auto-assigns, but we use 3001 |
| `HOST`                     | `0.0.0.0`                                               | Required for Render                  |
| `IOT_API_BASE_URL`         | `https://staging.openapi.rogo.com.vn/api/v2.0/iot-core` | Your IoT API URL                     |
| `IOT_API_KEY`              | `f6883470-bd95-4e23-9ee6-51e878386451`                  | Your IoT API key                     |
| `IOT_API_TIMEOUT`          | `30000`                                                 |                                      |
| `FIREBASE_SERVICE_ACCOUNT` | `{...your Firebase JSON...}`                            | **See below**                        |
| `ENABLE_CORS`              | `true`                                                  |                                      |
| `CORS_ORIGINS`             | `https://chat.openai.com,https://claude.ai`             | Add more as needed                   |
| `ENABLE_RATE_LIMIT`        | `true`                                                  |                                      |
| `RATE_LIMIT_MAX`           | `100`                                                   |                                      |
| `RATE_LIMIT_WINDOW`        | `60000`                                                 |                                      |
| `LOG_LEVEL`                | `info`                                                  | Use `debug` for troubleshooting      |

#### Firebase Service Account Setup

For the `FIREBASE_SERVICE_ACCOUNT` variable:

**Method 1: Use Environment Variable (Recommended for Render)**

1. Open your `firebase-service-account.json` file
2. Copy the **entire JSON content** (minify it to single line)
3. Paste into the `FIREBASE_SERVICE_ACCOUNT` environment variable

Example (minified):

```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "...",
  "auth_provider_x509_cert_url": "...",
  "client_x509_cert_url": "..."
}
```

**Method 2: Use File Path (Not recommended for Render)**

Render doesn't support uploading files directly, so using `FIREBASE_SERVICE_ACCOUNT_PATH` would require committing the file to Git (security risk). Use Method 1 instead.

### 5. Update Code for Firebase Environment Variable

The current code expects a file path, but we need to support the environment variable approach for Render.

**Update `src/auth/firebase-admin.service.ts`:**

Replace the `onModuleInit` method with:

```typescript
async onModuleInit() {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      this.logger.log('Firebase Admin SDK already initialized');
      return;
    }

    // Option 1: Use environment variable with JSON content
    const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.logger.log('Firebase Admin SDK initialized from environment variable');
      return;
    }

    // Option 2: Use file path
    const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.logger.log(`Firebase Admin SDK initialized from file: ${serviceAccountPath}`);
      return;
    }

    throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH');
  } catch (error) {
    this.logger.error('Failed to initialize Firebase Admin SDK', error);
    throw error;
  }
}
```

### 6. Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Run `npm install && npm run build`
   - Start the server with `npm run start:prod`
   - Assign a public URL like: `https://iot-cloud-mcp-bridge.onrender.com`

Watch the deployment logs in real-time on the Render dashboard.

### 7. Verify Deployment

Once deployed, test the endpoints:

**Health Check:**

```bash
curl https://your-app-name.onrender.com/api/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-02-11T08:43:00.000Z"
}
```

**API Documentation:**
Open in browser:

```
https://your-app-name.onrender.com/api/docs
```

**Test Authentication:**

```bash
curl -X POST https://your-app-name.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

### 8. Configure ChatGPT Actions

Once deployed and verified:

1. **Go to ChatGPT** → Create GPT → Configure → Actions
2. **Import Schema:**
   - URL: `https://your-app-name.onrender.com/api/docs-json`
3. **Configure Authentication:**
   - Type: `Bearer` token
   - Users will need to provide their Firebase token from the login endpoint

## Troubleshooting

### Build Fails

**Error:** `Cannot find module '@nestjs/config'`

**Solution:** Make sure the Build Command includes `npm install`:

```bash
npm install && npm run build
```

### Server Crashes on Start

**Error:** `Failed to initialize Firebase Admin SDK`

**Solution:**

- Verify `FIREBASE_SERVICE_ACCOUNT` contains valid JSON
- Check that all required fields are present in the Firebase JSON
- Make sure the JSON is properly minified (no extra newlines)

### CORS Errors

**Error:** `CORS policy blocked`

**Solution:**

- Add your domain to `CORS_ORIGINS` environment variable
- Restart the Render service after changing environment variables

### Rate Limit Issues

If you hit rate limits during testing:

**Solution:**

- Increase `RATE_LIMIT_MAX` environment variable
- Or disable rate limiting: `ENABLE_RATE_LIMIT=false`

### Port Conflicts

**Error:** `Port 3001 already in use`

**Solution:** Render automatically assigns ports. Make sure your code uses `process.env.PORT`:

```typescript
const port = process.env.PORT || 3001;
```

### Free Tier Sleep

Render free tier services sleep after 15 minutes of inactivity. The first request after sleeping takes ~30 seconds.

**Solution:**

- Upgrade to Starter (\$7/month) for always-on service
- Or use a service like UptimeRobot to ping your endpoint every 10 minutes

## Cost Estimate

| Plan         | Price      | Features                            |
| ------------ | ---------- | ----------------------------------- |
| **Free**     | \$0/month  | 750 hours/month, sleeps after 15min |
| **Starter**  | \$7/month  | Always on, better performance       |
| **Standard** | \$25/month | More resources, auto-scaling        |

For testing with ChatGPT Actions, the **Free tier is sufficient**.

## Security Notes

- ✅ Always use HTTPS in production (Render provides SSL automatically)
- ✅ Keep Firebase service account secure (use environment variables, not files in Git)
- ✅ Rotate API keys regularly
- ✅ Enable rate limiting in production
- ✅ Monitor logs for suspicious activity
- ⚠️ Never commit `.env` or `firebase-service-account.json` to Git
- ⚠️ Use secrets management for sensitive data

## Alternative: Using render.yaml

For automated deployments, create a `render.yaml` file in your repository:

```yaml
services:
  - type: web
    name: iot-cloud-mcp-bridge
    runtime: node
    region: oregon
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm run start:prod
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      - key: HOST
        value: 0.0.0.0
      - key: IOT_API_BASE_URL
        value: https://staging.openapi.rogo.com.vn/api/v2.0/iot-core
      - key: IOT_API_KEY
        sync: false # Set manually in dashboard (sensitive)
      - key: FIREBASE_SERVICE_ACCOUNT
        sync: false # Set manually in dashboard (sensitive)
      - key: ENABLE_CORS
        value: true
      - key: CORS_ORIGINS
        value: https://chat.openai.com,https://claude.ai
      - key: ENABLE_RATE_LIMIT
        value: true
      - key: LOG_LEVEL
        value: info
```

Then on Render:

1. Go to "New +" → "Blueprint"
2. Connect repository
3. Render will auto-detect `render.yaml`
4. Set sensitive environment variables manually in dashboard

## Next Steps

After successful deployment:

1. ✅ Test all endpoints with Postman/curl
2. ✅ Integrate with ChatGPT Actions
3. ✅ Monitor logs for errors
4. ✅ Set up custom domain (optional)
5. ✅ Configure monitoring/alerting

---

**Questions?** Check the main [README.md](./README.md) or open an issue.
