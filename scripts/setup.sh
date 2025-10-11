#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_NODE_MAJOR=18
MIN_NPM_MAJOR=9

log() {
  printf '\033[1;34m[setup]\033[0m %s\n' "$*"
}

err() {
  printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Missing required command: $1"
    err "Please install $1 and re-run this script."
    exit 1
  fi
}

check_semver_ge() {
  local version=$1
  local minimum=$2
  node -e "const v='${version}'.split('.'); const m='${minimum}'.split('.'); const pad=n=>n.concat(Array(3-n.length).fill('0')); const ge=(a,b)=>{a=pad(a);b=pad(b);for(let i=0;i<3;i++){const ai=Number(a[i]);const bi=Number(b[i]);if(ai>bi)return true;if(ai<bi)return false;}return true;}; process.exit(ge(v,m)?0:1);"
}

require_cmd node
require_cmd npm

NODE_VERSION=$(node -p "process.versions.node")
NPM_VERSION=$(npm -v)

if ! check_semver_ge "$NODE_VERSION" "$MIN_NODE_MAJOR"; then
  err "Node.js ${MIN_NODE_MAJOR}.x or newer is required (found ${NODE_VERSION})."
  exit 1
fi

if ! check_semver_ge "$NPM_VERSION" "$MIN_NPM_MAJOR"; then
  err "npm ${MIN_NPM_MAJOR}.x or newer is required (found ${NPM_VERSION})."
  exit 1
fi

log "Installing npm dependencies"
cd "$ROOT_DIR"
npm install

log "Building renderer bundle"
npm run build

log "Setup complete!"
cat <<OUTRO

Launch the desktop app with:
  npm run start

If you plan to use a custom API key, launch the app and open Settings → LLM to configure it.
OUTRO
