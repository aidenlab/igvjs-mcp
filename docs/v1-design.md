# v1 design: agreed in the grilling session of 2026-10-09

This is the shared understanding reached before any code was written. It is the input for the spec. Terms in bold are defined in `GLOSSARY.md`; the two hard-to-reverse decisions are in `docs/adr/`.

Revised later the same day: the first version embedded the Viewer inline in the Conversation as an MCP App, on the mistaken belief that a Connector cannot reach the Side panel. `juicebox-mcp` (Juicebot) shows that it can, and this project now works the same way.

## What we are building

A **Connector** for three **Hosts** (Claude desktop, claude.ai on the web, and ChatGPT desktop in Codex mode; no mobile) that lets the model open and drive an igv.js **Viewer** shown in the Host's **Side panel** beside the **Conversation**. The aim is to push as much as possible into loose language and keep hands-on interaction minimal: general requests go through the model, fine-grained manipulation happens in the Viewer, and the two share one **Session**.

## Architecture

- **Viewer**: an ordinary hosted web page on its own origin. "Open viewer" returns a **Join link**; the Host opens it in its Side panel. In Claude desktop the model opens the link in the built-in browser pane, and a small **Join card** (the only MCP App) offers an "Open igv-bot" button for when that does not happen. In ChatGPT desktop in Codex mode the person presses that button and the Viewer opens in the Side panel. Any Host without one opens the Join link in a browser tab. See ADR 0001.
- **Server**: remote, unauthenticated, hosted on Cloudflare (Workers). One Durable Object per **Room**. A Room's stored data is deleted 24 hours after the last message from a Viewer, as in `juicebox-mcp`, which is also how long a Join link lives; a Room with a Viewer still connected is left as it is for another 24 hours. A Viewer joining an expired Room is told so. `open_viewer` makes an expired Room a new one, because the model may pass the id of a Room that has since expired.
- **Command flow**: `open_viewer` without `room` mints a new Room, so each Conversation has its own; with `room` it returns that Room. A command acts on the Room its `room` argument names (ADR 0003). One without `room` falls back to the Room bound to its MCP session, which since #6 never holds a Viewer, so the reply says to pass `room`. The Viewer joins its Room by WebSocket. A tool call is pushed to the Viewer as a command; the tool waits up to about 15 seconds for an ack carrying the result or igv.js's own error. If no Viewer is in the Room, the reply says to pass `room` or open one. See ADR 0002.
- **State**: the Session lives in the Viewer. After every change, by the model or by hand, the Viewer saves the Session in the Room and sends it a **Session summary**: genome, loci, ordered tracks (name, type, URL, height), and whether crosshairs and the centre line are showing. Every tool reply carries the current summary, so the model learns of hand changes on its next call. The summary will be extended with use.
- **Reopening**: the Room keeps the last Session. A Viewer joining a Room that has one restores it; otherwise it shows the default. Only a Viewer that has just been opened restores: one that reconnects keeps its own Session. igv.js starts once the Room has answered the join, so a Viewer that cannot reach its Room shows no genome browser.
- **Default Viewer**: igv-webapp's launch state: hg38 in whole-genome view with the ruler, the sequence track and RefSeq genes. It is igv.js's own default for `genome: "hg38", locus: "all"` with no tracks added.
- **Code**: this repository, with `server` and `viewer` packages joined by npm workspaces. Plain TypeScript and Vite. It depends on the published `igv` package, not a fork.
- **Viewer styling**: Sass for stylesheets and BEM (Block Element Modifier) naming for the classes we write. Widgets are hand-built: no Bootstrap or other CSS framework, because global framework styles bleed into igv.js's own popups and menus.
- **Prior art**: `~/JuiceboxDevelopment/weiszd/juicebox-mcp` is the model for the whole mechanism: Room, Join link, join card, command and ack protocol, binding a Room to an MCP session (including the ChatGPT path), and Catalogue search. `igvweb-mcp` is ignored and deprecated by this work.

## What the model can do

1. Open the Viewer, optionally with a genome and locus.
2. Go to a locus or gene, and zoom in and out.
3. Change genome.
4. Search the ENCODE and 4DN **Catalogues**.
5. Load tracks, from search results or by URL.
6. Remove a track.
7. Set track height for one, several or all tracks, named or by position in the Session summary: an absolute pixel value, or "taller" (×1.5) and "shorter" (×2/3).
8. Show or hide crosshairs.
9. Show or hide the centre line.
10. Read the Session summary.
11. Get the **Shareable URL**.

When a loose request matches many tracks, the model picks a sensible default, says in one line what it picked, and loads it. It asks only when candidates differ in a way the person would care about. This rule lives in the tool descriptions.

## What the person does by hand

