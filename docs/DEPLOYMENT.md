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
/opt/mcp/                          # MCP server — PRODUCTION
├── docker-compose.yml
├── .env
└── backups/

/opt/mcp-stag/                     # MCP server — STAGING
├── docker-compose.staging.yml
├── .env
└── backups/

/opt/rogo-agent/                   # rogo-agent — PRODUCTION
├── docker-compose.yml
└── .env                           # fill in secrets (never committed)

/opt/rogo-agent-stag/              # rogo-agent — STAGING
├── docker-compose.yml
└── .env                           # fill in secrets (never committed)
```

### Container Registry

- **Registry**: `ghcr.io/dadadadas111/iot-cloud-mcp`
- **MCP production tag**: `latest`
- **MCP staging tags**: `staging-pr-{N}`, `staging-{SHORT_SHA}`
- **rogo-agent production tag**: `agent-latest`
- **rogo-agent staging tags**: `agent-staging-{SHORT_SHA}`

### Services Per Environment

#### MCP Server

| Service         | Production                             | Staging                                        |
| --------------- | -------------------------------------- | ---------------------------------------------- |
| App container   | `iot-cloud-mcp`                        | `iot-cloud-mcp-staging`                        |
| Redis container | `iot-cloud-redis`                      | `iot-cloud-redis-staging`                      |
| App port        | 3001                                   | 3002                                           |
| Base URL        | `https://mcp.dash.id.vn`               | `https://mcp-stag.dash.id.vn`                  |
| Network         | `mcp_iot-network`                      | `mcp-stag_iot-network-staging`                 |

#### rogo-agent

| Service          | Production                          | Staging                                    |
| ---------------- | ----------------------------------- | ------------------------------------------ |
| Container        | `rogo-agent`                        | `rogo-agent-staging`                       |
| Redis            | shared `iot-cloud-redis` (DB 1)     | shared `iot-cloud-redis-staging` (DB 1)    |
| App port         | 8081 (host) → 8080 (container)      | 8080 (host) → 8080 (container)             |
| Public URL       | `https://agent.mcp.dash.id.vn`      | `https://agent.mcp-stag.dash.id.vn`        |
| WebSocket (Rogo) | `wss://agent.mcp.dash.id.vn/device/ws` | `wss://agent.mcp-stag.dash.id.vn/device/ws` |
| WebSocket (Xiaozhi compat) | `wss://agent.mcp.dash.id.vn/xiaozhi/ws` | `wss://agent.mcp-stag.dash.id.vn/xiaozhi/ws` |
| Network          | `mcp_iot-network` (external)        | `mcp-stag_iot-network-staging` (external)  |
| SSL cert         | `*.mcp.dash.id.vn`                  | `*.mcp-stag.dash.id.vn`                    |

### Other Services on VPS

- n8n: port 5678 (internal only) — do NOT interfere
- ds2api: port 6011 — do NOT interfere
- rogo-xiaozhi-bridge: no ports — legacy PoC bridge, keep running until agent demo is validated

---

## CI/CD Pipelines

### rogo-agent Production (`.github/workflows/agent-build.yml`)

**Trigger**: Push to `master`/`main` AND files changed under `apps/rogo-agent/**`

```
Push to master (agent files changed)
  → Build apps/rogo-agent/Dockerfile
  → Push ghcr.io/.../iot-cloud-mcp:agent-latest
  → SSH /opt/rogo-agent
  → docker compose down + up -d
  → https://agent.mcp.dash.id.vn
```

### rogo-agent Staging (`.github/workflows/agent-build-staging.yml`)

**Trigger**: PR labeled `deploy-agent-staging` (separate from `deploy-staging` which deploys MCP)

```
PR labeled deploy-agent-staging
  → Build apps/rogo-agent/Dockerfile
  → Push ghcr.io/.../iot-cloud-mcp:agent-staging-{SHORT_SHA}
  → SSH /opt/rogo-agent-stag
  → IMAGE_TAG=agent-staging-{SHA} docker compose up -d
  → https://agent.mcp-stag.dash.id.vn
```

**Note**: Both workflows use `paths:` filter so they only run when `apps/rogo-agent/**` or the workflow file itself changes. MCP server changes do not trigger agent builds and vice versa.

---

### MCP Server Production (`.github/workflows/docker-build.yml`)

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
