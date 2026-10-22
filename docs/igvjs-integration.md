# How igv-bot uses igv.js

igv-bot is built on [igv.js](https://github.com/igvteam/igv.js), but in the code igv.js is easy to miss. It is imported in one file, in one of the three packages, and most of the code talks to igv.js through small interfaces of its own instead of igv.js's types. This document says where igv.js comes from, which version is used, and where the project and igv.js meet.

The terms used here (Viewer, Room, Command, Session, Session summary, Shareable URL, Navigation bar) are defined in [`GLOSSARY.md`](../GLOSSARY.md).

## Which igv.js, and which version

igv-bot depends on the **published `igv` package from npm**. It is not a fork and not a copy kept in this repository ([`v1-design.md`](v1-design.md) says the same).

| Where | What it says |
| --- | --- |
| `viewer/package.json` | `"igv": "^3.8.9"`: any 3.x release from 3.8.9 on |
| `package-lock.json` | `node_modules/igv` at version **3.8.9**: what is actually installed |

So the version in use is **igv.js 3.8.9**. The lockfile holds it there; a later 3.x release comes in only when the lockfile is updated.

The root `package.json` does not mention igv.js, because the repository is three npm workspaces and only one of them uses it:

| Workspace | Uses igv.js? | What it is |
| --- | --- | --- |
| `viewer` | **Yes** | The web page that shows igv.js and joins a Room |
| `server` | No | The Cloudflare Worker: the MCP endpoint and the Rooms |
| `roundtrip` | Only through the Viewer | End-to-end tests: the built Viewer in a headless browser against the local Worker, driven as the model would drive it |

The server imports `igvjs-mcp-viewer/protocol` (the message types), never igv.js itself.

## Where igv.js runs

igv.js runs only in the person's browser, inside the Viewer page. Everything else just delivers Commands to it:

```
Claude / ChatGPT
      │  MCP tool call (e.g. go_to_gene)
      ▼
server (Cloudflare Worker, /mcp)        ← no igv.js here
      │  Command, over the Room's WebSocket
      ▼
Viewer page (viewer/src/main.ts)
      │  applyCommand()  (viewer/src/commands.ts)
      ▼
igv.js 3.8.9 browser                    ← the only place igv.js runs
      │  Session summary, in the ack
      ▼
back through the server to the model
```

A tool call becomes one Command. The Viewer applies it to igv.js, then reads the Session back from igv.js and sends its summary as the reply. A person who pans, zooms or edits tracks by hand changes the same igv.js browser. The Viewer hears of the change from igv.js's events and tells the Room.

## The points of contact

All of the project's contact with igv.js is in `viewer/src/`, in the files below.

### 1. Creating the browser: `main.ts`

`main.ts` holds the project's only `import igv from 'igv'`. It calls `igv.createBrowser()` with one of two things:

- the **default Viewer**: `{ genome: 'hg38', locus: 'all' }`, which is hg38 in whole-genome view, or
- the **Session saved in the Room**, which igv.js takes as its configuration as it is. If the saved Session will not load, `igv.removeAllBrowsers()` clears the failed attempt and the default Viewer is shown in its place.

Every browser also gets `showSVGButton: false`, which removes igv.js's Save Image button, and `showNavigation: false`, which creates the Navigation bar hidden so that it never shows while igv.js loads; `controls.ts` shows it if the Controls are shown. Two more parts of igv.js's Navigation bar are hidden once it has loaded, because igv.js 3.8.9 offers no option for them:

- the Select Tracks button, which igv.js shows whatever `showMultiSelectButton` says, and
- the magnifying glass beside the locus box, which is found in the page and hidden.

### 2. Applying Commands: `commands.ts`

Each Command has one applier, and each applier calls igv.js's browser API:

| Command (the model's tool) | igv.js call |
| --- | --- |
| `go_to_locus`, `go_to_gene` | `browser.search(locus)` |
| `zoom_in`, `zoom_out` | `browser.zoomIn()`, `browser.zoomOut()` |
| `change_genome` | `browser.loadGenome(id)` |
| `load_tracks` | `browser.loadTrack({ url, name })`, once per track |
| `remove_track` | `browser.removeTrack(track)` |
| `set_track_height` | `track.trackView.setTrackHeight(height, true)`, then a repaint |
| `set_crosshairs` | `browser.setCursorGuideVisibility(show)` |
| `set_centre_line` | `browser.setCenterLineVisibility(show)` |
| `set_controls` | none of its own: the Controls' `showControls(show)`, which shows or hides the Navigation bar (section 4) |
| `read_session_summary` | none; the reply reads the Session |
| `get_shareable_url` | `browser.compressedSession()` |

After every Command, `captureSession()` reads the Session with `browser.toJSON()`. igv.js leaves some things out of what it writes, such as default track heights and the crosshairs and centre line, so `captureSession()` adds them. `session.ts` then turns the Session, with the Viewer settings, into the Session summary the model receives.

### 3. Watching for changes: `changes.ts`

The Viewer listens to igv.js's own events with `browser.on(...)`:

`locuschange`, `trackremoved`, `trackorderchanged`, `trackheightchange`, `tracknamechange`, `genomechange`

These fire whoever made the change, whether a person or a Command. After a quarter of a second without another event, the Viewer sends the Room the new Session summary. igv.js fires no event for its crosshairs and centre line buttons, so `main.ts` also treats any click on the browser as a possible change.

### 4. Hiding the Navigation bar: `controls.ts`

The Viewer's "Show controls" and "Hide controls" button also shows and hides igv.js's Navigation bar. igv.js draws itself inside a shadow root, which the Viewer's stylesheets cannot reach, and it has no public call to hide the bar once the browser exists. So `controls.ts` calls `browser.navbar.hide()` and `show()` directly, as igv.js's own `showNavigation: false` does.

### 5. The Shareable URL: `shareableUrl.ts`

The Shareable URL is igv-webapp (`https://igv.org/app/`) with the Session from `browser.compressedSession()` packed into the link. The link opens the hosted IGV web app, not igv-bot, so it needs no Room and no Viewer.

## Why igv.js is hard to see in the code

Most of the code does not use igv.js's TypeScript types. It declares **only the part of igv.js it uses**, as small interfaces, and treats the igv.js browser as those:

| Interface | File | Covers |
| --- | --- | --- |
| `GenomeBrowser` | `commands.ts` | The calls Commands make, and the track fields they read |
| `ChangeSource` | `changes.ts` | `on(event, listener)` |
| `NavigationBarOwner` | `controls.ts` | `navbar.hide()`, `show()`, `navbarDidResize()` |
| `SessionCompressor` | `shareableUrl.ts` | `compressedSession()` |
| `Session`, `SessionTrack` | `session.ts` | The fields of `browser.toJSON()` the summary reads |

`main.ts` joins these into one `Browser` type and casts what `igv.createBrowser()` returns to it (`as unknown as Browser`).

There are two reasons for this:

- **igv.js's own typings are looser than how it behaves.** For example, `search()` resolves with whether the locus was found, which the typings do not say.
- **Several things the project needs are not in igv.js's public typings at all**, such as `navbar`, `trackView`, `autoHeight` and `doShowCursorGuide`.

As a result, every piece of igv.js the project relies on is listed in these interfaces, and the code can be tested with stand-ins that have the same shape. The cost is that when you read the code, igv.js shows up only as `browser`.

## Behaviour that depends on igv.js 3.8.9

Several workarounds exist because of how igv.js 3.8.9 behaves. Check each of them when upgrading igv.js:

| Workaround | Where | Why |
| --- | --- | --- |
| Select Tracks button hidden after load | `main.ts` | 3.8.9 ignores `showMultiSelectButton` |
| Magnifying glass hidden by class name (`.igv-search-icon-container`) | `main.ts` | 3.8.9 has no option for it |
| Navigation bar hidden through `browser.navbar` | `controls.ts` | No public call after creation; shadow root blocks stylesheets |
| `autoHeight` cleared on the track, not its view | `commands.ts` (`resize`) | 3.8's own "Set track height" clears it where nothing reads it |
| Height and name filled in by `captureSession()` | `commands.ts` | `toJSON()` leaves out default heights and names |
| Crosshairs and centre line filled in by `captureSession()` | `commands.ts` | `toJSON()` does not write them |
| Click treated as a possible change | `main.ts` | No event for the crosshairs or centre line buttons |
| `search()` resolving `false` treated as "Unrecognized locus" | `commands.ts` | Behaviour not stated in the typings |

[`v1-design.md`](v1-design.md) explains these in more detail.

## Upgrading igv.js

1. Change the version in `viewer/package.json` and run `npm install` to update `package-lock.json`.
2. Run `npm run typecheck` and `npm run test:run`. The tests use stand-ins for igv.js, so they check the project's own logic. They do **not** check that igv.js still behaves as the interfaces above assume.
3. Run `npm run test:roundtrip`. This is the check that matters for an upgrade. It builds the Viewer with the new igv.js, starts the local Worker, and drives the real thing in headless Chromium (Playwright) the way the model would.
4. Open the Viewer (`npm run dev:viewer`) and go through each workaround in the table above. Any that igv.js now handles itself can be removed.
5. Update the version wherever the code and docs name it (`grep -rn "3\.8" viewer docs`).
