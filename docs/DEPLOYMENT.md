# Deployment & Operations Runbook

> **Project**: iot-cloud-mcp
> **Last updated**: 2026-03-02

## Infrastructure

### VPS Server

| Property | Value                    |
| -------- | ------------------------ |
| IP       | `160.187.247.2`          |
| User     | `root`                   |
| SSH Port | `22`                     |
| OS       | Linux (Docker installed) |

### Directory Layout

```
/opt/mcp/                          # PRODUCTION
├── docker-compose.yml             # Production compose
├── .env                           # Production env vars
└── backups/                       # Created by deploy.sh

/opt/mcp-stag/                     # STAGING
├── docker-compose.staging.yml     # Staging compose
├── .env                           # Staging env vars
└── backups/                       # Created by deploy.sh
```

### Container Registry

- **Registry**: `ghcr.io/dadadadas111/iot-cloud-mcp`
- **Production tag**: `latest` (built from `main`/`master` branch)
- **Staging tags**: `staging-pr-{N}`, `staging-{SHORT_SHA}` (built from PRs to main)

### Services Per Environment

| Service         | Production                             | Staging                                        |
| --------------- | -------------------------------------- | ---------------------------------------------- |
| App container   | `iot-cloud-mcp`                        | `iot-cloud-mcp-staging`                        |
| Redis container | `iot-cloud-redis`                      | `iot-cloud-redis-staging`                      |
| App port        | 3001                                   | 3002                                           |
| Redis port      | 6379 (internal)                        | 6379 (internal, no host mapping)               |
| Base URL        | `https://mcp.dash.id.vn`               | `https://mcp-stag.dash.id.vn`                  |
| IoT API         | `https://openapi.rogo.com.vn/api/v2.0` | `https://staging.openapi.rogo.com.vn/api/v2.0` |
| Network         | `iot-network`                          | `iot-network-staging`                          |

### Other Services on VPS

The VPS also hosts n8n (workflow automation):

- n8n worker + main + postgres + redis on port 5678
- These are independent — do NOT interfere with them

---

## CI/CD Pipelines

The current workflows in `.github/workflows/` are scoped to MCP-related paths only.
Future sibling apps should get their own app-specific workflows, image tags, and VPS directories so unrelated changes do not trigger the MCP deploy pipeline.

### Production (`.github/workflows/docker-build.yml`)

**Trigger**: Push to `main` or `master` branch

```
Push to main → Build Docker image → Push to ghcr.io (tag: latest)
                                   → SSH to VPS
                                   → cd /opt/mcp
                                   → docker pull latest
                                   → docker compose down
                                   → docker compose up -d
                                   → Verify + show logs
```

**GitHub Secrets required**:

- `GITHUB_TOKEN` (auto-provided)
- `VPS_HOST` — Server IP
- `VPS_USERNAME` — SSH user
- `VPS_PASSWORD` — SSH password
- `VPS_PORT` — SSH port

### Staging (`.github/workflows/docker-build-staging.yml`)

**Trigger**: Pull request to `main` or `master`

```
PR to main → Build Docker image → Push to ghcr.io (tag: staging-{SHORT_SHA})
                                 → SSH to VPS
                                 → cd /opt/mcp-stag
                                 → docker pull staging-{SHA}
                                 → IMAGE_TAG=staging-{SHA} docker compose up -d
                                 → Verify + show logs
```

**Note**: Staging uses `${IMAGE_TAG}` variable in compose file, set at deploy time.

---

## Manual Deployment

### Using deploy.sh (Recommended)

```bash
# Preview (dry run)
DRY_RUN=1 ./scripts/deploy.sh all

# Sync docker-compose files to VPS (no restart)
./scripts/deploy.sh prod
./scripts/deploy.sh staging

# Sync and restart
./scripts/deploy.sh prod restart
./scripts/deploy.sh staging restart

# Deploy both environments
./scripts/deploy.sh all restart

# Rollback to previous backup
./scripts/deploy.sh rollback prod
./scripts/deploy.sh rollback staging
```

**What deploy.sh does**:

1. Checks SSH connectivity
2. Validates local compose file exists
3. Creates timestamped backup on VPS (`/opt/mcp/backups/YYYYMMDD_HHMMSS/`)
4. Copies compose file to VPS via SCP
5. Verifies remote files
6. (If `restart`) Pulls images, runs `docker compose up -d`, shows status

**Config**: Set `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_KEY` via env vars or `.deploy.env` file.

### Manual SSH

```bash
# SSH to VPS
ssh root@160.187.247.2

# Production
cd /opt/mcp
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=50 iot-cloud-mcp

# Staging
cd /opt/mcp-stag
docker compose -f docker-compose.staging.yml pull
IMAGE_TAG=staging-<sha> docker compose -f docker-compose.staging.yml up -d
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs --tail=50 iot-cloud-mcp-staging
```

