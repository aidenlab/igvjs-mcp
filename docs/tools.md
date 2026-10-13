# The tools

The tools the Connector gives the model, and how each is used. The wording the model itself reads is in `server/src/tools.ts` and `server/src/commandTools.ts`, and is pinned by `server/test/fixtures/tools.json`.

| Tool | What it does |
| --- | --- |
| [`open_viewer`](#open_viewer) | Opens igv-bot and gives the Room id |
| [`go_to_locus`](#go_to_locus) | Moves to coordinates, a chromosome, or the whole genome |
| [`go_to_gene`](#go_to_gene) | Moves to a gene by name |
| [`zoom_in`](#zoom_in-and-zoom_out), [`zoom_out`](#zoom_in-and-zoom_out) | Zooms by a factor of two |
| [`change_genome`](#change_genome) | Changes to another genome assembly |
| [`search_catalogues`](#search_catalogues) | Finds tracks in the ENCODE and 4DN Catalogues |
| [`load_tracks`](#load_tracks) | Loads one or several tracks by URL |
| [`remove_track`](#remove_track) | Removes one track |
| [`set_track_height`](#set_track_height) | Sets the height of one, several or all tracks |
| [`set_crosshairs`](#set_crosshairs-and-set_centre_line), [`set_centre_line`](#set_crosshairs-and-set_centre_line) | Shows or hides the crosshairs, or the centre line |
| [`read_session_summary`](#read_session_summary) | Reads what igv-bot is showing, changing nothing |
| [`get_shareable_url`](#get_shareable_url) | Gets a link that opens the current view in igv-webapp |

## What every tool shares

**`room`.** `open_viewer` names a Room id in its reply. Every other tool takes it as the optional argument `room`, and the model passes it on every call, so that the call reaches the same igv-bot whichever MCP session it arrives through (ADR 0003). It is left out of the examples below.

**The reply.** Every tool but `open_viewer` replies with the Session summary: the genome, the loci, the tracks in display order (name, type, URL and height in whole pixels), and whether the crosshairs and centre line are showing. A person also changes the Viewer by hand, and the model is not told when they do: the Session summary of the latest reply is how it learns.

**Errors.** A reply that begins `Error:` says what went wrong, and still carries the Session summary when a Viewer answered. Three replies are not about the tool itself:

- No Viewer is in the Room: open igv-bot with `open_viewer`, or pass `room`.
- `Sent, unconfirmed`: the Viewer did not answer within 15 seconds, so it is not known whether the Command was applied.
- `"…" is not a Room id`: pass the Room id from the reply of `open_viewer`.

**Addressing a track.** A track is addressed by its name, or by its position in the tracks of the Session summary, counted from 1 at the top. A name is matched as spelled, and failing that whatever its case; part of a name is not a match. A name or position that matches nothing is an error listing the tracks, and a name that several tracks share is an error giving their positions.

## Opening

### `open_viewer`

Gets the Join link that opens igv-bot in a Room. The Host shows a Join card with an "Open igv-bot" button; in Claude desktop the model opens the link in the built-in browser.

| Argument | |
| --- | --- |
| `room` | Only to get an igv-bot back that was already opened in this Conversation, showing what it last showed |
| `genome` | Only for a new igv-bot: a genome id from the igv.org genome list. Left out, hg38 |
| `locus` | Only for a new igv-bot: coordinates, a chromosome, or a gene name. Left out, the genome's default view |

```text
"open igv-bot"                         open_viewer {}
"open igv-bot on mm10 at Hoxa1"        open_viewer { genome: "mm10", locus: "Hoxa1" }
"bring igv-bot back"                   open_viewer { room: "7ZQH4M2K9X" }
```

`genome` and `locus` together with `room` are refused: for an igv-bot that was already opened, use `change_genome`, `go_to_locus` or `go_to_gene`.

## Moving about

### `go_to_locus`

| Argument | |
| --- | --- |
| `locus` (required) | Coordinates as `chr:start-end`, a chromosome name, or `all` for the whole-genome view. Several loci separated by spaces are shown side by side |

```text
"go to chr8:127,735,434-127,742,951"   go_to_locus { locus: "chr8:127,735,434-127,742,951" }
"show me chromosome 8"                 go_to_locus { locus: "chr8" }
"show the whole genome"                go_to_locus { locus: "all" }
```

### `go_to_gene`

| Argument | |
| --- | --- |
| `gene` (required) | A gene name or symbol, looked up in the current genome |

```text
"go to MYC"                            go_to_gene { gene: "MYC" }
```

An unknown gene is an error, and the view does not move.

### `zoom_in` and `zoom_out`

No arguments. Each zooms by a factor of two about the centre of the view; calling again zooms further. The whole-genome view does not zoom.

```text
"zoom in a couple of times"            zoom_in {}, then zoom_in {}
```

### `change_genome`

| Argument | |
| --- | --- |
| `genome` (required) | A genome id from the igv.org genome list, such as `hg19`, `mm39` or `hs1`. Case does not matter |

```text
"switch to mm39"                       change_genome { genome: "mm39" }
```

The tracks now loaded are removed, and the new genome opens with its own default tracks at its default view. A genome that is not on the list is an error naming those that are, and igv-bot is left as it was.

## Tracks

### `search_catalogues`

Turns a loose request into specific tracks. It is answered by the server alone: the Viewer is sent nothing.

| Argument | |
| --- | --- |
| `text` | Free text. Every word must be somewhere in a row |
| `biosample` | Only rows whose cell line, tissue or cell type carries these words |
| `assay` | Only rows whose assay carries these words, such as `ChIP-seq` or `DNase-seq` |
| `target` | Only rows whose ChIP-seq target carries these words, such as `CTCF` or `H3K27ac` |
| `outputType` | Only rows whose output type carries these words, such as `fold change over control` or `compartments` |
| `genome` | Left out, the genome igv-bot is showing |

```text
"find CTCF ChIP-seq in K562"           search_catalogues { text: "CTCF K562", assay: "ChIP-seq" }
"4DN compartments for HUVEC"           search_catalogues { biosample: "HUVEC", outputType: "compartments" }
```

The reply gives the count of all matching rows, in total and in each Catalogue, and at most 20 of them in full, each with the `name` and `url` to pass to `load_tracks`. Matching ignores case and punctuation; there are no synonyms.

### `load_tracks`

| Argument | |
| --- | --- |
| `tracks` (required) | One or more of `{ url, name? }`, in the order they are to be shown. `url` is a Catalogue row's, or any the person's browser can fetch. `name` left out, the track is named by its file |

```text
"show me CTCF in K562"                 search_catalogues { … }, then
                                       load_tracks { tracks: [{ url: "https://www.encodeproject.org/files/…bigWig", name: "K562 CTCF" }] }
"load https://example.org/a.bw"        load_tracks { tracks: [{ url: "https://example.org/a.bw" }] }
```

Every track a request asks for goes in one call. A track that does not load is an error carrying igv.js's own message; the other tracks of the call are still loaded, and the Session summary shows which.

### `remove_track`

| Argument | |
| --- | --- |
| `name` | The track's name, as in [Addressing a track](#what-every-tool-shares) |
| `position` | Or its position, counted from 1 at the top |

```text
"remove the CTCF track"                remove_track { name: "K562 CTCF" }
"remove the second track"              remove_track { position: 2 }
```

One of the two, not both. The sequence track cannot be removed.

### `set_track_height`

| Argument | |
| --- | --- |
| `height` (required) | A number of pixels from 1 to 1000, or `"taller"` (×1.5), or `"shorter"` (×2/3) |
| `names` | The names of the tracks, each as in [Addressing a track](#what-every-tool-shares) |
| `positions` | And or instead their positions, counted from 1 at the top |
| `all` | `true` for every track, in place of `names` and `positions` |

```text
"make the CTCF track 150 pixels high"  set_track_height { height: 150, names: ["K562 CTCF"] }
"make the top two data tracks taller"  set_track_height { height: "taller", positions: [2, 3] }
"make everything shorter"              set_track_height { height: "shorter", all: true }
```

- "Taller" and "shorter" undo each other exactly, short of the limits, where they stop.
- A number outside the limits is an error.
- One name or position that matches nothing is an error, and no height is changed.
- The sequence track keeps its height: `all` leaves it as it is, and addressing it is an error.
- The Session summary gives heights in whole pixels, so 50 made shorter reads 33.

## Crosshairs and centre line

### `set_crosshairs` and `set_centre_line`

The crosshairs are a vertical and a horizontal line that follow the pointer. The centre line marks the middle of the view, or of each locus where several are shown side by side.

| Argument | |
| --- | --- |
| `show` (required) | `true` to show, `false` to hide |

```text
"turn on the crosshairs"               set_crosshairs { show: true }
"show me where the centre is"          set_centre_line { show: true }
"hide the centre line"                 set_centre_line { show: false }
```

- The Session summary says whether each is showing, as `crosshairs` and `centreLine`.
- Showing what is already showing, or hiding what is hidden, changes nothing and is not an error.
- The whole-genome view has neither: showing one there is an error.
- Going to the whole-genome view hides both, and they stay hidden at the next locus.
- A person also turns each on and off with igv.js's own Crosshairs and Center Line buttons, so the model takes what is showing from the Session summary, not from what it last set.
- Both are part of the Session: reloading the Viewer, or opening it again from the Join link, brings them back as they were left.

## Reading

### `read_session_summary`

No arguments. Changes nothing: the reply is the Session summary as it stands. The model calls it before describing the view or acting on a reference to it, such as "this region" or "the second track", unless the reply just before already gave the Session summary.

```text
"what am I looking at?"                read_session_summary {}
```

## Sharing

### `get_shareable_url`

No arguments. Changes nothing: the reply gives the Shareable URL on a line of its own, after `Shareable URL:`, and then the Session summary.

```text
"give me a link to this view"          get_shareable_url {}
"I want to send this to a colleague"   get_shareable_url {}
```

- The link opens igv-webapp at `https://igv.org/app/` with the Session carried in the link itself, as igv-webapp's own share feature carries it: the same genome, loci and tracks, with no igv-bot and no Room.
- It is not the Join link, which opens igv-bot itself and expires with its Room. The Shareable URL does not expire.
- It is long, since it holds the whole Session, and the model gives it whole.
- It shows the view as it was when asked for: after a change, the model gets a new one.
- The Viewer answers it, so with no Viewer in the Room there is no link.
- A person copies the same link by hand from the Viewer, which shows it above the genome browser and keeps it up to date as the Session changes. It is one of the Controls, so "Hide controls" hides it, with the Navigation bar.
