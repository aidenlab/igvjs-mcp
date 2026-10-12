# igvjs-mcp

A Connector for Claude and ChatGPT that lets the model open and drive an [igv.js](https://github.com/igvteam/igv.js) genome browser shown beside the conversation. A person knows it as **igv-bot**.

**It works in Claude desktop, claude.ai on the web, and ChatGPT desktop in Codex mode.** A plain ChatGPT chat and ChatGPT on the web are not supported; see the findings in [`docs/v1-design.md`](docs/v1-design.md).

The vocabulary used here (Host, Connector, Viewer, Room, Join link, …) is defined in [`GLOSSARY.md`](GLOSSARY.md). The design is in [`docs/v1-design.md`](docs/v1-design.md) and [`docs/adr/`](docs/adr/). The tools the model is given, and how each is used, are listed in [`docs/tools.md`](docs/tools.md).

## How it works

- The **Viewer** is an ordinary web page that houses igv.js. It opens on hg38 in whole-genome view with the genome's default gene annotation track.
- The **server** is a Cloudflare Worker with two public faces: an MCP endpoint (`/mcp`, stateless Streamable HTTP) for the Host, and a WebSocket endpoint (`/ws`) for Viewers, backed by one Durable Object per **Room**.
- Each MCP session is bound to a Room whose short id is minted on `initialize`. A request that carries no such id but does carry ChatGPT's `x-openai-session` header gets a Room id derived from it by HMAC, under the `SESSION_HMAC_SECRET` secret.
- An MCP session is not a Conversation: Claude desktop moves one Conversation across two MCP sessions. So `open_viewer` names the Room id in its reply, and every tool takes an optional `room` that the model passes back; a call carrying it acts on that Room whichever MCP session it arrives through (ADR 0003). `open_viewer` without `room` mints a new Room, so every Conversation starts with the default Viewer; with `room` it returns that Room, and the Viewer restores the Session saved there.
- The `open_viewer` tool returns a **Join link**: the Viewer's URL carrying `?room=`. Opening it shows the Viewer, which joins that Room over WebSocket, shows the Room id in its status line, and reconnects by itself if the socket drops.
- Hosts that render MCP Apps also show a **Join card** in the Conversation: one line of status and an "Open igv-bot" button that opens the Join link through the Host.

- The model moves the Viewer with **Commands**, each sent by a tool of its own: `go_to_locus`, `go_to_gene`, `zoom_in` and `zoom_out`. A tool call becomes one command pushed to every Viewer in the Room; the Viewer applies it to igv.js and acks, and the first ack becomes the reply. An acked reply carries the **Session summary**: genome, loci, tracks in display order, and whether the crosshairs and centre line are showing. With no Viewer in the Room the reply says to pass `room` or open one, and has no summary to carry; with no ack within 15 seconds it is "sent, unconfirmed", with the summary the Room last heard if it has one.
- A person also changes the Viewer by hand: panning and zooming in igv.js, a track's gear menu, dragging tracks into a new order, removing a track. The model is not notified; it learns of a hand change from the Session summary on its next tool reply, or by asking with `read_session_summary`, a Command that changes nothing. The Viewer also sends its Room the Session summary after every change, whoever made it, once igv.js has been quiet for a quarter of a second, so a drag is one message.
- The model turns a loose request ("CTCF ChIP-seq in K562") into tracks with `search_catalogues`, which searches the ENCODE and 4DN **Catalogues** on the server and sends the Viewer nothing. It searches for the genome in the Room's Session summary unless it is given one, and replies with the count of all matching rows and at most 20 of them in full, each with the name and URL to load it. The search is in `server/src/catalogues.ts`.
- The model loads tracks with `load_tracks`, one or several in a call, each from a URL: a Catalogue row's, or any the person gives that their browser can fetch. A track that does not load is reported with igv.js's own error and the others are still loaded. `remove_track` removes one track, addressed by its name or by its position in the Session summary, counted from 1 at the top; a name or position that matches nothing is an error listing the tracks. Addressing is in `viewer/src/trackAddress.ts`.
- The model sets track height with `set_track_height`, for one track, several, or all: a number of pixels from 1 to 1000, or "taller" (×1.5) or "shorter" (×2/3), so that one undoes the other. Tracks are addressed as for `remove_track`, by `names` and `positions`, or with `all`. The sequence track keeps the height igv.js gives it. The Session summary gives heights in whole pixels. The arithmetic is in `viewer/src/trackHeight.ts`.
- The model shows or hides the crosshairs with `set_crosshairs` and the centre line with `set_centre_line`, each taking `show`. Both are in the Session summary and are restored with the Session. The whole-genome view has no centre line, so showing it there is an error, and going to the whole-genome view hides both, as it does in igv.js.

A Command's tool is one row of `server/src/commandTools.ts`, its command in `viewer/src/protocol.ts` and its applier in `viewer/src/commands.ts`.

## Requirements

- [Node.js](https://nodejs.org) and npm

## Getting started

```sh
npm install
cp server/.dev.vars.example server/.dev.vars   # local stand-ins for the Worker's secrets
npm run dev:server   # the local Worker, on http://localhost:8787
npm run dev:viewer   # the Viewer, on http://localhost:5173 (in a second terminal)
```

Local development is the local Worker plus the locally served Viewer; there is no stdio entry point.

An MCP client running on this machine can use `http://localhost:8787/mcp` directly, for example Claude Code:

```sh
claude mcp add --transport http igv-bot-dev http://localhost:8787/mcp
```

A custom connector in Claude (desktop or web) or ChatGPT cannot: those Hosts connect from their own servers and need a public `https://` URL. To try a local Worker in those Hosts, give it one with a tunnel and use the address it prints, with `/mcp` appended, as the connector URL:

```sh
cloudflared tunnel --url http://localhost:8787
```

Only the MCP endpoint needs the tunnel. The Join link still points at `http://localhost:5173`, which your own browser opens. The Viewer joins its Room through its own address, `localhost:5173/ws`, which the Vite dev server passes on to the Worker at `localhost:8787` (`viewer/vite.config.ts`). It does not call `localhost:8787` itself: Claude desktop's built-in browser blocks a page from opening a socket to another local address, and the Viewer would sit at "Connection lost. Reconnecting…".

Or call the tool by hand:

```sh
# initialize: the mcp-session-id response header is the Room id
curl -si http://localhost:8787/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# open_viewer: replies with the Join link, http://localhost:5173/?room=<Room id>
curl -s http://localhost:8787/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <Room id>' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"open_viewer","arguments":{}}}'
```

Open the Join link in a browser: the Viewer shows hg38 and reports "Connected · Room <Room id>".

With the Viewer open, a command tool moves it and replies with the Session summary:

```sh
curl -s http://localhost:8787/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <Room id>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"go_to_gene","arguments":{"gene":"MYC"}}}'
```

## Tests

```sh
npm run typecheck
npm run test:run         # server (in workerd, with fake Viewers on the socket) and Viewer unit tests
npm run test:roundtrip   # the built Viewer in headless Chromium against the local Worker
```

The round trip is kept out of `test:run` because it is not hermetic: igv.js fetches hg38 and looks genes up over the network. It needs Playwright's Chromium (`npx playwright install chromium`, once) and ports 4173 and 8797 free; it does not use the development ports.

## Deploying

There is one deployed stack, for development. Nothing deploys from CI.

| Part   | Cloudflare name                 | Address                                                        |
| ------ | ------------------------------- | -------------------------------------------------------------- |
| Worker | `igv-bot-mcp-dev`               | `https://igv-bot-mcp-dev.3dg.io` (`/mcp` for Hosts, `/ws` for Viewers) |
| Viewer | Pages project `igv-bot-web-dev` | `https://igv-bot-dev.3dg.io/`                                  |

```sh
scripts/deploy-wizard.sh   # first time: login, the secret, the Pages project, the custom domain, then each Host
scripts/deploy-dev.sh      # afterwards: run the tests, deploy the Worker, build and upload the Viewer
```

For now the Viewer is reached at `https://igv-bot-web-dev.pages.dev/` and Join links point there: the custom domain `igv-bot-dev.3dg.io` is not attached yet ([#15](https://github.com/aidenlab/igvjs-mcp/issues/15)).

Both need a Cloudflare account that owns the `3dg.io` zone. The connector URL to give Claude or ChatGPT is `https://igv-bot-mcp-dev.3dg.io/mcp`. Before a release, go through [`docs/release-checklist.md`](docs/release-checklist.md) in both Hosts.

## Scripts

Run from the repository root.

| Command              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `npm run dev:server` | Start the local Worker with `wrangler dev`                          |
| `npm run dev:viewer` | Start the Viewer's Vite dev server with hot module reload           |
| `npm run build`      | Type-check the Viewer and build it as a static site into `viewer/dist/` |
| `npm run typecheck`  | Type-check both packages                                            |
| `npm run test:run`   | Run every test once                                                 |
| `npm test`           | Run the tests in watch mode                                         |

Run one package's tests with `npx vitest run --project server` or `--project viewer`, and a single file by adding its path.

## Project layout

Two packages joined by npm workspaces.

```
server/                  The Cloudflare Worker
  wrangler.toml          Worker configuration: the Room binding, VIEWER_URL, VIEWER_ORIGINS, the dev deployment
  .dev.vars.example      Local stand-ins for the Worker's secrets; copy to .dev.vars
  src/index.ts           Entry point: routes /mcp and /ws
  src/tools.ts           The MCP tools (open_viewer)
  src/joinCard.ts        The Join card, the one MCP App
  src/room.ts            The Room Durable Object
  src/roomId.ts          Minting, deriving and recognising Room ids
  test/                  Tests, run inside the Workers runtime
viewer/                  The Viewer web page
  index.html             Page entry point
  .env                   VITE_SERVER_URL: the server the Viewer joins its Room on
  src/main.ts            Creates the igv.js browser and joins the Room
  src/roomConnection.ts  The reconnecting connection to the Room
  src/protocol.ts        The Viewer–Room wire protocol, shared with the server
  src/styles/            Sass stylesheets; class names follow BEM
  test/                  Tests
scripts/
  deploy-dev.sh          Deploy the dev Worker and Viewer
  deploy-wizard.sh       First-time deployment and the checks in each Host, step by step
```

### Configuration

- `server/wrangler.toml`, `VIEWER_URL`: where the Viewer is served. Join links are built from it.
- `server/wrangler.toml`, `VIEWER_ORIGINS`: the origins allowed to open `/ws`. Any other `Origin` is refused with 403.
- `server/.dev.vars` (git-ignored; copy `server/.dev.vars.example`), `SESSION_HMAC_SECRET`: the key that derives ChatGPT's Room ids. Deployed, it is a Worker secret. Without it requests carrying only `x-openai-session` fail; there is no fallback key.
- `viewer/.env`, `VITE_SERVER_URL`: the server the Viewer connects to. Locally it is the Viewer's own dev server, which passes `/ws` on to the Worker.
- `viewer/vite.config.ts`: the dev server's port and its `/ws` pass-through to the local Worker.

The checked-in values are for local development. The dev deployment's values are in `[env.dev]` of `server/wrangler.toml` and in `scripts/deploy-dev.sh`.

## License

[MIT](LICENSE)
