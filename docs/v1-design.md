# v1 design: agreed in the grilling session of 2026-10-09

This is the shared understanding reached before any code was written. It is the input for the spec. Terms in bold are defined in `GLOSSARY.md`; the two hard-to-reverse decisions are in `docs/adr/`.

Revised later the same day: the first version embedded the Viewer inline in the Conversation as an MCP App, on the mistaken belief that a Connector cannot reach the Side panel. `juicebox-mcp` (Juicebot) shows that it can, and this project now works the same way.

## What we are building

A **Connector** for Claude and ChatGPT (desktop and web; no mobile) that lets the model open and drive an igv.js **Viewer** shown in the Host's **Side panel** beside the **Conversation**. The aim is to push as much as possible into loose language and keep hands-on interaction minimal: general requests go through the model, fine-grained manipulation happens in the Viewer, and the two share one **Session**.

## Architecture

- **Viewer**: an ordinary hosted web page on its own origin. "Open viewer" returns a **Join link**; the Host opens it in its Side panel. In Claude desktop the model opens the link in the built-in browser pane, and a small join card (the only MCP App) offers an "Open" button for when that does not happen. ChatGPT gets the Side panel if it supports one. Any Host without one opens the Join link in a browser tab. See ADR 0001.
- **Server**: remote, unauthenticated, hosted on Cloudflare (Workers). One Durable Object per **Room**, expired after inactivity (`juicebox-mcp` uses 24 hours).
- **Command flow**: each MCP session is bound to a Room. The Viewer joins its Room by WebSocket. A tool call is pushed to the Viewer as a command; the tool waits up to about 15 seconds for an ack carrying the result or igv.js's own error. If no Viewer is in the Room, the reply says to open one. See ADR 0002.
- **State**: the Session lives in the Viewer. After every change, by the model or by hand, the Viewer sends the Room a **Session summary**: genome, loci, ordered tracks (name, type, URL, height), and whether crosshairs and the centre line are showing. Every tool reply carries the current summary, so the model learns of hand changes on its next call. The summary will be extended with use.
- **Reopening**: the Room keeps the last Session. A Viewer joining a Room that has one restores it; otherwise it shows the default.
- **Default Viewer**: hg38, whole-genome view, the genome's default gene annotation track, nothing else.
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

- **Genomes**: the igv.org list (`https://igv.org/genomes/genomes3.json`).
- **Catalogues**: the same tables igv-webapp uses, under `https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/data/` (`encode/<genome>.signals.chip.txt`, `.signals.other.txt`, `.other.txt`; `4dn/4dn_<assembly>_tracks.txt`). ENCODE rows carry a relative `HREF` prefixed with `https://www.encodeproject.org`.
- **Search**: on the server. Fetch and cache the table; free text plus optional filters (biosample, assay, target, output type); matching ignores case and punctuation; return at most about 20 full rows and the total count. No synonym dictionary, no separate details or statistics tools.
- **No Hi-C**: the ENCODE Hi-C table is not loaded and 4DN "contact matrix" rows are filtered out.
- **Pasted URLs**: any URL the browser can fetch. The Viewer is an ordinary page, so there is no fetch allowlist; a host that does not permit cross-origin requests fails with igv.js's own error. A proxy for such hosts comes later.

## Out of v1

Hi-C, reading features in view, track colour and display-mode tools, ROIs, reordering tools, image export, Session files, GTEx, 1KG, track hubs, GenArk, local files, Dropbox, Google Drive, sign-in, mobile, keeping several Viewers in one Room in step with each other's hand changes.

## First step

A thin end-to-end slice before any other tool: "open viewer" showing hg38 with one ENCODE signal track and one 4DN signal track, in both Claude and ChatGPT. It settles what is not documented:

- whether Claude desktop opens the Join link in the Side panel without the person pressing anything, and what claude.ai on the web does;
- whether ChatGPT has a Side panel a Connector can reach, and what it does with the join card and the link;
- whether one MCP session, and so one Room, corresponds to one Conversation in each Host.

## Testing

- Unit tests for pure logic: catalogue search, building the Session summary.
- Server tests through its two public faces, the MCP endpoint and the Room's WebSocket, with a fake Viewer on the socket.
- The command round-trip against the real Viewer page and the local Worker, run locally and in automated tests.
- A short manual checklist in both real Hosts before each release.

## Settled after the session

- **Local development entry point**: develop against the local Worker (`wrangler dev`) only, so there is one code path. This is also what `juicebox-mcp` settled on.
- **Public name: igv-bot.** It is what a person sees: the Connector's name in the Host, the phrases the model responds to ("hello igv-bot"), the join card and its button, the Viewer's tab title and its hostname. "Viewer" stays the internal term and the package stays `viewer`.
- **Shareable URL target**: igv-webapp.
