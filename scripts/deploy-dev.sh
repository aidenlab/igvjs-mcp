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
# Vite inlines VITE_* variables at build time and a direct upload never sees the
# Pages project's variables, so the server address is passed to the build here.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-igv-bot-web-dev}"
VITE_SERVER_URL="${VITE_SERVER_URL:-https://igv-bot-mcp-dev.3dg.io}"
TARGET="${1:-all}"
cd "$REPO_ROOT"

deploy_worker() {
  npm run deploy:dev --workspace server
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
  worker) npm run test:run; deploy_worker ;;
  viewer) npm run test:run; deploy_viewer ;;
  all)    npm run test:run; deploy_worker; deploy_viewer ;;
  *)      echo "usage: scripts/deploy-dev.sh [worker|viewer|all]" >&2; exit 2 ;;
esac
