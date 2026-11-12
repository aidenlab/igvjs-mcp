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
| [`rename_track`](#rename_track) | Gives one track a new name |
| [`set_track_color`](#set_track_color) | Sets the color, and alt color, of one, several or all tracks |
| [`set_data_range`](#set_data_range) | Sets the data range, autoscale and log scale of one, several or all tracks |
| [`set_signal_style`](#set_signal_style) | Sets the graph type, window function, flipped axis and heatmap color scale of one, several or all wig tracks |
| [`set_display_mode`](#set_display_mode) | Sets how the rows of one, several or all annotation, variant, alignment and seg tracks are laid out |
| [`set_color_by`](#set_color_by) | Sets what one, several or all alignment, variant and SNP annotation tracks are colored by |
| [`group_reads`](#group_reads) | Groups the reads of one, several or all alignment tracks |
| [`set_crosshairs`](#set_crosshairs-and-set_centre_line), [`set_centre_line`](#set_crosshairs-and-set_centre_line) | Shows or hides the crosshairs, or the centre line |
| [`set_controls`](#set_controls) | Shows or hides the Controls: the Navigation bar and, unless the Viewer is Embedded, the Shareable URL |
| [`read_session_summary`](#read_session_summary) | Reads what igv-bot is showing, changing nothing |
| [`get_shareable_url`](#get_shareable_url) | Gets a link that opens the current view in igv-webapp |

## What every tool shares

**`room`.** `open_viewer` names a Room id in its reply. Every other tool takes it as the optional argument `room`, and the model passes it on every call, so that the call reaches the same igv-bot whichever MCP session it arrives through (ADR 0003). It is left out of the examples below.

**The reply.** Every tool but `open_viewer` replies with the Session summary: the genome, the loci, the tracks in display order (name, Track type, URL, height in whole pixels and `options`), whether the crosshairs and centre line are showing, and whether the controls are. A person also changes the Viewer by hand, and the model is not told when they do: the Session summary of the latest reply is how it learns.

A track's type is igv.js's canonical name for its Track type, with igv.js's aliases folded in: genes, feature, snp and fusionjuncspan read `annotation`; interaction reads `interact`; maf and mut read `seg`; eqtl reads `qtl`; junctions and splicejunctions read `junction`. A track's `options` holds the Track options a track tool sets, each as igv.js saves it (but a display mode in lower case, as `set_display_mode` takes it, and a color-by or grouping as `set_color_by` and `group_reads` take it), and only those set on the track in the Session; it is left out when there are none. The tools that add to it say so.

**Notes.** When a Command was carried out other than as asked, the reply begins `Note:`, ahead of the Session summary: one short statement of fact from the Viewer, the only party that knows the live track (ADR 0006). The model passes it on to the person in a sentence of its own. With no note, the model confirms the change in a few words and explains nothing. The server's MCP `instructions` say so. Each tool that can give a note says so in its own description too, because some Hosts may never show `instructions` to the model (see [`host-instructions.md`](host-instructions.md)). A request that cannot be carried out is still an error, not a note. The tools that give notes list them.

**Errors.** A reply that begins `Error:` says what went wrong, and still carries the Session summary when a Viewer answered. Three replies are not about the tool itself:

- No Viewer is in the Room: open igv-bot with `open_viewer`, or pass `room`.
- `Sent, unconfirmed`: the Viewer did not answer within 15 seconds, so it is not known whether the Command was applied.
- `"…" is not a Room id`: pass the Room id from the reply of `open_viewer`.

**Addressing a track.** A track is addressed by its name, or by its position in the tracks of the Session summary, counted from 1 at the top. A name is matched as spelled, and failing that whatever its case; part of a name is not a match. A name or position that matches nothing is an error listing the tracks, and a name that several tracks share is an error giving their positions.

**Track tools.** The tools that change tracks share these rules (ADR 0005). Tracks are chosen by `names`, `positions` or `all`, where `all` is every track the tool applies to. The Viewer checks every value against every track chosen before it changes any, against the live tracks, not the Room's Session summary: a call is all or nothing. A track named or placed whose Track type the tool does not apply to is an error saying why, and naming the tool that does where there is one. `all` passes over such tracks with a note saying why, except the sequence track, which no track tool changes and which is passed over without a word. The legal values are read from igv.js's own menus.

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
- Notes: "taller" or "shorter" stopped at a limit (`"Conservation" stopped at 1000 pixels: no track is made taller than that.`), a track already at the limit, or beyond it as a person may set one, was left as it was, or every track already had the height asked for, so nothing changed (`"Refseq All" was already 105 pixels high, so nothing changed.`). A height that only some tracks already had gets no note.

### `rename_track`

| Argument | |
| --- | --- |
| `newName` (required) | The name to show the track under from now on. Spaces around it are dropped; a blank name is an error |
| `name` | The track's name now, as in [Addressing a track](#what-every-tool-shares) |
| `position` | Or its position, counted from 1 at the top |

```text
"call the second track Conservation"   rename_track { position: 2, newName: "Conservation" }
"rename K562 CTCF to CTCF"             rename_track { name: "K562 CTCF", newName: "CTCF" }
```

- One track, by `name` or `position`, not both.
- Every track but the sequence track, as igv.js's own "Set track name" offers.
- The name is kept in the Session and the Shareable URL, also for a track loaded with no name, whose rename igv.js's own dialog leaves out of the Session it writes.
- Note: the track already had the name, so nothing changed (`The track was already named "Refseq All", so nothing changed.`).

### `set_track_color`

As igv.js's own "Set track color", "Set alt color" and their "Unset" items.

| Argument | |
| --- | --- |
| `color` | The color the track is drawn in |
| `altColor` | The color of a wig track's negative values and an annotation track's minus-strand features |
| `names` | The names of the tracks, each as in [Addressing a track](#what-every-tool-shares) |
| `positions` | And or instead their positions, counted from 1 at the top |
| `all` | `true` for every track that takes the colors given, in place of `names` and `positions` |

Either color or both, each as `"#RRGGBB"` (or `"#RGB"`) or `"rgb(R, G, B)"`, or `"unset"` for the color the track was loaded with. The model turns a color's name into one of these. igv.js keeps a color as `rgb(R, G, B)`, as its color picker gives one, and the Session summary gives it so in the track's `options`, as `color` and `altColor`.

```text
"make the CTCF track blue"             set_track_color { color: "#1f77b4", names: ["K562 CTCF"] }
"negative values in red"               set_track_color { altColor: "rgb(214, 39, 40)", positions: [2] }
"make everything black"                set_track_color { color: "#000000", all: true }
"put the genes' color back"            set_track_color { color: "unset", names: ["Refseq All"] }
```

- Annotation, alignment, variant, wig, interact and shoebox tracks take a `color`: those igv.js's menu offers it on. The others (seg, junction, gwas, qtl and the rest) read a color only from the config they are loaded with, so a color given later would not show: they are an error.
- Only wig and annotation tracks take an `altColor`.
- A wig track drawn as a heatmap takes neither: it is an error pointing to `set_signal_style`'s `colorScale`.
- A color in any other form, a CSS name among them, is an error giving the forms.
- Notes: `all` passed over tracks that do not take the colors, each with why (`Passed over by all: "Copy number" is a seg track, which igv.js gives no track color.`); a variant track colored by an attribute is drawn in the one color from then on, as igv.js's own color does (`"Variants" is no longer colored by AF: it is drawn in the color asked for.`); every track already had the colors, so nothing changed (`"Refseq All" already had that color, so nothing changed.`).

### `set_data_range`

As igv.js's own "Set data range", "Autoscale" and "Log scale".

| Argument | |
| --- | --- |
| `min`, `max` | A fixed range: the values at the bottom and top of the tracks. One alone keeps the other as each track has it, as igv.js's dialog fills it in |
| `autoscale` | `true` for a range that follows what is in view; `false` to fix the range each track has now |
| `logScale` | `true` to draw the values on a log scale, `false` for a linear one |
| `names` | The names of the tracks, each as in [Addressing a track](#what-every-tool-shares) |
| `positions` | And or instead their positions, counted from 1 at the top |
| `all` | `true` for every track that takes what is given, in place of `names` and `positions` |

Any of `min` and `max`, `autoscale` and `logScale` together, but not a fixed range with `autoscale: true`. The Session summary gives them in the track's `options`, as igv.js saves them: `min` and `max` while the range is fixed, `autoscale`, and `logScale` where it is not igv.js's default for the Track type.

```text
"set the CTCF track's range to 0 to 50"   set_data_range { min: 0, max: 50, names: ["K562 CTCF"] }
"cap the second track at 10"              set_data_range { max: 10, positions: [2] }
"autoscale all the signal tracks"         set_data_range { autoscale: true, all: true }
"show the conservation on a log scale"    set_data_range { logScale: true, names: ["Conservation"] }
```

- Wig tracks, alignment tracks (the range of their coverage), qtl, gwas and gcnv tracks, and interact tracks drawn with proportional arcs: those igv.js's menu offers "Set data range" on. An interact track drawn with nested arcs is an error pointing to `set_arcs`. shoebox, cnvpytor and merged tracks, whose ranges igv.js's menu sets in its own ways, are errors, as are the others.
- Only wig and interact tracks take a `logScale`.
- A wig track drawn as a heatmap is an error pointing to `set_signal_style`'s `colorScale`.
- A `min` not below the `max`, with the bound a track already has where only one is given, is an error.
- No autoscale groups (ADR 0005). A fixed range, or autoscale turned off, on a track a person grouped by hand takes it out of its group, as igv.js does. `autoscale: true` leaves a grouped track in its group, autoscaled with it.
- The range, autoscale and group are kept in the Session as asked, also where igv.js would bring back on a reload the ones the track was loaded with.
- Notes: tracks taken out of an autoscale group, naming those still in it (`"Conservation" was taken out of its autoscale group; "H3K27ac" is still in it.`); `all` passed over tracks that do not take what is given, each with why (`Passed over by all: "Refseq All" is an annotation track, which has no data range.`); every track already had it, so nothing changed (`"Conservation" already had a data range of 0 to 10, so nothing changed.`).

### `set_signal_style`

As igv.js's own "Graph type", "Windowing function", "Flip y-axis" and, on a heatmap, "Set color scale".

| Argument | |
| --- | --- |
| `graphType` | `bar`, `line`, `points`, `heatmap` or `dynseq` |
| `windowFunction` | How the values under one pixel are summed up: `mean`, `min`, `max`, or `none` to draw every value |
| `flipAxis` | `true` to draw the tracks upside down, `false` the right way up |
| `colorScale` | A heatmap's colors: `min`, `max`, `minColor` and `maxColor`, and for a diverging scale `mid` and `midColor`; `type` is `gradient` or `diverging`. Only what changes is given |
| `names` | The names of the tracks, each as in [Addressing a track](#what-every-tool-shares) |
| `positions` | And or instead their positions, counted from 1 at the top |
| `all` | `true` for every track that takes what is given, in place of `names` and `positions` |

Any of them together. The Session summary gives them in the track's `options`, as igv.js saves them: `graphType`, `windowFunction` and `flipAxis` where they are not igv.js's defaults (`bar`, `mean`, `false`), and `colorScale` once a heatmap has one.

```text
"show the conservation as a line"          set_signal_style { graphType: "line", names: ["Conservation"] }
"draw all the signal as heatmaps"          set_signal_style { graphType: "heatmap", all: true }
"heatmap from 0 to 5, white to black"      set_signal_style { colorScale: { min: 0, max: 5, minColor: "#ffffff", maxColor: "#000000" }, positions: [2] }
"flip the second track"                    set_signal_style { flipAxis: true, positions: [2] }
"show the peaks, not the average"          set_signal_style { windowFunction: "max", names: ["K562 CTCF"] }
```

- Wig tracks only: the others are errors. The legal values are those of igv.js's wig track menu.
- A `windowFunction` is one the track's file offers, as igv.js's menu lists them: most offer all four. One the file does not offer is an error naming those it does.
- `colorScale` is only for a track drawn as a heatmap, or made one in the same call with `graphType: "heatmap"`; on another it is an error. A `colorScale` with any other `graphType` is an error whatever the tracks.
- A color scale keeps what is not given as the track has it. A `mid` or `midColor` makes it diverging, with `white` at the mid unless a `midColor` is given; `type: "gradient"` drops the mid. A track with no color scale yet takes igv.js's default colors and, failing a `min` and `max`, a gradient over its data range (where igv.js, left to itself, would draw a range spanning 0 diverging). A `min` not below the `max`, or a `mid` not between them, is an error. Colors are given as for [`set_track_color`](#set_track_color), but not `unset`.
- A heatmap's color and data range are its `colorScale`: [`set_track_color`](#set_track_color) and [`set_data_range`](#set_data_range) on one are errors pointing here.
- A heatmap has no axis to flip, as igv.js's menu offers none: `flipAxis` on one is an error, unless the same call gives it another `graphType`, and `flipAxis` with `graphType: "heatmap"` is an error whatever the tracks.
- A points track keeps its window function in the Session, as asked: igv.js would load one with no window function in its config with `none`.
- `dynseq` draws the bases of the sequence at the height of the values, and only below 2 bp per pixel; further out igv.js draws bars.
- Notes: `dynseq` set while the view is zoomed out further than 2 bp per pixel (`"Conservation" is drawn as dynseq, which shows bases only below 2 bp per pixel: until the view is zoomed in that far it is drawn as bars.`); `all` passed over tracks that do not take what is given, each with why (`Passed over by all: "Refseq All" is an annotation track, which has no signal style: only wig tracks have one.`); every track already had it, so nothing changed (`"Conservation" already had graph type line, so nothing changed.`).

### `set_display_mode`

As igv.js's own display mode menu: "Collapse", "Squish" and "Expand", an alignment track's "full", a seg track's "Fill".

| Argument | |
| --- | --- |
| `mode` | `collapsed`, `squished`, `expanded`, `full` or `fill` |
| `names` | The names of the tracks, each as in [Addressing a track](#what-every-tool-shares) |
| `positions` | And or instead their positions, counted from 1 at the top |
| `all` | `true` for every track that offers the mode, in place of `names` and `positions` |

The Session summary gives it in the track's `options` as `displayMode`, in lower case as the tool takes it, where igv.js saves one: a track without one is `expanded`, igv.js's default.

```text
"squish the genes"                         set_display_mode { mode: "squished", names: ["Refseq All"] }
"collapse every annotation and variant"    set_display_mode { mode: "collapsed", all: true }
"show every read on its own row"           set_display_mode { mode: "full", positions: [3] }
"fill the copy number track"               set_display_mode { mode: "fill", names: ["TCGA CNV"] }
```

- The modes each Track type offers are those of its igv.js menu:

  | Track type | Modes |
  | --- | --- |
  | annotation | `collapsed`, `squished`, `expanded` |
  | variant | `collapsed`, `squished`, `expanded` |
  | alignment | `expanded`, `squished`, `full` |
  | seg | `squished`, `expanded`, `fill`; a seg track of mutations (maf, mut) offers no `fill` |

- A mode the track's type does not offer is an error naming those it does (`"Refseq All" is an annotation track, which offers display modes collapsed, squished and expanded, not full.`). A mode no type offers is an error whatever the tracks.
- A wig track has no display mode: the error points to [`set_signal_style`](#set_signal_style)'s `graphType`. Other Track types are errors naming the four that have one.
- `full` gives every read of an alignment track a row of its own, unpacked; `fill` stretches a seg track's samples to the track's height.
- Notes: `all` passed over tracks that do not offer the mode, each with why (`Passed over by all: "Conservation" is a wig track, which has no display mode: how it is drawn is set by set_signal_style's graphType.`); every track already had it, so nothing changed (`"Refseq All" already had display mode squished, so nothing changed.`).

### `set_color_by`

As igv.js's own "Color by" menus: an alignment track's, a variant track's and an SNP track's.

| Argument | |
| --- | --- |
| `by` | `none`, `strand`, `firstOfPairStrand`, `pairOrientation`, `tlen`, `unexpectedPair`, `tag`, `info`, `function` or `class` |
| `tag` | With `by: "tag"`, the read tag, such as `HP`; with `by: "info"`, the INFO field, such as `AF`. Required with those two, an error with any other |
| `names` | The names of the tracks, each as in [Addressing a track](#what-every-tool-shares) |
| `positions` | And or instead their positions, counted from 1 at the top |
| `all` | `true` for every track that offers it, in place of `names` and `positions` |

The Session summary gives it in the track's `options` as `colorBy`, and a tag or INFO field as `colorByTag`, as the tool takes them: igv.js saves a read tag as `tag:HP` and a variant track's INFO field bare. igv.js gives an alignment track a color-by once its reads are first drawn, `unexpectedPair` where they are paired and `none` where not. A variant track with none recorded colors by `AF` where its file has the field, until its Session is first restored. A color-by or grouping no tool sets, such as an annotation track's feature attribute or a seg track's sample grouping, is not given.

```text
"color the reads by strand"                 set_color_by { by: "strand", names: ["HG00103"] }
"color reads by haplotype"                  set_color_by { by: "tag", tag: "HP", positions: [3] }
"color the variants by allele frequency"    set_color_by { by: "info", tag: "AF", all: true }
"color the SNPs by class"                   set_color_by { by: "class", names: ["dbSNP"] }
```

- What each Track type offers is that of its igv.js menu:

  | Track type | `by` |
  | --- | --- |
  | alignment | `none`, `strand`, `firstOfPairStrand`, `pairOrientation`, `tlen`, `unexpectedPair`, `tag`; the four of paired reads only where its reads are paired |
  | variant | `none`, `info` |
  | SNP annotation (`snp`) | `function`, `class` |

- One the track's type does not offer is an error naming those it does (`"HG00103" is an alignment track, which offers color-by none, strand, firstOfPairStrand, pairOrientation, tlen, unexpectedPair and tag, not info.`). One no type offers, or a `tag` missing or out of place, is an error whatever the tracks.
- A pair color-by on an alignment track whose reads have loaded unpaired is an error naming those they offer. While the reads are still loading it is taken: igv.js has yet to see whether they are paired.
- A read tag is two characters, a letter then a letter or digit, as SAM spells them. An INFO field the variant file does not declare is an error naming those it does.
- A wig track has no color-by: the error points to [`set_track_color`](#set_track_color). So has an annotation track not of SNPs, and the error says so; every other Track type is an error naming the three that have one, and `set_track_color` where it colors the track.
- An SNP track's color-by is not kept in the Session: igv.js colors one by `function` whenever it loads it, so a reload gives back `function`, and the Session summary does not give it.
- `none` on a variant track is saved as `none`, where igv.js's own menu saves nothing, so the Session summary gives it.
- Base-modification coloring is left out of v1 (ADR 0005).
- Notes: `all` passed over tracks that do not offer it, each with why; every track already had it, so nothing changed (`"HG00103" already had color-by tag HP, so nothing changed.`).

### `group_reads`

As igv.js's own alignment "Group by" menu: each group of reads is drawn apart, under its label.

| Argument | |
| --- | --- |
| `by` | `none`, `strand`, `firstOfPairStrand`, `pairOrientation`, `mateChr`, `chimeric`, `supplementary`, `readOrder` or `tag` |
| `tag` | With `by: "tag"`, the read tag, such as `RG`. Required with it, an error with any other |
| `names` | The names of the tracks, each as in [Addressing a track](#what-every-tool-shares) |
| `positions` | And or instead their positions, counted from 1 at the top |
| `all` | `true` for every alignment track, in place of `names` and `positions` |

The Session summary gives it in the track's `options` as `groupBy`, and a tag as `groupByTag`, as the tool takes them. A track without one is not grouped. A grouping by the base or insertion at a position, made by hand from igv.js's right-click menu, is given as igv.js saves it, such as `base:chr8:127,736,231`.

```text
"group the reads by strand"                 group_reads { by: "strand", names: ["HG00103"] }
"split reads by read group"                 group_reads { by: "tag", tag: "RG", all: true }
"ungroup the reads"                         group_reads { by: "none", positions: [3] }
```

- Only alignment tracks have reads to group: any other track is an error.
- `firstOfPairStrand`, `pairOrientation` and `mateChr` are igv.js's groupings of paired reads: on reads loaded unpaired they are an error naming those the reads offer. While the reads are still loading they are taken.
- Grouping by the base or insertion at a position is left out: it takes a position, as a right-click sort does (ADR 0005).
- Notes: `all` passed over tracks that are not alignment tracks, each with why; every track already had the grouping, so nothing changed (`"HG00103" already had its reads grouped by strand, so nothing changed.`).

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

## Controls

### `set_controls`

The Controls are igv.js's Navigation bar, with its locus box and buttons, and, unless the Viewer is Embedded, the Shareable URL, in a strip with a copy button. They are hidden and shown together, and start hidden. An Embedded Viewer never shows the Shareable URL, so there `set_controls` shows and hides the Navigation bar alone.

| Argument | |
| --- | --- |
| `show` (required) | `true` to show, `false` to hide |

```text
"hide the controls"                    set_controls { show: false }
"show me the navigation bar"           set_controls { show: true }
```

- The Session summary says whether they are showing, as `controls`.
- Showing what is already showing, or hiding what is hidden, changes nothing and is not an error.
- A person also hides and shows them with the "Hide controls" and "Show controls" button, so the model takes what is showing from the Session summary, not from what it last set. A click reaches only the Viewer it was made in; `set_controls`, as every Command, reaches every Viewer in the Room.
- They are kept in the Viewer settings, beside the Session and not in it (ADR 0004): reloading the Viewer, or opening it again from the Join link, brings them back as they were left. They are not in the Shareable URL, which is the same whether they are shown or hidden.

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
- A person copies the same link by hand from the Viewer, which shows it above the genome browser and keeps it up to date as the Session changes. It is one of the Controls, so it is hidden, with the Navigation bar, until the person or the model shows the Controls. An Embedded Viewer never shows it, but `get_shareable_url` still answers there.