- **Control panel**, retractable, with exactly two widgets:
  - Shareable URL: the link in a selectable field with a copy button. It opens igv-webapp with the Session carried in the URL.
  - Locus box: one text box taking a chromosome, coordinates or a gene. Select-all on focus; compact readout when unfocused (`chr7:127.4–127.5 Mb`), exact coordinates on focus; a dropdown of recent loci visited in this Room, whoever navigated there.
- **igv.js itself**: the navigation bar is hidden. Per-track gear menus, drag-to-reorder and click popups stay. The gear scales up on hover; this is a Viewer-side style, not a change to igv.js.

The Control panel is deliberately minimal and expected to be tuned later. There is no genome picker and no track-loading widget.

## Data

- **Genomes**: the igv.org list (`https://igv.org/genomes/genomes3.json`). The server checks a genome against it before anything reaches the Viewer, so a genome that is not on it gets a reply naming those that are, and nothing changes (#7). The id is matched whatever its case and sent on in the list's spelling. Seen on 2026-10-12: igv.org answers 403 to any request without a browser's `User-Agent`, a Worker's included. The server therefore falls back to igv.js's own backup of the list (`https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/genomes/web/genomes.json`), which had the same 35 ids that day, and keeps what it fetched for an hour. igv.js in the Viewer still reads igv.org.
- **Opening on a genome and locus** (#7): `open_viewer` given `genome` or `locus` saves `{ genome, locus }` in the Room as its Session, in place of anything saved there. igv.js takes that as its configuration as it takes a Session it wrote, so the Viewer that opens the Join link restores it like any other. A locus without a genome means hg38. A Viewer already running in that Room is not moved: it restores only when its page loads, and `change_genome` and `go_to_locus` are the tools for an igv-bot that is open.
- **Catalogues**: the same tables igv-webapp uses, under `https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/data/` (`encode/<genome>.signals.chip.txt`, `.signals.other.txt`, `.other.txt`; `4dn/4dn_<assembly>_tracks.txt`). ENCODE rows carry a relative `HREF` prefixed with `https://www.encodeproject.org`.
- **Search**: on the server. Fetch and cache the table; free text plus optional filters (biosample, assay, target, output type); matching ignores case and punctuation; return at most about 20 full rows and the total count. No synonym dictionary, no separate details or statistics tools.
- **No Hi-C**: the ENCODE Hi-C table is not loaded and 4DN "contact matrix" rows are filtered out.
- **Pasted URLs**: any URL the browser can fetch. The Viewer is an ordinary page, so there is no fetch allowlist; a host that does not permit cross-origin requests fails with igv.js's own error. A proxy for such hosts comes later.

## Out of v1

Hi-C, reading features in view, track colour and display-mode tools, ROIs, reordering tools, image export, Session files, GTEx, 1KG, track hubs, GenArk, local files, Dropbox, Google Drive, sign-in, mobile, keeping several Viewers in one Room in step with each other's hand changes.

## First step

A thin end-to-end slice before any other tool: "open viewer" showing the default Viewer, deployed and tried in both Claude and ChatGPT (#3). It settles what is not documented:

- whether Claude desktop opens the Join link in the Side panel without the person pressing anything, and what claude.ai on the web does;
- whether ChatGPT has a Side panel a Connector can reach, and what it does with the join card and the link;
- whether one MCP session, and so one Room, corresponds to one Conversation in each Host.

An earlier version of this step also loaded one ENCODE and one 4DN signal track. That was a misunderstanding: whether those servers can be reached from the deployed origin is shown by loading tracks (#9).

### Findings

Observed on 2026-10-11 with Claude Pro and ChatGPT Plus, before #3 was deployed. Juicebot is `juicebox-mcp`, which already had the Join card, the tool wording and the ChatGPT path; igv-bot then had only a link in the tool reply.

| Host | Juicebot | igv-bot before #3 |
| --- | --- | --- |
| Claude desktop | Side panel | Chrome, after clicking the link in the reply |
| claude.ai web | Chrome tab | Chrome, after clicking the link in the reply |
| ChatGPT desktop | Side panel | Error: "this MCP session has no Room" |
| ChatGPT web | Chrome tab | Error: "this MCP session has no Room" |

So:

- ChatGPT desktop has a Side panel a Connector can reach. Both Hosts' web versions open a browser tab.
- ChatGPT does not echo `mcp-session-id`. Its Room id is derived by HMAC-SHA256 from `x-openai-session` under the `SESSION_HMAC_SECRET` secret, as ADR 0002 already said. With the secret unset those requests fail; there is no fallback key. There is no `join_room` tool.

Observed on 2026-10-11 with #3's code, on a local Worker reached through a tunnel:

| Host | What happened |
| --- | --- |
| Claude desktop | The model opens the Join link by itself and the Viewer appears in the Side panel after about 25 seconds, with nothing pressed. The Join card shows meanwhile. Pressing "Open igv-bot" during the wait raises a permission dialog over the Side panel. The model replies in one short sentence without the Join link or Room id. |
| claude.ai web | The Join card shows; the Viewer opens in a browser tab only after pressing "Open igv-bot". |
| ChatGPT desktop and web | Not working yet. See below. |

Seen again the same day on the deployed dev stack, in Claude desktop: "open the igv browser" opens the Side panel by itself, and Claude asks once for permission to use the site. "hello igv-bot" shows the Join card but the model does not open the Side panel. The "Open igv-bot" button opens the Viewer in Chrome, so in Claude desktop only the model reaches the Side panel. Refinements to the Join card and the greeting are in #16.

Seen on 2026-10-11 and 2026-10-12 with the local Worker and Viewer, in Claude desktop: the Side panel's browser lets a page open a socket to its own address but blocks one to any other local address. A Viewer on `localhost:5173` told to join its Room on `localhost:8787` loads, shows the genome and stays at "Connection lost. Reconnecting…"; the Worker never sees the request. Claude desktop's log (`~/Library/Logs/Claude/main.log`) says "Blocked request to non-public host on public-hosts-only session" for each attempt. Chrome has no such rule. So the local Viewer joins through its own address, `localhost:5173/ws`, and the Vite dev server passes that on to the Worker (`viewer/vite.config.ts`); with that it reports "Connected · Room …" in the Side panel. The deployed stack is not affected: its Worker has a public address.

**ChatGPT is supported in one place: ChatGPT desktop in Codex mode (#17).** Seen on 2026-10-12 with ChatGPT Plus on the deployed dev stack.

- **Adding the Connector.** In Codex mode: Settings → Plugins → Add → Add MCP server, with Name `igv-bot`, Type Streamable HTTP, URL `https://igv-bot-mcp-dev.3dg.io/mcp` and everything else blank. No authentication is asked for. Juicebot is added the same way, so the ChatGPT rows of the first table above were Codex mode. A plain ChatGPT chat is not offered the Connector, and ChatGPT on the web has no place to add it; both are out of v1.
- **Opening.** Asking for igv-bot shows the Join card and the model replies "Press Open igv-bot on the card." Nothing opens by itself. Pressing "Open igv-bot" opens the Viewer in the Side panel, which reads "Connected · Room …". This is the reverse of Claude desktop, where only the model reaches the Side panel and the button opens Chrome.
- **Commands.** "go to brca1" and "go to gene myc" each worked from the first call, with no reload of the Viewer and the Room id unchanged.
- **Room and Conversation.** Three new Conversations got three Rooms. Within a Conversation each tool call arrived in a new MCP session, and the model passed `room` unprompted, so the command reached the Viewer's Room (ADR 0003). The Worker's log now names the Room each tool call acted on and whether it came from `room` or from the MCP session. Not observed: an app restart, and two Conversations open at once.
- **Headers.** Codex mode echoes `mcp-session-id`. In the first runs its tool calls carried no `x-openai-session`; in a later run they carried both. What makes the difference is not known. A second client, without `x-openai-session`, reads the Join card's resource. Codex also probes the OAuth discovery addresses before most calls and carries on when they are not found.
- **Left for #16.** In Codex mode the Join card shows Claude desktop's wording ("igv-bot is opening in the panel on the right, which can take half a minute… if Claude then asks…"), which is wrong there. A greeting ("hello igv-bot") was answered with a greeting and did not open igv-bot.

**Room and Conversation in Claude: not settled, and deferred.** Seen on 2026-10-11: asking one Conversation to show the IGV browser opens the Viewer in the Side panel; the same request in a new Conversation gets a reply that the browser is already open. Room ids were not compared, so this does not show whether the two Conversations share a Room. It was decided not to hold up further work on it and to revisit if it becomes a problem. The comparison, when it is wanted: the Room id in the Viewer's status line across a new Conversation, two Conversations open at once, and an app restart. Two Conversations sharing a Room is accepted for v1. One Conversation changing Room partway through needs an ADR and a follow-up ticket (something like `juicebox-mcp`'s `join_room`).

**One Conversation did change Room partway through (#19), and ADR 0003 settles it.** Seen on 2026-10-11 and 2026-10-12 in Claude desktop: the chat calls `open_viewer` in one MCP session, and after the model has used the built-in browser an agent runtime makes the later calls in a second session, started 6 to 8 seconds after `open_viewer`. The commands went to the second session's empty Room and replied that no Viewer was there; the model recovered by calling `open_viewer` again and reloading the Viewer into the second Room. No header identifies the Conversation. Every tool now takes an optional `room`, and `open_viewer` tells the model to pass the Room id on every later call. There is still no `join_room` tool. Seen on 2026-10-12 in Claude desktop with that change: after opening igv-bot, zooming and going to a locus worked from the first command, the Viewer did not reload, and the Room id in its status line stayed the same throughout.

## Reopening: what is restored, and when

Restoring is about a page and a Room. A Conversation does not come into it.

- **The Session is saved per Room.** A Room has one saved Session: the last one any Viewer in it sent.
- **"Just opened" means the page has just loaded.** Each time the Viewer page loads with a Join link, it joins the Room named in `?room=` and asks what is saved there. That is the only moment a Viewer restores. A page loads when a person reloads it, when they close the Side panel or tab and open the Join link again, when they press "Open igv-bot" on a Join card, and when the model opens the Join link in the built-in browser.
- **A Viewer that is already running never restores.** If its socket drops and it reconnects, it keeps what it is showing and sends that to the Room.

So what a person sees on opening igv-bot depends only on which Room the Join link names:

| The Room named in the Join link | What the Viewer shows |
| --- | --- |
| Never had a Viewer, or has nothing saved | The default Viewer |
| Has a saved Session | That Session |
| Expired | No genome browser, and the line "This igv-bot has expired. Ask Claude or ChatGPT to open a new one." |

Which Room a Join link names is decided by `open_viewer`: the `room` the model passes, or else a new Room minted for that call (ADR 0003).

- **A new Conversation starts with a clean slate.** Its model has no Room id to pass, so `open_viewer` mints a new Room and the Viewer is the default. This holds whatever the Host does with MCP sessions: a Room is never handed from one Conversation to another.
- **Later in the same Conversation**, the model passes `room`, so igv-bot comes back in the same Room with the last view. Restoring therefore covers a reload, closing the Side panel and opening it again, and coming back to a Conversation within a day.
- **If the model leaves `room` out** when asked for igv-bot again in the same Conversation, the person gets a new Room and the default Viewer, not their last view. The earlier Room and its Session are still there until they expire, under the Join card further up the Conversation.

### Expiry

A Room expires 24 hours after the last message from a Viewer, if no Viewer is connected then. Its saved Session and Session summary are deleted and the Room is marked expired.

A person meets the expired line only by opening an old Join link directly: a tab or Side panel left over from the day before, or the "Open igv-bot" button on a Join card far up a Conversation. Neither goes through `open_viewer`.

`open_viewer` never hands out an expired Room. Without `room` it mints a new one. With `room` it first clears the mark on that Room, which makes it a new one with nothing saved: the model of a Conversation left for more than a day still holds the old Room id and passes it. Either way the Join link from `open_viewer` always opens a Viewer: the last view if the Room is under a day idle, the default otherwise.

## Testing

- Unit tests for pure logic: catalogue search, building the Session summary.
- Server tests through its two public faces, the MCP endpoint and the Room's WebSocket, with a fake Viewer on the socket.
- The command round-trip against the real Viewer page and the local Worker, run locally and in automated tests.
- A short manual checklist in both real Hosts before each release.

## Settled after the session

- **Local development entry point**: develop against the local Worker (`wrangler dev`) only, so there is one code path. This is also what `juicebox-mcp` settled on.
- **Public name: igv-bot.** It is what a person sees: the Connector's name in the Host, the phrases the model responds to ("hello igv-bot"), the join card and its button, the Viewer's tab title and its hostname. "Viewer" stays the internal term and the package stays `viewer`.
- **Shareable URL target**: igv-webapp.
- **Join card** (#3): one status line and an "Open igv-bot" button that goes through the Host's open-link request. No QR code and no visible link. Its MCP Apps client loads from `unpkg` at a pinned version, as in `juicebox-mcp`.
- **Tool wording** (#3): copied from `juicebox-mcp`'s `get_juicebox_url`. The model opens the Join link in Claude desktop's built-in browser and nowhere else, never uses Claude in Chrome, replies in one short sentence, and does not repeat the Join link or Room id.
- **Room id in the Viewer** (#3): shown small in the status line ("Connected · Room …"), so Rooms can be compared across Conversations.
- **Deployment** (#3): one `-dev` stack on the `3dg.io` zone, following `juicebox-mcp`. The Worker `igv-bot-mcp-dev` is at `igv-bot-mcp-dev.3dg.io`, with `workers.dev` and preview URLs off. The Pages project `igv-bot-web-dev` is at `igv-bot-dev.3dg.io`, by direct upload with `VITE_SERVER_URL` passed at build time. It is deployed by hand with `scripts/deploy-dev.sh`; `scripts/deploy-wizard.sh` covers the first-time steps. There is no CI deploy, and production names wait for a release ticket.
