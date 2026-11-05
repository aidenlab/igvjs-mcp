#!/usr/bin/env bash
# Deploy the "igv dev" deployment by hand (there is no CI deploy):
#
#   Worker  igv-mcp-dev     at https://igv-mcp-dev.3dg.io        (server/wrangler.toml [env.dev])
#   Viewer  igv-viewer-dev  at https://igv-viewer-dev.pages.dev/ (Cloudflare Pages, direct upload)
#
#   scripts/deploy-dev.sh           # both
#   scripts/deploy-dev.sh worker    # the Worker only
#   scripts/deploy-dev.sh viewer    # the Viewer only
#
# First time on an account, run scripts/deploy-wizard.sh instead: it logs in,
# sets the SESSION_HMAC_SECRET secret and creates the Pages project, calling this
# script along the way.
#
# The Worker reports what it runs as its MCP serverInfo.version, "<branch> (<short
# sha>)" or "<tag> (<short sha>)" from scripts/version.mjs. It is stamped with --var
# at deploy, and after deploying this script checks the live Worker reports it.
#
# What it shares with scripts/deploy-prod.sh is in scripts/deploy-common.sh.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER_ENV=dev
PAGES_PROJECT="${PROJECT:-igv-viewer-dev}"
WORKER_URL="https://igv-mcp-dev.3dg.io"
VITE_SERVER_URL="${VITE_SERVER_URL:-$WORKER_URL}"
TARGET="${1:-all}"
cd "$REPO_DIR"
# shellcheck source=scripts/deploy-common.sh
source "$REPO_DIR/scripts/deploy-common.sh"

deploy_and_check_worker() {
  local version
  version="$(node scripts/version.mjs)"
  deploy_worker "$version"
  check_worker_version "$version"
}

[[ "$TARGET" =~ ^(worker|viewer|all)$ ]] || { echo "usage: scripts/deploy-dev.sh [worker|viewer|all]" >&2; exit 2; }
npm run test:run
[[ "$TARGET" == viewer ]] || deploy_and_check_worker
[[ "$TARGET" == worker ]] || deploy_viewer "$VITE_SERVER_URL"
echo "MCP server URL: $WORKER_URL/mcp"
