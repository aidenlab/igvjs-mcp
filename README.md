# igvjs-mcp

A Connector for Claude and ChatGPT that lets the model open and drive an [igv.js](https://github.com/igvteam/igv.js) genome browser shown beside the conversation. A person knows it as **igv-bot**.

The vocabulary used here (Host, Connector, Viewer, Room, Join link, …) is defined in [`GLOSSARY.md`](GLOSSARY.md). The design is in [`docs/v1-design.md`](docs/v1-design.md) and [`docs/adr/`](docs/adr/).

## How it works

- The **Viewer** is an ordinary web page that houses igv.js. It opens on hg38 in whole-genome view with the genome's default gene annotation track.
- The **server** is a Cloudflare Worker with two public faces: an MCP endpoint (`/mcp`, stateless Streamable HTTP) for the Host, and a WebSocket endpoint (`/ws`) for Viewers, backed by one Durable Object per **Room**.
- Each MCP session is bound to a Room whose short id is minted on `initialize`. The `open_viewer` tool returns a **Join link**: the Viewer's URL carrying `?room=`. Opening it shows the Viewer, which joins that Room over WebSocket and reconnects by itself if the socket drops.

There are no commands yet: today the work ends with a Viewer that has joined its Room.

## Requirements

- [Node.js](https://nodejs.org) and npm

## Getting started

```sh
npm install
npm run dev:server   # the local Worker, on http://localhost:8787
npm run dev:viewer   # the Viewer, on http://localhost:5173 (in a second terminal)
```

Local development is the local Worker plus the locally served Viewer; there is no stdio entry point.

An MCP client running on this machine can use `http://localhost:8787/mcp` directly, for example Claude Code:

```sh
claude mcp add --transport http igv-bot-dev http://localhost:8787/mcp
```

A custom connector in Claude (desktop or web) or ChatGPT cannot: those Hosts connect from their own servers and need a public `https://` URL. Until the Worker is deployed, give the local Worker one with a tunnel and use the address it prints, with `/mcp` appended, as the connector URL:

```sh
cloudflared tunnel --url http://localhost:8787
```

Only the MCP endpoint needs the tunnel. The Join link still points at `http://localhost:5173`, which your own browser opens, and the Viewer reaches the Worker at `http://localhost:8787` as before.

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

Open the Join link in a browser: the Viewer shows hg38 and reports "Connected".

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
  wrangler.toml          Worker configuration: the Room binding, VIEWER_URL, VIEWER_ORIGINS
  src/index.ts           Entry point: routes /mcp and /ws
  src/tools.ts           The MCP tools (open_viewer)
  src/room.ts            The Room Durable Object
  src/roomId.ts          Minting and recognising Room ids
  test/                  Tests, run inside the Workers runtime
viewer/                  The Viewer web page
  index.html             Page entry point
  .env                   VITE_SERVER_URL: the server the Viewer joins its Room on
  src/main.ts            Creates the igv.js browser and joins the Room
  src/roomConnection.ts  The reconnecting connection to the Room
  src/protocol.ts        The Viewer–Room wire protocol, shared with the server
  src/styles/            Sass stylesheets; class names follow BEM
  test/                  Tests
```

### Configuration

- `server/wrangler.toml`, `VIEWER_URL`: where the Viewer is served. Join links are built from it.
- `server/wrangler.toml`, `VIEWER_ORIGINS`: the origins allowed to open `/ws`. Any other `Origin` is refused with 403.
- `viewer/.env`, `VITE_SERVER_URL`: the server the Viewer connects to.

The checked-in values are for local development.

## License

[MIT](LICENSE)
