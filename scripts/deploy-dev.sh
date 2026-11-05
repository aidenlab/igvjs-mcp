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
# What is deployed is reported at the Worker's GET /version as "<branch> (<short sha>)"
# or "<tag> (<short sha>)" from scripts/version.mjs: the Worker's own version (also its
# MCP serverInfo.version), stamped with --var at deploy, and the Viewer page's, written
# into the built page as version.json. After deploying, this script checks that /version
# reports what it just deployed.
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

[[ "$TARGET" =~ ^(worker|viewer|all)$ ]] || { echo "usage: scripts/deploy-dev.sh [worker|viewer|all]" >&2; exit 2; }
npm run test:run
VERSION="$(node scripts/version.mjs)"
if [[ "$TARGET" != viewer ]]; then
  deploy_worker "$VERSION"
  check_worker_version "$VERSION"
fi
if [[ "$TARGET" != worker ]]; then
  deploy_viewer "$VITE_SERVER_URL" "$VERSION"
  check_viewer_version "$VERSION"
fi
echo "MCP server URL: $WORKER_URL/mcp"
