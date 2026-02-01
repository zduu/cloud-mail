#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIL_WORKER_DIR="$ROOT_DIR/mail-worker"
MAIL_VUE_DIR="$ROOT_DIR/mail-vue"
WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
READY_PATH="${READY_PATH:-/api/setting/websiteConfig}"
PNPM_BIN="${PNPM_BIN:-pnpm}"
RESET_WORKER_STATE="${RESET_WORKER_STATE:-false}"
FORCE_PORT_RELEASE="${FORCE_PORT_RELEASE:-true}"
VITE_HOST="${VITE_HOST:-localhost}"
VITE_PORT="${VITE_PORT:-3001}"
WAIT_FOR_WORKER="${WAIT_FOR_WORKER:-false}"
SEED_SAMPLE_EMAILS="${SEED_SAMPLE_EMAILS:-true}"

if ! command -v "$PNPM_BIN" >/dev/null 2>&1; then
  echo "[ERROR] pnpm is required but not found in PATH." >&2
  exit 1
fi

if [[ -z "${NVM_DIR:-}" ]]; then
  export NVM_DIR="$HOME/.nvm"
fi

if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  if [[ -f "$ROOT_DIR/.nvmrc" ]]; then
    nvm use >/dev/null
  fi
fi

info() {
  echo "[cloud-mail] $*"
}

extract_worker_port() {
  local url="$1"
  local stripped="${url##*:}"
  stripped="${stripped%%/*}"
  if [[ "$stripped" =~ ^[0-9]+$ ]]; then
    echo "$stripped"
  elif [[ "$url" == https://* ]]; then
    echo "443"
  else
    echo "80"
  fi
}

ensure_port_available() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti tcp:"$port" || true)
    if [[ -n "$pids" ]]; then
      if [[ "$FORCE_PORT_RELEASE" == "true" ]]; then
        echo "[cloud-mail] Force releasing port $port held by PID(s): $pids"
        # shellcheck disable=SC2086
        kill $pids 2>/dev/null || true
        sleep 1
        return
      fi
      echo "[ERROR] Port $port is already in use by PID(s): $pids. Stop them or set WORKER_URL to a different port." >&2
      echo "[ERROR] Re-run this script after freeing the port or set FORCE_PORT_RELEASE=true to kill the processes automatically." >&2
      exit 1
    fi
  fi
}

reset_worker_state() {
  if [[ "$RESET_WORKER_STATE" != "true" ]]; then
    return
  fi

  local state_dir="$MAIL_WORKER_DIR/.wrangler/state/v3"
  if [[ -d "$state_dir" ]]; then
    info "Resetting local Wrangler state (D1/KV)..."
    rm -rf "$state_dir/d1" "$state_dir/kv"
  fi
}

cleanup() {
  trap - INT TERM EXIT
  if [[ -n "${WORKER_PID:-}" ]]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
  if [[ -n "${VUE_PID:-}" ]]; then
    kill "$VUE_PID" 2>/dev/null || true
  fi
}

wait_for_worker() {
  local attempt=0
  local max_attempts=60
  until curl -s -o /dev/null --connect-timeout 1 --max-time 1 "$WORKER_URL$READY_PATH" 2>/dev/null; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge $max_attempts ]]; then
      echo "[ERROR] Worker dev server did not become ready after $max_attempts seconds." >&2
      return 1
    fi
    sleep 1
  done
}

trap cleanup INT TERM EXIT

WORKER_PORT=$(extract_worker_port "$WORKER_URL")
ensure_port_available "$WORKER_PORT"
ensure_port_available "$VITE_PORT"
reset_worker_state

info "Installing mail-worker dependencies..."
(cd "$MAIL_WORKER_DIR" && "$PNPM_BIN" install)

info "Installing mail-vue dependencies..."
(cd "$MAIL_VUE_DIR" && "$PNPM_BIN" install)

if [[ "$SEED_SAMPLE_EMAILS" == "true" ]]; then
  info "Seeding sample emails into local D1..."
  (cd "$MAIL_WORKER_DIR" && "$PNPM_BIN" wrangler d1 execute email --local --config wrangler-dev.toml --file "$ROOT_DIR/scripts/seed-sample-emails.sql") || true
fi

info "Starting Cloud Mail worker (wrangler dev) on port $WORKER_PORT..."
(cd "$MAIL_WORKER_DIR" && "$PNPM_BIN" dev) &
WORKER_PID=$!

if [[ "$WAIT_FOR_WORKER" == "true" ]]; then
  info "Waiting for worker dev server at $WORKER_URL (path $READY_PATH)..."
  if ! wait_for_worker; then
    echo "[WARN] Worker did not report ready in time; continuing to start frontend." >&2
  fi
else
  info "Skipping worker readiness check (set WAIT_FOR_WORKER=true to enable)."
  sleep 1
fi

info "Starting Vue dev server on $VITE_HOST:$VITE_PORT..."
(cd "$MAIL_VUE_DIR" && "$PNPM_BIN" dev -- --host "$VITE_HOST" --port "$VITE_PORT") &
VUE_PID=$!

info "Worker dev server PID: $WORKER_PID"
info "Vue dev server PID: $VUE_PID"
info "Frontend: http://$VITE_HOST:$VITE_PORT"
info "Worker API: $WORKER_URL"
info "Press Ctrl+C to stop both processes."

wait "$WORKER_PID" "$VUE_PID"
