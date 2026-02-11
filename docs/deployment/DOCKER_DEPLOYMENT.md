# Docker Deployment Guide

This guide covers deploying the IoT Cloud MCP Bridge Server using Docker and Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Manual Docker Deployment](#manual-docker-deployment)
- [CI/CD with GitHub Actions](#cicd-with-github-actions)
- [Production Considerations](#production-considerations)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker Engine 20.10+ or Docker Desktop
- Docker Compose v2.0+ (included with Docker Desktop)
- Git (for CI/CD setup)
- Access to Firebase service account credentials
- IoT Cloud API credentials

## Quick Start

The fastest way to get running:

```bash
# 1. Clone the repository
git clone <repository-url>
cd iot-cloud-mcp

# 2. Create environment file
cp .env.example .env

# 3. Edit .env with your credentials
# Important: Set FIREBASE_SERVICE_ACCOUNT with inline JSON for Docker
nano .env

# 4. Start the container
docker-compose up -d

# 5. Check logs
docker-compose logs -f

# 6. Access the API
curl http://localhost:3001/api/health
```

## Docker Compose Deployment

### Configuration

The `docker-compose.yml` file is pre-configured with:

- ✅ Health checks
- ✅ Automatic restarts
- ✅ Log rotation
- ✅ Network isolation
- ✅ Environment variable injection

### Basic Commands

```bash
# Start services in background
docker-compose up -d

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f iot-cloud-mcp

# Stop services
docker-compose stop

# Stop and remove containers
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Check service status
docker-compose ps
```

### Using Firebase Service Account

**Option 1: Inline JSON (Recommended for Docker)**

In your `.env` file:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n..."}
```

**Option 2: Volume Mount**

Uncomment the volumes section in `docker-compose.yml`:

```yaml
volumes:
  - ./firebase-service-account.json:/app/firebase-service-account.json:ro
```

Update `.env`:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/app/firebase-service-account.json
```

### Environment Variables

All environment variables from `.env` are passed to the container. Key variables:

```env
# Server
NODE_ENV=production
PORT=3001

# API Credentials
IOT_API_BASE_URL=https://your-api-url.com
IOT_API_KEY=your-api-key

# Firebase (use inline JSON for Docker)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# CORS
CORS_ORIGINS=https://chat.openai.com,https://claude.ai

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
```

## Manual Docker Deployment

### Building the Image

```bash
# Build with default tag
docker build -t iot-cloud-mcp .

# Build with custom tag
docker build -t iot-cloud-mcp:v1.0.0 .

# Build for specific platform
docker build --platform linux/amd64 -t iot-cloud-mcp .
```

### Running the Container

**Using .env file:**

```bash
docker run -d \
  --name iot-cloud-mcp \
  -p 3001:3001 \
  --env-file .env \
  --restart unless-stopped \
  iot-cloud-mcp
```

**Using inline environment variables:**

```bash
docker run -d \
  --name iot-cloud-mcp \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e HOST=0.0.0.0 \
  -e IOT_API_BASE_URL=https://api.example.com \
  -e IOT_API_KEY=your-api-key \
  -e FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' \
  -e ENABLE_CORS=true \
  -e CORS_ORIGINS="https://chat.openai.com,https://claude.ai" \
  -e RATE_LIMIT_MAX=100 \
  --restart unless-stopped \
  iot-cloud-mcp
```

**With Firebase service account file:**

```bash
docker run -d \
  --name iot-cloud-mcp \
  -p 3001:3001 \
  -v $(pwd)/firebase-service-account.json:/app/firebase-service-account.json:ro \
  -e FIREBASE_SERVICE_ACCOUNT_PATH=/app/firebase-service-account.json \
  -e IOT_API_BASE_URL=https://api.example.com \
  -e IOT_API_KEY=your-api-key \
  --env-file .env \
  --restart unless-stopped \
  iot-cloud-mcp
```

### Managing the Container

```bash
# View logs
docker logs -f iot-cloud-mcp

# Check health status
docker inspect --format='{{.State.Health.Status}}' iot-cloud-mcp

# Execute command in container
docker exec -it iot-cloud-mcp sh

# Stop container
docker stop iot-cloud-mcp

# Start container
docker start iot-cloud-mcp

# Remove container
docker rm -f iot-cloud-mcp

# View resource usage
docker stats iot-cloud-mcp
```

## CI/CD with GitHub Actions

The project includes an automated CI/CD pipeline that builds and publishes Docker images.

### Features

- ✅ Automated testing on every push/PR
- ✅ Docker image building for `master`/`main` branch
- ✅ Multi-architecture support (amd64, arm64)
- ✅ Automatic versioning from git tags
- ✅ Push to GitHub Container Registry (GHCR)
- ✅ Build caching for faster builds

### Setup

The workflow is already configured in `.github/workflows/docker-build.yml`. GitHub automatically provides authentication for GHCR.

### Using Pre-built Images

Once CI/CD is running, pull images from GHCR:

```bash
# Login to GHCR (one-time setup)
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull latest image
docker pull ghcr.io/YOUR_USERNAME/iot-cloud-mcp:latest

# Pull specific version
docker pull ghcr.io/YOUR_USERNAME/iot-cloud-mcp:v1.0.0

# Run the image
docker run -d \
  --name iot-cloud-mcp \
  -p 3001:3001 \
  --env-file .env \
  ghcr.io/YOUR_USERNAME/iot-cloud-mcp:latest
```

### Image Tags

The CI/CD pipeline creates the following tags:

- `latest` - Latest build from master/main branch
- `main` or `master` - Branch name
- `v1.0.0` - Semantic version from git tags
- `v1.0` - Major.minor version
- `v1` - Major version
- `main-abc1234` - Branch + commit SHA

### Triggering Builds

**Push to master/main:**

```bash
git add .
git commit -m "Update code"
git push origin master
```

**Create version release:**

```bash
# Create and push a version tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### Optional: Docker Hub Integration

To also push to Docker Hub:

1. Create Docker Hub access token at https://hub.docker.com/settings/security
2. Add GitHub repository secrets:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: Your access token
3. Uncomment Docker Hub login section in `.github/workflows/docker-build.yml`

## Production Considerations

### Security

**Environment Variables:**

- ✅ Never commit `.env` file or `firebase-service-account.json`
- ✅ Use Docker secrets for sensitive data in production
- ✅ Rotate API keys and tokens regularly
- ✅ Use read-only volumes where possible

**Container Security:**

- ✅ Runs as non-root user (`nestjs`)
- ✅ Minimal Alpine Linux base image
- ✅ Multi-stage build reduces attack surface
- ✅ Health checks enabled

**Network Security:**

```yaml
# Example: Using Docker secrets and private networks
services:
  iot-cloud-mcp:
    secrets:
      - firebase_credentials
      - api_key
    networks:
      - internal
      - external

networks:
  internal:
    internal: true
  external:

secrets:
  firebase_credentials:
    file: ./firebase-service-account.json
  api_key:
    external: true
```

### Performance

**Resource Limits:**

Add to `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

**Scaling:**

```bash
# Scale to multiple instances
docker-compose up -d --scale iot-cloud-mcp=3

# Use with reverse proxy (nginx, traefik) for load balancing
```

### Monitoring

**Health Checks:**

```bash
# Check container health
docker inspect --format='{{json .State.Health}}' iot-cloud-mcp | jq

# Access health endpoint directly
curl http://localhost:3001/api/health
```

**Logs:**

```bash
# View logs with timestamps
docker-compose logs -f -t

# Export logs
docker logs iot-cloud-mcp > app.log 2>&1

# Use logging driver for centralized logging
# Update docker-compose.yml:
logging:
  driver: "syslog"
  options:
    syslog-address: "tcp://log-server:514"
```

**Monitoring Tools:**

- **Portainer**: Container management UI
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **ELK Stack**: Log aggregation

### Backup and Recovery

**Backup Configuration:**

```bash
# Backup environment configuration
cp .env .env.backup
cp firebase-service-account.json firebase-service-account.json.backup

# Export container config
docker inspect iot-cloud-mcp > container-config.json
```

**Quick Recovery:**

```bash
# Stop and remove current container
docker-compose down

# Pull latest image
docker-compose pull

# Start with fresh container
docker-compose up -d
```

## Troubleshooting

### Container Won't Start

**Check logs:**

```bash
docker-compose logs iot-cloud-mcp
```

**Common issues:**

1. **Missing environment variables:**
   ```
   Error: FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH required
   ```
   Solution: Set Firebase credentials in `.env`

2. **Port already in use:**
   ```
   Error: bind: address already in use
   ```
   Solution: Change PORT in `.env` or stop conflicting service

3. **Firebase credentials invalid:**
   ```
   Error: Failed to initialize Firebase Admin SDK
   ```
   Solution: Verify JSON format and service account permissions

### Health Check Failures

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' iot-cloud-mcp

# View health check logs
docker inspect --format='{{json .State.Health}}' iot-cloud-mcp | jq

# Test health endpoint manually
docker exec iot-cloud-mcp wget -q -O- http://localhost:3001/api/health
```

### Performance Issues

```bash
# Check resource usage
docker stats iot-cloud-mcp

# Check container processes
docker top iot-cloud-mcp

# Access container shell
docker exec -it iot-cloud-mcp sh
```

### Build Failures

**Clear cache and rebuild:**

```bash
docker-compose build --no-cache
docker-compose up -d
```

**Check Dockerfile syntax:**

```bash
docker build --progress=plain -t iot-cloud-mcp .
```

### Network Issues

```bash
# Inspect networks
docker network ls
docker network inspect iot-cloud-mcp_iot-network

# Test connectivity from container
docker exec iot-cloud-mcp ping -c 3 google.com
docker exec iot-cloud-mcp wget -q -O- https://staging.openapi.rogo.com.vn
```

### Image Pull Issues

**Authentication required:**

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Or use Docker Hub
docker login
```

**Verify image exists:**

```bash
# Check available tags
docker search ghcr.io/YOUR_USERNAME/iot-cloud-mcp
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## Support

For issues specific to Docker deployment:

1. Check this guide first
2. Review [main README](../../README.md)
3. Check GitHub Issues
4. Review Docker logs: `docker-compose logs -f`
