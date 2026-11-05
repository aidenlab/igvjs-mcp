# What scripts/deploy-dev.sh and scripts/deploy-prod.sh share. Sourced, not run.
#
# The caller sets:
#   REPO_DIR       the checkout deployed: the working tree for dev, the tag's worktree for prod
#   WRANGLER_ENV   the [env.*] of REPO_DIR/server/wrangler.toml
#   WORKER_URL     the Worker's address
#   PAGES_PROJECT  the Pages project the Viewer is uploaded to
# VIEWER_URL in [env.*] must be https://$PAGES_PROJECT.pages.dev/, and VIEWER_ORIGINS must list
# https://$PAGES_PROJECT.pages.dev.

# Pages commands do not read wrangler.toml, so they are given its account here.
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(sed -n 's/^account_id = "\(.*\)"/\1/p' "$REPO_DIR/server/wrangler.toml")}"

# wrangler is the server package's; run it from there so the workspace resolves it.
wrangler() { (cd "$REPO_DIR/server" && npx wrangler "$@"); }

# deploy_worker VERSION [wrangler deploy options]
# VERSION is what the Worker answers an MCP initialize with as serverInfo.version.
deploy_worker() {
  local version="$1"; shift
  echo "deploying the Worker as $version"
  wrangler deploy --env "$WRANGLER_ENV" --var "VERSION:$version" "$@"
}

# _mcp METHOD PARAMS_JSON: the JSON-RPC result the live Worker answers, or nothing.
_mcp() {
  curl -s --max-time 15 -X POST "$WORKER_URL/mcp" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" || true
}

# _live_version FIELD: what the live Worker's GET /version gives for FIELD, "worker" or
# "viewer.version"; nothing when it does not answer.
_live_version() {
  curl -s --max-time 15 "$WORKER_URL/version" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=process.argv[1].split(".").reduce((o,k)=>o[k],JSON.parse(s));if(typeof v==="string")console.log(v)}catch{}})' "$1" \
    || true
}

# _check_live_version WHAT FIELD EXPECTED: waits for GET /version to give EXPECTED for FIELD.
# A new version can take a few seconds to reach every Cloudflare location, and a new
# custom domain needs a certificate, so this asks for up to two minutes before failing.
_check_live_version() {
  local what="$1" field="$2" expected="$3" live="" _
  for _ in $(seq 24); do
    live="$(_live_version "$field")"
    [[ "$live" == "$expected" ]] && { echo "$WORKER_URL/version reports the $what as $live"; return 0; }
    sleep 5
  done
  echo "$WORKER_URL/version reports the $what as '${live:-nothing}', not the deployed $expected" >&2
  return 1
}

# The live Worker's /version reports the Worker as EXPECTED (its VERSION, also its MCP
# serverInfo.version).
check_worker_version() { _check_live_version Worker worker "$1"; }

# The live Worker's /version reports the Viewer page as EXPECTED (the page's version.json,
# which the Worker reads from VIEWER_URL).
check_viewer_version() { _check_live_version 'Viewer page' viewer.version "$1"; }

# The live Worker lists the igv tools, open_viewer among them.
check_worker_tools() {
  local names
  names="$(_mcp tools/list '{}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).result.tools.map(t=>t.name).join(" "))}catch{}})')"
  [[ " $names " == *" open_viewer "* ]] || { echo "the live Worker does not list open_viewer (it lists '${names}')" >&2; return 1; }
  echo "the live Worker lists $names"
}

# Sets SESSION_HMAC_SECRET only if it is missing: changing it moves every ChatGPT
# Conversation to a new Room. A list that fails stops here, since read as "not set" it
# would change the secret.
ensure_secret() {
  local out
  out="$(wrangler secret list --env "$WRANGLER_ENV" --format json 2>/dev/null)" \
    || { echo "could not list the secrets of the $WRANGLER_ENV Worker; nothing was changed" >&2; return 1; }
  if [[ "$out" == *'"SESSION_HMAC_SECRET"'* ]]; then
    echo "SESSION_HMAC_SECRET is already set"
  else
    echo "SESSION_HMAC_SECRET is not set; storing 32 random bytes"
    openssl rand -hex 32 | wrangler secret put SESSION_HMAC_SECRET --env "$WRANGLER_ENV"
  fi
}

# Matches the whole name: igv-viewer must not be taken for igv-viewer-dev.
ensure_pages_project() {
  local out
  out="$(wrangler pages project list --json 2>/dev/null)" \
    || { echo "could not list the Pages projects; nothing was changed" >&2; return 1; }
  if [[ "$out" == *"\"$PAGES_PROJECT\""* ]]; then
    echo "the Pages project $PAGES_PROJECT exists"
  else
    # --force: run by an agent, wrangler otherwise hands this to Workers, which deploys
    # server/wrangler.toml as a Worker named $PAGES_PROJECT and creates no Pages project.
    wrangler pages project create "$PAGES_PROJECT" --production-branch main --force
  fi
}

# deploy_viewer SERVER_URL VERSION
# Vite inlines VITE_* variables at build time and a direct upload never sees the Pages
# project's variables, so the server address is passed to the build here. VERSION is
# written into the built page as version.json, { "version": VERSION }, which the Worker's
# /version reads.
deploy_viewer() {
  local server_url="$1" version="$2"
  echo "building the Viewer as $version with VITE_SERVER_URL=$server_url"
  (cd "$REPO_DIR" && VITE_SERVER_URL="$server_url" npm run build)
  grep -q "${server_url#https://}" "$REPO_DIR"/viewer/dist/assets/*.js \
    || { echo "built assets do not contain $server_url; nothing was uploaded" >&2; return 1; }
  node -e 'process.stdout.write(JSON.stringify({ version: process.argv[1] }) + "\n")' "$version" \
    > "$REPO_DIR/viewer/dist/version.json"
  wrangler pages deploy "$REPO_DIR/viewer/dist" --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true
  echo "uploaded to https://$PAGES_PROJECT.pages.dev/"
}

# The Viewer answers, and the Worker lets it open /ws (the Origin check that a Join link
# from the Viewer depends on). Polls: a new Pages project can take a minute to answer.
check_viewer() {
  local viewer="https://$PAGES_PROJECT.pages.dev" code="" ws _
  for _ in $(seq 12); do
    code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 15 "$viewer/" || true)"
    [[ "$code" == 200 ]] && break
    sleep 10
  done
  [[ "$code" == 200 ]] || { echo "the Viewer at $viewer/ answers $code" >&2; return 1; }
  ws="$(curl -s -o /dev/null -w '%{http_code}' --http1.1 --max-time 5 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H "Origin: $viewer" "$WORKER_URL/ws?room=7ZQH4M2K9X" || true)"
  [[ "$ws" == 101 ]] || { echo "the Worker answers $ws, not 101, to a Viewer at $viewer opening /ws" >&2; return 1; }
  echo "the Viewer at $viewer/ loads and may open $WORKER_URL/ws"
}
