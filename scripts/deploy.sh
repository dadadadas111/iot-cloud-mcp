#!/usr/bin/env bash
#
# deploy.sh — Sync docker-compose + .env to VPS and optionally restart services.
#
# Usage:
#   ./scripts/deploy.sh prod          # Sync production configs to /opt/mcp
#   ./scripts/deploy.sh staging       # Sync staging configs to /opt/mcp-stag
#   ./scripts/deploy.sh prod restart  # Sync + restart production containers
#   ./scripts/deploy.sh staging restart
#   ./scripts/deploy.sh all           # Sync both environments
#   ./scripts/deploy.sh all restart   # Sync + restart both
#
# Environment variables (or set in .deploy.env):
#   VPS_HOST     — VPS IP/hostname     (default: 160.187.247.2)
#   VPS_USER     — SSH user            (default: root)
#   VPS_PORT     — SSH port            (default: 22)
#   VPS_KEY      — Path to SSH key     (optional, falls back to password prompt)
#   DRY_RUN      — Set to "1" to preview without applying (default: 0)
#
set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load optional .deploy.env
if [[ -f "$PROJECT_ROOT/.deploy.env" ]]; then
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.deploy.env"
fi

VPS_HOST="${VPS_HOST:-160.187.247.2}"
VPS_USER="${VPS_USER:-root}"
VPS_PORT="${VPS_PORT:-22}"
VPS_KEY="${VPS_KEY:-}"
DRY_RUN="${DRY_RUN:-0}"

# Environment → directory + compose file mapping
declare -A ENV_DIR=(
  [prod]="/opt/mcp"
  [staging]="/opt/mcp-stag"
)
declare -A ENV_COMPOSE=(
  [prod]="docker-compose.yml"
  [staging]="docker-compose.staging.yml"
)
declare -A ENV_SERVICE=(
  [prod]="iot-cloud-mcp"
  [staging]="iot-cloud-mcp-staging"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()   { err "$@"; exit 1; }

ssh_cmd() {
  local ssh_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -p "$VPS_PORT")
  if [[ -n "$VPS_KEY" ]]; then
    ssh_opts+=(-i "$VPS_KEY")
  fi
  ssh "${ssh_opts[@]}" "${VPS_USER}@${VPS_HOST}" "$@"
}

scp_cmd() {
  local scp_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -P "$VPS_PORT")
  if [[ -n "$VPS_KEY" ]]; then
    scp_opts+=(-i "$VPS_KEY")
  fi
  scp "${scp_opts[@]}" "$@"
}

# ─── Core Functions ───────────────────────────────────────────────────────────

check_local_files() {
  local env="$1"
  local compose_file="${ENV_COMPOSE[$env]}"

  if [[ ! -f "$PROJECT_ROOT/$compose_file" ]]; then
    die "Compose file not found: $PROJECT_ROOT/$compose_file"
  fi

  # .env is NOT synced from local — it contains per-environment secrets.
  # Only docker-compose files are synced.
  info "Local compose file OK: $compose_file"
}

backup_remote() {
  local env="$1"
  local remote_dir="${ENV_DIR[$env]}"
  local timestamp
  timestamp="$(date +%Y%m%d_%H%M%S)"
  local backup_dir="${remote_dir}/backups/${timestamp}"

  info "Creating remote backup → ${backup_dir}"

  if [[ "$DRY_RUN" == "1" ]]; then
    info "[DRY RUN] Would backup remote files to $backup_dir"
    return 0
  fi

  ssh_cmd "mkdir -p '${backup_dir}' && cp '${remote_dir}'/*.yml '${backup_dir}/' 2>/dev/null; cp '${remote_dir}/.env' '${backup_dir}/' 2>/dev/null; echo 'Backup created at ${backup_dir}'"
}

sync_compose() {
  local env="$1"
  local compose_file="${ENV_COMPOSE[$env]}"
  local remote_dir="${ENV_DIR[$env]}"

  info "Syncing $compose_file → ${VPS_USER}@${VPS_HOST}:${remote_dir}/"

  if [[ "$DRY_RUN" == "1" ]]; then
    info "[DRY RUN] Would copy $compose_file to $remote_dir/"
    return 0
  fi

  scp_cmd "$PROJECT_ROOT/$compose_file" "${VPS_USER}@${VPS_HOST}:${remote_dir}/$compose_file"
  ok "Synced $compose_file"
}

verify_remote() {
  local env="$1"
  local remote_dir="${ENV_DIR[$env]}"
  local compose_file="${ENV_COMPOSE[$env]}"

  info "Verifying remote files..."

  # Check compose file exists and is valid YAML (basic check)
  ssh_cmd "
    if [[ ! -f '${remote_dir}/${compose_file}' ]]; then
      echo 'ERROR: ${compose_file} missing on remote'
      exit 1
    fi
    if [[ ! -f '${remote_dir}/.env' ]]; then
      echo 'WARNING: .env missing on remote — services may fail to start'
    fi
    echo 'Remote files verified OK'
    echo '---'
    ls -la '${remote_dir}/${compose_file}' '${remote_dir}/.env' 2>/dev/null
  "
}

