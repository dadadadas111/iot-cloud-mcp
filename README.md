# IoT Cloud MCP Bridge Server

A Model Context Protocol (MCP) bridge server for the IoT Cloud REST API, enabling AI assistants like ChatGPT and Claude to interact with your IoT infrastructure.

## Features

- 🔐 **Firebase Authentication** - Secure login flow with Firebase tokens
- 🌐 **REST API** - ChatGPT Actions-compatible endpoints
- 📡 **MCP Protocol Support** - Native MCP resources and tools (planned)
- 🚀 **Production Ready** - Built with NestJS, TypeScript, and Docker
- 📊 **API Documentation** - Auto-generated Swagger/OpenAPI specs
- 🔒 **Rate Limiting** - Protect against abuse
- 🌍 **CORS Enabled** - Works with web-based AI tools

## Architecture

```
┌─────────────────────────────────┐
│   ChatGPT / Claude (Online)     │
└───────────┬─────────────────────┘
            │ HTTP/REST + JWT Auth
┌───────────▼─────────────────────┐
│   MCP Bridge Server (This repo) │
│   - Authentication (Firebase)   │
│   - API Client (Proxy)          │
│   - REST Endpoints              │
└───────────┬─────────────────────┘
            │ HTTP/REST + Firebase Token
┌───────────▼─────────────────────┐
│   IoT Cloud REST API            │
│   (Your Existing Backend)       │
└─────────────────────────────────┘
```

## Prerequisites

- Node.js 18+ and npm/yarn
- Firebase service account JSON file
- Access to IoT Cloud REST API

## Installation

1. **Clone and install dependencies:**

```bash
cd iot-cloud-mcp
npm install
```

2. **Configure environment variables:**

Create `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Server
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# IoT Cloud REST API
IOT_API_BASE_URL=https://staging.openapi.rogo.com.vn/api/v2.0/iot-core
IOT_API_KEY=your-api-key-here
IOT_API_TIMEOUT=30000

# Firebase Admin SDK
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

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

3. **Add Firebase service account:**

Place your `firebase-service-account.json` in the project root, or set the `FIREBASE_SERVICE_ACCOUNT` environment variable with the JSON content.

## Running the Server

### Development Mode

```bash
npm run start:dev
```

Server runs at `http://localhost:3001`

### Production Mode

```bash
npm run build
npm run start:prod
```

## API Documentation

Once running, access Swagger documentation at:

- **Swagger UI:** http://localhost:3001/api/docs
- **OpenAPI JSON:** http://localhost:3001/api/docs-json

## Authentication Flow

### 1. Login

**Endpoint:** `POST /api/auth/login`

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'
```

**Response:**

```json
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "refresh_token": "AMf-vBw...",
  "expires_in": 3600
}
```

### 2. Use Token

Include the `access_token` in subsequent requests:

```bash
curl -X GET http://localhost:3001/api/health \
  -H "Authorization: Bearer eyJhbGci..."
```

### 3. Refresh Token

**Endpoint:** `POST /api/auth/refresh`

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "AMf-vBw..."
  }'
```

## ChatGPT Actions Integration

### Setup Steps

1. **Go to ChatGPT** → Create GPT → Configure → Actions

2. **Import Schema:**

   - Click "Import from URL"
   - Enter: `http://your-deployment-url/api/docs-json`

3. **Configure Authentication:**

   - Authentication Type: **OAuth** or **API Key**
   - For simplified flow, use custom headers:
     - Header: `Authorization`
     - Value: `Bearer {user_token}`

4. **Test:** Use the "Test" button in ChatGPT Actions UI

