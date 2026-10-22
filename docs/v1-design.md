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

- **Controls**: the Shareable URL and the Navigation bar, hidden and shown together with one button, "Hide controls" and "Show controls" (#34).
  - Shareable URL: the link in a selectable field with a copy button, in its own strip above the genome browser. It opens igv-webapp with the Session carried in the URL.
  - Navigation bar: igv.js's own, as igv.js ships it but for two buttons and the magnifying glass, on a restored Session as on the default Viewer. Save Image is switched off at creation (`showSVGButton: false`). Select Tracks is hidden once igv.js has loaded (`navbar.multiTrackSelectButton.setVisibility(false)`), since igv.js 3.8.9 shows it whatever `showMultiSelectButton` says; it is therefore on the bar while igv.js loads. With it goes Overlay Tracks, which igv.js shows only while tracks are selected. The magnifying glass beside the locus box is hidden once igv.js has loaded too (its `igv-search-icon-container`, found from `navbar.searchInput`), igv.js 3.8.9 having no option for it. A person types a chromosome, coordinates or a gene into its locus box and presses Enter.
  - Hidden, the two leave their space to the genome browser. The Viewer's status line and the button are always shown.
  - The Controls start hidden (#38): a new Viewer opens with the Shareable URL strip and the Navigation bar hidden, and the button reads "Show controls". igv.js creates the Navigation bar hidden (`showNavigation: false`), so it never shows while igv.js loads.
  - Whether they are shown is kept in the Viewer settings, beside the Session and never in it (ADR 0004). The Viewer sends them to the Room after every change; the Room keeps the latest, and a Viewer that reloads or joins later restores them from there. A Room with none, whether new, opened on a genome or locus, or from before #38, shows the Controls hidden; the server never writes them. They are not in the Session or the Shareable URL, so a Shareable URL opens igv-webapp with its navigation bar showing.
  - As with every other hand change, a click does not reach the other Viewers in the Room.
  - Hiding and showing is done by hand only: there is no tool for it yet (#37), and the Session summary does not mention it.
  - As built: igv.js 3.8.9 draws itself in a shadow root, so the Viewer's stylesheets do not reach the Navigation bar, and igv.js has no public call to hide it after creation. One function in `viewer/src/controls.ts` does what igv.js's own `showNavigation: false` does, and is the one place to change when igv.js gains a public call.
- **igv.js itself**: per-track gear menus, drag-to-reorder and click popups stay, with the Controls shown or hidden.

The Controls are deliberately minimal. There is no genome picker and no track-loading widget.

## Data

- **Genomes**: the igv.org list (`https://igv.org/genomes/genomes3.json`). The server checks a genome against it before anything reaches the Viewer, so a genome that is not on it gets a reply naming those that are, and nothing changes (#7). The id is matched whatever its case and sent on in the list's spelling. Seen on 2026-10-12: igv.org answers 403 to any request without a browser's `User-Agent`, a Worker's included. The server therefore falls back to igv.js's own backup of the list (`https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/genomes/web/genomes.json`), which had the same 35 ids that day, and keeps what it fetched for an hour, or longer when neither address answers. igv.js in the Viewer still reads igv.org.
- **Opening on a genome and locus** (#7): `open_viewer` given `genome` or `locus`, and no `room`, saves `{ genome, locus }` as the Session of the Room it mints. igv.js takes that as its configuration as it takes a Session it wrote, so the Viewer that opens the Join link restores it like any other. A locus without a genome means hg38. A locus igv.js does not recognise leaves the Viewer on the genome's default view, and the model learns of it from the next Session summary. With `room` they are refused (ADR 0003): `change_genome` and `go_to_locus` are the tools for an igv-bot that was already opened.
- **Catalogues**: the same tables igv-webapp uses, under `https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/data/` (`encode/<genome>.signals.chip.txt`, `.signals.other.txt`, `.other.txt`; `4dn/4dn_<assembly>_tracks.txt`). ENCODE rows carry a relative `HREF` prefixed with `https://www.encodeproject.org`.
- **Loading and removing as built** (#9): two Commands, `load_tracks` and `remove_track`.
  - Loading: the Viewer loads the tracks of a call one after another, so they are shown in the order given and one that fails does not stop the rest. A call with a failure is an error reply carrying igv.js's own message for each track that failed; its Session summary shows the ones that loaded. igv.js puts a new track above the genome's own annotation track, not at the bottom, and the Session summary lists it there.
  - Errors: igv.js reports a file that does not exist and a host that does not permit cross-origin requests alike when the answer carries no CORS header, as "Error accessing resource: <url> status: 0". The browser tells it no more than that.
  - Names: igv.js shows a track loaded without a name under its file's name, but does not write that name to the Session. The Viewer adds it, as it adds a default height, so the Session summary names a track as the person sees it.
  - Addressing: a track is addressed by `name` or by `position` in the Session summary's tracks, counted from 1 at the top, never both. A name is matched as spelled, and failing that whatever its case; part of a name is not a match. A name several tracks share is an error giving their positions. The sequence track is not removed: igv.js's own menu does not offer it.
  - ENCODE answers 403 to a headless browser's `User-Agent`, and without a CORS header, so igv.js sees the same "status: 0". The round trip's browser therefore gives an ordinary `User-Agent`, and one of its tests searches the ENCODE Catalogue and loads the first track found from encodeproject.org.
- **Track height as built** (#10): one Command, `set_track_height`, carrying `height` and the tracks it is for.
  - Tracks: `names` and `positions`, each addressed as `remove_track` addresses one, or `all`. Names and positions may be mixed, and a track addressed twice is one track; `all` with either is an error, and so is none of the three. One name or position that matches nothing is the error, and no height is changed.
  - Height: a number of pixels from 1 to 1000, the height igv.js lets a track be dragged to, or `"taller"` (×1.5) or `"shorter"` (×2/3). A number outside the limits is an error; "taller" and "shorter" stop at them, and from a limit the one no longer undoes the other.
  - Undoing: two thirds of a height is rarely a whole number of pixels, and no rounding to whole pixels lets each of the two undo the other. So igv.js is given the height as it comes, part of a pixel included, and a height within a billionth of a whole pixel is that pixel: "shorter" then "taller" is exactly the height it began at. The Session summary gives heights in whole pixels, so 50 made shorter reads 33.
  - igv.js: the height is set as igv.js's own "Set track height" sets it, whatever the track's limits for dragging, and the track is no longer fitted to what it holds: the Viewer clears `autoHeight` on the track, where igv.js reads it. igv.js 3.8's own dialog clears it on the track's view, where nothing does, so a track loaded with `autoHeight` takes its old height back there.
  - The sequence track: igv.js gives it its height (25 pixels, 115 with the translation shown) and its menu offers no other. `all` leaves it as it is, and addressing it is an error.
- **Crosshairs and centre line as built** (#11): two Commands, `set_crosshairs` and `set_centre_line`, each carrying `show`.
  - igv.js: each is set as igv.js's own button sets it, and the button is lit to match, so the next press by hand does what the person expects.
  - The Session: igv.js writes neither to a Session, so the Viewer adds them (`showCursorGuide`, `showCenterGuide`), and igv.js reads them back when the Session is restored.
  - Saving: igv.js announces neither change, by hand or by a Command. The Viewer therefore reports its Session to the Room after every Command, as it does after every click.
  - The whole-genome view: igv.js hides its centre line button there, and turns both off on arriving. Its crosshairs button still works there, but igv.js turns the crosshairs off again whenever it lays the view out, a window resize and a restored Session included, and announces nothing. So showing either there is an error, and both read as hidden after `go_to_locus` with `all`.
- **Search**: on the server. Fetch and cache the table; free text plus optional filters (biosample, assay, target, output type); matching ignores case and punctuation; return at most about 20 full rows and the total count. No synonym dictionary, no separate details or statistics tools.
- **Searching as built** (#8): one tool, `search_catalogues`, answered by the server alone; the Viewer is sent nothing.
  - Table names: ENCODE and 4DN name some genomes differently from the igv.org list. hg38 is `GRCh38` in both, mm10 is `GRCm38` in 4DN, danRer11 is `GRCz11` in 4DN, mm39 is `GRCm39` in ENCODE. A table igv-data does not have (404) is an empty one; a genome with no table at all gets a reply saying so.
  - Size: the three ENCODE tables for hg38 are 47 MB and 193,000 rows. They are kept as the lines of the file and split into columns only for the rows a search reads, which is about 50 MB of memory and 150 ms a search. Only the tables of the genome last searched are kept, for an hour: a Worker has 128 MB.
  - Matching: every word of the free text must be in the row, and every word of a filter in that filter's column, with case and punctuation dropped on both sides. A word matches inside a longer word, so the rows that carry every word whole are given first: "CTCF" gives CTCF before CTCFL. Free text does not read a file's address or colours, and passes over ten small words ("in", "for", "the", …) so that "CTCF ChIP-seq in K562" is searched as the three words that name data. That is not a synonym dictionary: no word stands for another.
  - Loadable: ENCODE's `other` table lists some 19,000 `tsv` files of gene and transcript quantifications for hg38, which igv.js cannot show as a track. They are left out as the 4DN contact matrices are.
  - What is kept between searches is the tables, not the promise of them: a Worker's request cannot wait on a fetch that another request began. Two first searches of a genome that arrive together each fetch.
  - 4DN's `Assay` column holds the restriction enzyme, and the assay itself is named in `Dataset` ("Hi-C on …"), so the assay filter reads both. 4DN names no targets. The rows in ENCODE's `signals.other` table whose assay is "HiC" are bigWig signals, not contact matrices, and stay.
  - Genome: the one given, checked against the igv.org list, or else the one in the Room's Session summary. With neither the reply is an error asking for one. The reply carries the Room's Session summary when the Room has one, and says so when the genome searched is not the one shown.
  - Rows: at most 20, in table order (ENCODE signals, then ENCODE peaks and other files, then 4DN), with the count of all matches in total and in each Catalogue.
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
