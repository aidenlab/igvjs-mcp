# v1 design: agreed in the grilling session of 2026-10-09

This is the shared understanding reached before any code was written. It is the input for the spec. Terms in bold are defined in `GLOSSARY.md`; the two hard-to-reverse decisions are in `docs/adr/`.

## What we are building

A **Connector** for Claude and ChatGPT (desktop and web; no mobile) that lets the model open and drive an igv.js **Viewer** embedded in the **Conversation**. The aim is to push as much as possible into loose language and keep hands-on interaction minimal: general requests go through the model, fine-grained manipulation happens in the Viewer, and the two share one **Session**.

## Architecture

- **Embedding**: the Viewer is an MCP App (`ui://` resource), rendered inline at about 500 pixels tall, with its own fullscreen button. The Host side panel is not available to Connectors. See ADR 0001.
- **Server**: remote, unauthenticated, hosted on Cloudflare (Workers). Per-Viewer state lives in one Durable Object per Viewer and expires after inactivity.
- **Command flow**: only "open viewer" carries UI. Every other tool queues a command that the live Viewer collects through Viewer-only tools, then waits up to about 15 seconds for the result or igv.js's own error. If no Viewer is live, the reply says to open one. See ADR 0002.
- **State**: the Session lives in the Viewer. After every change, by the model or by hand, the model receives a **Session summary**: genome, loci, ordered tracks (name, type, URL, height), and whether crosshairs and the centre line are showing. The summary will be extended with use.
- **One live Viewer per Conversation.** A new one restores the last Session from the server's copy, then the browser's own storage (best effort), then the default. Earlier copies show a static "moved below" notice.
- **Default Viewer**: hg38, whole-genome view, the genome's default gene annotation track, nothing else.
- **Code**: this repository, with `server` and `viewer` packages joined by npm workspaces. Plain TypeScript and Vite; the Viewer builds to a single HTML file. It depends on the published `igv` package, not a fork.
- **Prior art**: `igvweb-mcp` is ignored and deprecated by this work. `~/JuiceboxDevelopment/juicebox-mcp` is a reference for catalogue search only (`src/dataParsers.js`, `src/mapFilter.js`, `src/resultFormatter.js`).

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
11. Get the shareable URL.

When a loose request matches many tracks, the model picks a sensible default, says in one line what it picked, and loads it. It asks only when candidates differ in a way the person would care about. This rule lives in the tool descriptions.

## What the person does by hand

- **Control panel**, retractable, with exactly two widgets:
  - Shareable URL: the link in a selectable field, a copy button where the Host permits (ChatGPT blocks clipboard access), and an "open" action through the Host's link confirmation.
  - Locus box: one text box taking a chromosome, coordinates or a gene. Select-all on focus; compact readout when unfocused (`chr7:127.4–127.5 Mb`), exact coordinates on focus; a dropdown of recent loci visited in this Conversation, whoever navigated there.
- **igv.js itself**: the navigation bar is hidden. Per-track gear menus, drag-to-reorder and click popups stay. The gear scales up on hover; this is a Viewer-side style, not a change to igv.js.

The Control panel is deliberately minimal and expected to be tuned later. There is no genome picker and no track-loading widget.

## Data

- **Genomes**: the igv.org list (`https://igv.org/genomes/genomes3.json`).
- **Catalogues**: the same tables igv-webapp uses, under `https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/data/` (`encode/<genome>.signals.chip.txt`, `.signals.other.txt`, `.other.txt`; `4dn/4dn_<assembly>_tracks.txt`). ENCODE rows carry a relative `HREF` prefixed with `https://www.encodeproject.org`.
- **Search**: on the server. Fetch and cache the table; free text plus optional filters (biosample, assay, target, output type); matching ignores case and punctuation; return at most about 20 full rows and the total count. No synonym dictionary, no separate details or statistics tools.
- **No Hi-C**: the ENCODE Hi-C table is not loaded and 4DN "contact matrix" rows are filtered out.
- **Pasted URLs**: allowlisted hosts only in v1; a proxy later.
- **Allowlist**, in one config file: what the genome list needs (igv.org and its buckets, UCSC downloads); what the Catalogues point at (encodeproject.org and its S3 bucket, the 4DN open-data bucket); general public storage (Amazon S3, Google Cloud Storage).

## Out of v1

Hi-C, reading features in view, track colour and display-mode tools, ROIs, reordering tools, image export, Session files, GTEx, 1KG, track hubs, GenArk, local files, Dropbox, Google Drive, sign-in, mobile.

## First step

A thin end-to-end slice before any other tool: "open viewer" showing hg38 with one ENCODE signal track and one 4DN signal track, running in both Claude and ChatGPT. It settles three undocumented points that could change the design:

- whether the allowlist accepts wildcard hosts for fetches;
- whether web workers run in the sandbox;
- whether ENCODE's and 4DN's servers accept range requests from the sandbox origin.

## Testing

- Unit tests for pure logic: catalogue search, the command queue, building the Session summary.
- A local stand-in host page that embeds the Viewer and plays the Host's role, so the command round-trip runs locally and in automated tests.
- A short manual checklist in both real Hosts before each release.

## Open

- **Local development entry point**: keep a stdio entry point, or develop against the local Worker (`wrangler dev`) only. Recommended: local Worker only, so there is one code path.
- **The Viewer's public name.** The package directory is `viewer` until decided.