### Example GPT Configuration

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "IoT Cloud MCP Bridge",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://your-deployment-url.com/api"
    }
  ]
}
```

## Project Structure

```
iot-cloud-mcp/
├── src/
│   ├── main.ts                      # Application entry point
│   ├── app.module.ts                # Root module
│   ├── auth/                        # Authentication module
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts       # Login/refresh endpoints
│   │   ├── auth.service.ts          # Auth logic
│   │   ├── firebase-admin.service.ts # Firebase SDK wrapper
│   │   ├── firebase.strategy.ts     # Passport strategy
│   │   └── firebase-auth.guard.ts   # Auth guard
│   ├── services/
│   │   └── api-client.service.ts    # HTTP client for IoT API
│   ├── shared/
│   │   └── decorators/
│   │       └── user.decorator.ts    # User context extractor
│   └── health.controller.ts         # Health check endpoint
├── .env                             # Environment variables (not in git)
├── .env.example                     # Environment template
├── firebase-service-account.json    # Firebase credentials (not in git)
├── package.json
├── tsconfig.json
└── README.md
```

## Development Roadmap

- [x] Project setup and configuration
- [x] Firebase authentication
- [x] API client service
- [x] Health check endpoint
- [ ] MCP resources (Partner, Project, Device, Location, Group)
- [ ] MCP tools (CRUD operations)
- [ ] REST API controllers for ChatGPT Actions
- [ ] Docker configuration
- [ ] Deployment guides (Railway, Render, Heroku)

## API Endpoints

### Authentication

| Method | Endpoint            | Description               | Auth Required |
| ------ | ------------------- | ------------------------- | ------------- |
| POST   | `/api/auth/login`   | Login with email/password | ❌            |
| POST   | `/api/auth/refresh` | Refresh access token      | ❌            |

### Health

| Method | Endpoint      | Description  | Auth Required |
| ------ | ------------- | ------------ | ------------- |
| GET    | `/api/health` | Health check | ❌            |

## Environment Variables

| Variable                        | Required  | Default       | Description                |
| ------------------------------- | --------- | ------------- | -------------------------- |
| `NODE_ENV`                      | No        | `development` | Environment mode           |
| `PORT`                          | No        | `3001`        | Server port                |
| `HOST`                          | No        | `0.0.0.0`     | Server host                |
| `IOT_API_BASE_URL`              | **Yes**   | -             | IoT Cloud API base URL     |
| `IOT_API_KEY`                   | **Yes**   | -             | IoT Cloud API key          |
| `IOT_API_TIMEOUT`               | No        | `30000`       | API request timeout (ms)   |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | **Yes\*** | -             | Path to Firebase JSON file |
| `FIREBASE_SERVICE_ACCOUNT`      | **Yes\*** | -             | Firebase JSON as string    |
| `ENABLE_CORS`                   | No        | `true`        | Enable CORS                |
| `CORS_ORIGINS`                  | No        | `*`           | Allowed CORS origins       |
| `ENABLE_RATE_LIMIT`             | No        | `true`        | Enable rate limiting       |
| `RATE_LIMIT_MAX`                | No        | `100`         | Max requests per window    |
| `RATE_LIMIT_WINDOW`             | No        | `60000`       | Rate limit window (ms)     |
| `LOG_LEVEL`                     | No        | `info`        | Logging level              |

\*_Either `FIREBASE_SERVICE_ACCOUNT_PATH` OR `FIREBASE_SERVICE_ACCOUNT` is required._

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Deployment

### Docker

```bash
# Build image
docker build -t iot-cloud-mcp .

# Run container
docker run -p 3001:3001 --env-file .env iot-cloud-mcp
```

### Railway

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Deploy: `railway up`
5. Set environment variables in Railway dashboard

### Render

1. Connect your GitHub repository
2. Create new Web Service
3. Build command: `npm install && npm run build`
4. Start command: `npm run start:prod`
5. Add environment variables in Render dashboard

## Security Considerations

- ✅ Firebase tokens are verified on every request
- ✅ Rate limiting prevents abuse
- ✅ CORS restricts origins
- ✅ Sensitive data not logged
- ⚠️ Always use HTTPS in production
- ⚠️ Keep Firebase service account secure
- ⚠️ Rotate API keys regularly

## Troubleshooting

### Firebase Authentication Fails

**Issue:** `Failed to initialize Firebase Admin SDK`

**Solution:**

- Verify `firebase-service-account.json` exists and is valid JSON
- Check `FIREBASE_SERVICE_ACCOUNT_PATH` points to correct file
- Ensure service account has necessary permissions

### Cannot Connect to IoT API

**Issue:** `Cannot connect to IoT API`

**Solution:**

- Verify `IOT_API_BASE_URL` is correct
- Check `IOT_API_KEY` is valid
- Test API directly: `curl -H "x-header-apikey: YOUR_KEY" https://api-url/health`

### CORS Errors

**Issue:** `CORS policy blocked`

**Solution:**

- Add your domain to `CORS_ORIGINS`
- Restart server after changing `.env`
- Check browser console for exact origin

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit pull request

## License

MIT

## Support

For issues and questions:

- Open an issue on GitHub
- Email: support@yourcompany.com

## Changelog

### Version 1.0.0 (2025-02-11)

- ✅ Initial release
- ✅ Firebase authentication
- ✅ API client service
- ✅ Swagger documentation
- ✅ Health check endpoint