restart_services() {
  local env="$1"
  local remote_dir="${ENV_DIR[$env]}"
  local compose_file="${ENV_COMPOSE[$env]}"
  local service_name="${ENV_SERVICE[$env]}"

  if [[ "$DRY_RUN" == "1" ]]; then
    info "[DRY RUN] Would restart services in $remote_dir"
    return 0
  fi

  info "Restarting services in $remote_dir..."

  ssh_cmd "
    cd '${remote_dir}'

    # Detect docker compose command
    if command -v docker-compose &>/dev/null; then
      COMPOSE_CMD='docker-compose -f ${compose_file}'
    else
      COMPOSE_CMD='docker compose -f ${compose_file}'
    fi

    # Pull latest images
    echo 'Pulling images...'
    \$COMPOSE_CMD pull

    # Restart with zero-downtime (up -d recreates only changed containers)
    echo 'Restarting services...'
    \$COMPOSE_CMD up -d

    # Wait and check
    echo 'Waiting 10s for services to stabilize...'
    sleep 10

    echo '--- Service Status ---'
    \$COMPOSE_CMD ps

    echo '--- Recent Logs (${service_name}) ---'
    \$COMPOSE_CMD logs --tail=20 '${service_name}' 2>/dev/null || true
  "

  ok "Services restarted for $env"
}

rollback() {
  local env="$1"
  local remote_dir="${ENV_DIR[$env]}"

  info "Available backups for $env:"
  ssh_cmd "ls -1d '${remote_dir}/backups'/*/ 2>/dev/null | tail -5 || echo 'No backups found'"

  echo ""
  read -rp "Enter backup timestamp to restore (e.g. 20260302_143000), or 'cancel': " choice

  if [[ "$choice" == "cancel" ]]; then
    info "Rollback cancelled"
    return 0
  fi

  local backup_dir="${remote_dir}/backups/${choice}"

  info "Restoring from $backup_dir..."
  ssh_cmd "
    if [[ ! -d '${backup_dir}' ]]; then
      echo 'ERROR: Backup not found: ${backup_dir}'
      exit 1
    fi
    cp '${backup_dir}'/*.yml '${remote_dir}/' 2>/dev/null || true
    cp '${backup_dir}/.env' '${remote_dir}/' 2>/dev/null || true
    echo 'Restored from ${backup_dir}'
    ls -la '${remote_dir}'/*.yml '${remote_dir}/.env' 2>/dev/null
  "

  ok "Rollback complete. Run with 'restart' to apply."
}

# ─── Deploy Pipeline ─────────────────────────────────────────────────────────

deploy_env() {
  local env="$1"
  local do_restart="${2:-}"

  info "═══════════════════════════════════════════"
  info "  Deploying: ${env}"
  info "  Target:    ${VPS_USER}@${VPS_HOST}:${ENV_DIR[$env]}"
  info "═══════════════════════════════════════════"

  check_local_files "$env"
  backup_remote "$env"
  sync_compose "$env"
  verify_remote "$env"

  if [[ "$do_restart" == "restart" ]]; then
    restart_services "$env"
  else
    warn "Services NOT restarted. Run with 'restart' flag to restart, or do it manually."
  fi

  ok "Deploy complete for $env"
  echo ""
}

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $(basename "$0") <environment> [restart]

Environments:
  prod      Deploy production  (→ /opt/mcp)
  staging   Deploy staging     (→ /opt/mcp-stag)
  all       Deploy both environments

Options:
  restart   Also restart containers after syncing

Special commands:
  rollback <env>   Restore a previous backup

Environment variables:
  VPS_HOST    VPS hostname/IP    (default: 160.187.247.2)
  VPS_USER    SSH user           (default: root)
  VPS_PORT    SSH port           (default: 22)
  VPS_KEY     SSH key path       (optional)
  DRY_RUN     Set to 1 for preview mode

Examples:
  ./scripts/deploy.sh prod              # Sync configs only
  ./scripts/deploy.sh staging restart   # Sync + restart staging
  ./scripts/deploy.sh all               # Sync both environments
  DRY_RUN=1 ./scripts/deploy.sh all     # Preview what would happen
  ./scripts/deploy.sh rollback prod     # Restore from backup

EOF
  exit 1
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  [[ $# -lt 1 ]] && usage

  local target="$1"
  local action="${2:-}"

  # Check SSH connectivity
  info "Checking SSH connectivity to ${VPS_USER}@${VPS_HOST}:${VPS_PORT}..."
  if ! ssh_cmd "echo 'SSH OK'" 2>/dev/null; then
    die "Cannot connect to ${VPS_USER}@${VPS_HOST}:${VPS_PORT}. Check VPS_HOST, VPS_USER, VPS_PORT, VPS_KEY."
  fi
  ok "SSH connected"
  echo ""

  case "$target" in
    prod)
      deploy_env "prod" "$action"
      ;;
    staging)
      deploy_env "staging" "$action"
      ;;
    all)
      deploy_env "prod" "$action"
      deploy_env "staging" "$action"
      ;;
    rollback)
      [[ -z "$action" ]] && die "Usage: $(basename "$0") rollback <prod|staging>"
      rollback "$action"
      ;;
    *)
      err "Unknown environment: $target"
      usage
      ;;
  esac
}

main "$@"
