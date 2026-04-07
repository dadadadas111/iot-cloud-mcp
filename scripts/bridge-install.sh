#!/usr/bin/env bash
set -e

# ─── Colors ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${BLUE}${BOLD}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}! $1${NC}"; }
die()  { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ─── Header ───────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Rogo IoT × Xiaozhi AI — Bridge Installer${NC}"
echo -e "Connect your Xiaozhi AI to Rogo IoT via MCP.\n"

# ─── Check Docker ─────────────────────────────────────────────────────────────
step "Checking Docker"
command -v docker &>/dev/null || die "Docker is not installed. Get it at: https://docs.docker.com/get-docker/"
docker info &>/dev/null        || die "Docker daemon is not running. Please start Docker first."
ok "Docker OK"

# ─── Collect credentials ──────────────────────────────────────────────────────
step "Enter configuration"
echo -e "(Xiaozhi endpoint: ${BOLD}xiaozhi.me${NC} → Agent → Get MCP Endpoint)"
echo -e "(Rogo MCP URL: ${BOLD}iot.rogo.com.vn${NC} (or iot-stag.rogo.com.vn for staging) → Project → Cloud Service → MCP Service)\n"

read -rp "  Xiaozhi MCP endpoint  : " XIAOZHI_ENDPOINT
[[ "$XIAOZHI_ENDPOINT" == wss://* ]] || die "Endpoint must start with wss://"

read -rp "  Rogo MCP URL          : " ROGO_MCP_URL
[[ "$ROGO_MCP_URL" == https://* ]] || die "URL must start with https://"

read -rp "  Rogo email            : " ROGO_EMAIL
read -rsp "  Rogo password         : " ROGO_PASSWORD
echo ""

# ─── Create directory ─────────────────────────────────────────────────────────
INSTALL_DIR="$HOME/rogo-xiaozhi-bridge"
step "Creating directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
ok "Directory ready"

# ─── Write requirements.txt ───────────────────────────────────────────────────
step "Writing bridge files"
cat > requirements.txt << 'REQEOF'
mcp
httpx
python-dotenv
websockets
REQEOF

# ─── Write Dockerfile ─────────────────────────────────────────────────────────
cat > Dockerfile << 'DFEOF'
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
CMD ["python", "bridge.py"]
DFEOF

# ─── Write docker-compose.yml ─────────────────────────────────────────────────
cat > docker-compose.yml << 'DCEOF'
services:
  rogo-xiaozhi-bridge:
    build: .
    container_name: rogo-xiaozhi-bridge
    restart: unless-stopped
    env_file: .env
    environment:
      - PYTHONUNBUFFERED=1
DCEOF

# ─── Write bridge.py ──────────────────────────────────────────────────────────
cat > bridge.py << 'BRIDGEOF'
#!/usr/bin/env python3
import asyncio, base64, hashlib, os, secrets, subprocess, sys, time
from urllib.parse import urlparse, parse_qs
import httpx
from dotenv import load_dotenv

load_dotenv()

XIAOZHI_ENDPOINT = os.environ["XIAOZHI_ENDPOINT"]
ROGO_MCP_URL     = os.environ["ROGO_MCP_URL"]
ROGO_EMAIL       = os.environ["ROGO_EMAIL"]
ROGO_PASSWORD    = os.environ["ROGO_PASSWORD"]


def _pkce():
    v = base64.urlsafe_b64encode(os.urandom(48)).rstrip(b"=").decode()
    c = base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b"=").decode()
    return v, c


async def _login():
    v, c = _pkce()
    state = secrets.token_urlsafe(16)
    async with httpx.AsyncClient(follow_redirects=False, timeout=30) as client:
        r = await client.post(
            f"{ROGO_MCP_URL}/login",
            data={
                "email": ROGO_EMAIL,
                "password": ROGO_PASSWORD,
                "client_id": "rogo-xiaozhi-bridge",
                "redirect_uri": "http://127.0.0.1/cb",
                "state": state,
                "code_challenge": c,
                "code_challenge_method": "S256",
            },
        )
    if r.status_code not in (302, 303):
        raise RuntimeError(f"Login failed ({r.status_code}): {r.text[:300]}")
    location = r.headers.get("location", "")
    code = parse_qs(urlparse(location).query).get("code", [None])[0]
    if not code:
        raise RuntimeError(f"No auth code in redirect: {location}")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{ROGO_MCP_URL}/token",
            json={"grant_type": "authorization_code", "code": code, "client_id": "rogo-xiaozhi-bridge"},
        )
        r.raise_for_status()
        d = r.json()
    return d["access_token"], int(d.get("expires_in", 3600))


def main():
    while True:
        try:
            print("[Bridge] Authenticating with Rogo MCP server...", file=sys.stderr, flush=True)
            access_tok, expires_in = asyncio.run(_login())
            print(f"[Bridge] Auth OK. Token expires in {expires_in}s.", file=sys.stderr, flush=True)
            env = os.environ.copy()
            env["MCP_ENDPOINT"] = XIAOZHI_ENDPOINT
            env["ROGO_ACCESS_TOKEN"] = access_tok
            env["ROGO_MCP_URL"] = ROGO_MCP_URL
            proc = subprocess.Popen([sys.executable, "mcp_pipe.py", "bridge_server.py"], env=env)
            restart_after = max(expires_in - 60, 30)
            try:
                proc.wait(timeout=restart_after)
                print("[Bridge] mcp_pipe.py exited. Restarting...", file=sys.stderr, flush=True)
            except subprocess.TimeoutExpired:
                print("[Bridge] Token near expiry — refreshing...", file=sys.stderr, flush=True)
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            print(f"[Bridge] Error: {e}. Retrying in 10s...", file=sys.stderr, flush=True)
            time.sleep(10)


if __name__ == "__main__":
    main()
BRIDGEOF

# ─── Write bridge_server.py ───────────────────────────────────────────────────
cat > bridge_server.py << 'SERVEREOF'
#!/usr/bin/env python3
import asyncio, os, sys
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

ROGO_URL   = os.environ["ROGO_MCP_URL"]
ROGO_TOKEN = os.environ["ROGO_ACCESS_TOKEN"]

server = Server("rogo-proxy")
_session = None


@server.list_tools()
async def list_tools():
    return (await _session.list_tools()).tools


@server.call_tool()
async def call_tool(name, arguments):
    result = await _session.call_tool(name, arguments or {})
    return result.content


async def main():
    global _session
    headers = {"Authorization": f"Bearer {ROGO_TOKEN}"}
    async with streamablehttp_client(ROGO_URL, headers=headers) as (r, w, _):
        async with ClientSession(r, w) as session:
            await session.initialize()
            _session = session
            print("[Proxy] Connected to Rogo MCP server.", file=sys.stderr, flush=True)
            async with stdio_server() as (stdin, stdout):
                await server.run(stdin, stdout, server.create_initialization_options())


asyncio.run(main())
SERVEREOF

ok "Files written"

# ─── Download mcp_pipe.py ─────────────────────────────────────────────────────
step "Downloading mcp_pipe.py from Xiaozhi"
curl -fsSL https://raw.githubusercontent.com/78/mcp-calculator/main/mcp_pipe.py -o mcp_pipe.py
ok "mcp_pipe.py OK"

# ─── Write .env ───────────────────────────────────────────────────────────────
step "Creating .env"
cat > .env << ENVEOF
XIAOZHI_ENDPOINT=${XIAOZHI_ENDPOINT}
ROGO_MCP_URL=${ROGO_MCP_URL}
ROGO_EMAIL=${ROGO_EMAIL}
ROGO_PASSWORD=${ROGO_PASSWORD}
ENVEOF
ok ".env created"

# ─── Build & start ────────────────────────────────────────────────────────────
step "Building Docker image (first time ~2 min)"
docker compose build --quiet

step "Starting bridge"
docker compose up -d
ok "Container started"

# ─── Wait & verify ────────────────────────────────────────────────────────────
step "Waiting for connection..."
sleep 6

LOGS=$(docker logs rogo-xiaozhi-bridge 2>&1 | tail -20)
echo "$LOGS"

if echo "$LOGS" | grep -q "Connected to Rogo MCP server"; then
  echo -e "\n${GREEN}${BOLD}✓ Connected! Xiaozhi can now use Rogo IoT tools.${NC}"
elif echo "$LOGS" | grep -q "Auth OK"; then
  warn "Auth succeeded but Xiaozhi connection not confirmed yet. Check your endpoint."
else
  warn "Could not confirm connection. Check logs: docker logs rogo-xiaozhi-bridge -f"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Useful commands:${NC}"
echo -e "  ${BLUE}docker logs rogo-xiaozhi-bridge -f${NC}   — live logs"
echo -e "  ${BLUE}docker compose restart${NC}               — restart bridge"
echo -e "  ${BLUE}docker compose down${NC}                  — stop bridge"
echo -e "  ${BLUE}cd $INSTALL_DIR${NC}                 — go to install directory"
echo ""
