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
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": "rogo-xiaozhi-bridge",
            },
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

            proc = subprocess.Popen(
                [sys.executable, "mcp_pipe.py", "bridge_server.py"],
                env=env,
            )

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