---

## Redis Operations

### Connecting to Redis

```bash
# Production Redis
ssh root@160.187.247.2
docker exec -it iot-cloud-redis redis-cli

# Staging Redis
docker exec -it iot-cloud-redis-staging redis-cli
```

### Common Redis Commands

```redis
# List all MCP session keys
KEYS mcp:session:*

# Get a specific session
GET mcp:session:{projectApiKey}:{sessionId}

# List sessions for a project
SMEMBERS mcp:project-sessions:{projectApiKey}

# Check TTL on a session
TTL mcp:session:{projectApiKey}:{sessionId}

# Count total sessions
DBSIZE

# Flush all sessions (CAUTION: drops ALL keys in current DB)
FLUSHDB

# Monitor real-time commands
MONITOR
```

### Redis Key Schema

```
mcp:session:{projectApiKey}:{sessionId}      → JSON string (RedisSessionData)
mcp:project-sessions:{projectApiKey}         → SET of sessionId strings
```

Each session key has TTL = `MCP_SESSION_TTL` seconds (default 3600 = 1 hour).

---

## Troubleshooting

### App won't start

```bash
# Check container status
docker compose ps

# Check logs for errors
docker compose logs --tail=100 iot-cloud-mcp

# Common issues:
# - Missing .env vars (especially IOT_API_BASE_URL, REDIS_HOST)
# - Redis not ready (check depends_on)
# - Port conflict (3001 or 3002 already in use)
```

### Redis connection failed

```bash
# Check Redis is running
docker compose ps redis   # or redis-staging

# Check Redis logs
docker compose logs redis

# Verify REDIS_HOST in .env matches the service name
# Production: REDIS_HOST=redis
# Staging: REDIS_HOST=redis-staging

# Test connectivity from app container
docker exec -it iot-cloud-mcp sh -c "nc -zv redis 6379"
```

### Sessions not persisting

```bash
# Check Redis has data
docker exec -it iot-cloud-redis redis-cli KEYS "mcp:*"

# Check TTL
docker exec -it iot-cloud-redis redis-cli TTL "mcp:session:YOUR_KEY"

# If TTL is -2, key expired — check MCP_SESSION_TTL in .env

# Verify Redis volume exists (data survives restarts)
docker volume ls | grep redis-data
```

### CI/CD deploy failed

1. Check GitHub Actions logs for the failing step
2. Common issues:
   - **SSH timeout**: VPS unreachable — check firewall, IP
   - **Docker login failed**: `GITHUB_TOKEN` secret expired or wrong
   - **Compose up failed**: Bad compose syntax, missing env vars
   - **Image pull failed**: Wrong tag, registry auth issue
3. Manual recovery:
   ```bash
   ssh root@160.187.247.2
   cd /opt/mcp  # or /opt/mcp-stag
   docker compose logs --tail=50
   ```

### Rolling back a deployment

```bash
# Using deploy.sh
./scripts/deploy.sh rollback prod

# Manual rollback (if backups exist)
ssh root@160.187.247.2
ls /opt/mcp/backups/
cp /opt/mcp/backups/YYYYMMDD_HHMMSS/* /opt/mcp/
docker compose up -d

# If no backup, revert to previous Docker image
docker pull ghcr.io/dadadadas111/iot-cloud-mcp:main-<previous-sha>
# Update IMAGE_TAG or tag as :latest, then restart
```

---

## Environment Variable Reference

### Production (.env at /opt/mcp/)

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
IOT_API_BASE_URL=https://openapi.rogo.com.vn/api/v2.0
IOT_API_TIMEOUT=30000
BASE_URL=https://mcp.dash.id.vn
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
MCP_SESSION_TTL=3600
ENABLE_CORS=true
CORS_ORIGINS=*
LOG_LEVEL=info
```

### Staging (.env at /opt/mcp-stag/)

```env
NODE_ENV=staging
PORT=3002
HOST=0.0.0.0
IOT_API_BASE_URL=https://staging.openapi.rogo.com.vn/api/v2.0
IOT_API_TIMEOUT=30000
BASE_URL=https://mcp-stag.dash.id.vn
REDIS_HOST=redis-staging
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
MCP_SESSION_TTL=3600
ENABLE_CORS=true
CORS_ORIGINS=*
LOG_LEVEL=debug
```

---

## Docker Image

**Dockerfile** (node:18-alpine):

1. Copy `package*.json`, run `npm install --production=false`
2. Copy source, run `npm run build` (NestJS → dist/)
3. Prune dev dependencies (`npm prune --production`)
4. Create non-root user `nestjs:nodejs`
5. Expose port 3001
6. CMD: `node dist/main`

**Build locally**:

```bash
docker build -t iot-cloud-mcp:local .
docker run -p 3001:3001 --env-file .env iot-cloud-mcp:local
```
