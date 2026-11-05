#!/usr/bin/env bash
# Deploy the "igv prod" deployment from one release tag, never from a working tree:
#
#   Worker  igv-mcp     at https://igv-mcp.3dg.io        (server/wrangler.toml [env.prod])
#   Viewer  igv-viewer  at https://igv-viewer.pages.dev/ (Cloudflare Pages, direct upload)
#
#   scripts/deploy-prod.sh prod-YYYY-MM-DD[.N]
#
# Releasing: tag main prod-YYYY-MM-DD (.2, .3 for a second release that day), push the
# tag, run this. The tag is checked out into a throwaway worktree, the tests run there,
# and the Worker and the Viewer are deployed from there with the tag's own
# scripts/deploy-common.sh. So uncommitted changes never ship, and rolling back is
# deploying an earlier tag. Afterwards the live Worker's /version must report "<tag>
# (<short sha>)" for both the Worker and the Viewer page, the Worker must list the igv
# tools, and the Viewer must load.
#
# The first release creates the Worker, the Pages project and SESSION_HMAC_SECRET.
# Later releases leave the secret as it is. The secret can only be put once the Worker
# exists, so on the first release ChatGPT requests fail for the few seconds between.
set -euo pipefail

USAGE="usage: scripts/deploy-prod.sh prod-YYYY-MM-DD[.N]"
(($# == 1)) || { echo "$USAGE" >&2; exit 2; }
TAG="$1"
[[ "$TAG" =~ ^prod-[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$ ]] \
  || { echo "not a release tag: $TAG (prod-YYYY-MM-DD[.N])" >&2; exit 2; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# What is deployed is what origin has: a tag only here, or one here that differs from
# origin's, is refused.
REMOTE_ID="$(git -C "$REPO_ROOT" ls-remote --refs origin "refs/tags/$TAG" | cut -f1)"
[[ -n "$REMOTE_ID" ]] || { echo "tag $TAG is not on origin; push it first" >&2; exit 1; }
LOCAL_ID="$(git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$TAG" || true)"
if [[ -z "$LOCAL_ID" ]]; then
  git -C "$REPO_ROOT" fetch -q origin "refs/tags/$TAG:refs/tags/$TAG"
elif [[ "$LOCAL_ID" != "$REMOTE_ID" ]]; then
  echo "tag $TAG here is not the one on origin; delete it here (git tag -d $TAG) and run this again" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORK/igv" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT
git -C "$REPO_ROOT" worktree add -q --detach "$WORK/igv" "$TAG"

REPO_DIR="$WORK/igv"
WRANGLER_ENV=prod
WORKER_URL="https://igv-mcp.3dg.io"
PAGES_PROJECT=igv-viewer
VERSION="$TAG ($(git -C "$REPO_DIR" rev-parse --short=7 HEAD))"
# shellcheck source=scripts/deploy-common.sh
source "$REPO_DIR/scripts/deploy-common.sh"
echo "releasing $VERSION"

(cd "$REPO_DIR" && npm ci --no-audit --no-fund --loglevel=error && npm run test:run)

deploy_worker "$VERSION" --message "$TAG"
ensure_secret
check_worker_version "$VERSION"
check_worker_tools
ensure_pages_project
deploy_viewer "$WORKER_URL" "$VERSION"
check_viewer
check_viewer_version "$VERSION"
echo "released $VERSION: Viewer https://$PAGES_PROJECT.pages.dev/, MCP server URL $WORKER_URL/mcp"
