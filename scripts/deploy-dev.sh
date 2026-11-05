#!/usr/bin/env bash
# Deploy the "igv-bot dev" stack by hand (there is no CI deploy):
#
#   Worker  igv-bot-mcp-dev  at https://igv-bot-mcp-dev.3dg.io   (server/wrangler.toml [env.dev])
#   Viewer  igv-bot-web-dev  at https://igv-bot-dev.3dg.io/      (Cloudflare Pages, direct upload)
#
#   scripts/deploy-dev.sh           # both
#   scripts/deploy-dev.sh worker    # the Worker only
#   scripts/deploy-dev.sh viewer    # the Viewer only
#
# First time on an account, run scripts/deploy-wizard.sh instead: it logs in,
# sets the SESSION_HMAC_SECRET secret, creates the Pages project and attaches
# its custom domain, calling this script along the way.
#
# The Worker reports what it runs as its MCP serverInfo.version, "<branch> (<short
# sha>)" or "<tag> (<short sha>)" from scripts/version.mjs. It is stamped with --var
# at deploy, and after deploying this script checks the live Worker reports it.
#
# Vite inlines VITE_* variables at build time and a direct upload never sees the
# Pages project's variables, so the server address is passed to the build here.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-igv-bot-web-dev}"
WORKER_URL="https://igv-bot-mcp-dev.3dg.io"
VITE_SERVER_URL="${VITE_SERVER_URL:-$WORKER_URL}"
TARGET="${1:-all}"
cd "$REPO_ROOT"
# Pages commands do not read wrangler.toml, so they are given its account here.
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(sed -n 's/^account_id = "\(.*\)"/\1/p' "$REPO_ROOT/server/wrangler.toml")}"

deploy_worker() {
  local version
  version="$(node scripts/version.mjs)"
  echo "deploying the Worker as $version"
  npm run deploy:dev --workspace server -- --var "VERSION:$version"
  check_worker_version "$version"
}

# The version the live Worker answers an MCP initialize with.
live_version() {
  curl -s --max-time 15 -X POST "$WORKER_URL/mcp" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"deploy-dev","version":"0"}}}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).result.serverInfo.version)}catch{}})' \
    || true
}

# A new version can take a few seconds to reach every Cloudflare location, so this
# asks for up to a minute before failing.
check_worker_version() {
  local expected="$1" live="" _
  for _ in $(seq 12); do
    live="$(live_version)"
    [[ "$live" == "$expected" ]] && { echo "the live Worker reports $live"; return 0; }
    sleep 5
  done
  echo "the live Worker reports '${live:-nothing}', not the deployed $expected" >&2
  exit 1
}

deploy_viewer() {
  echo "building the Viewer with VITE_SERVER_URL=$VITE_SERVER_URL"
  VITE_SERVER_URL="$VITE_SERVER_URL" npm run build
  grep -q "${VITE_SERVER_URL#https://}" viewer/dist/assets/*.js || { echo "built assets do not contain $VITE_SERVER_URL" >&2; exit 1; }
  # wrangler is the server package's; run it from there so the workspace resolves it.
  (cd server && npx wrangler pages deploy ../viewer/dist --project-name "$PROJECT" --branch main --commit-dirty=true)
  echo "uploaded to https://$PROJECT.pages.dev/ (custom domain: igv-bot-dev.3dg.io for igv-bot-web-dev)"
}

case "$TARGET" in
  worker) npm run test:run; deploy_worker; echo "MCP server URL: $WORKER_URL/mcp" ;;
  viewer) npm run test:run; deploy_viewer ;;
  all)    npm run test:run; deploy_worker; deploy_viewer; echo "MCP server URL: $WORKER_URL/mcp" ;;
  *)      echo "usage: scripts/deploy-dev.sh [worker|viewer|all]" >&2; exit 2 ;;
esac
