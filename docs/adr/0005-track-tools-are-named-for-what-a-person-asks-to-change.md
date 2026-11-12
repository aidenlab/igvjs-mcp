# Track tools are named for what a person asks to change

Beyond its height, a track has many Track options igv.js offers in its gear menu: graph type, display mode, data range, color-by and so on. Nearly every one sets a single field that igv.js already saves in the Session, so the tools expose those options, not the menu. The question was how to group them. A person names the change they want, "expand the genes", "show it as a line", "color reads by strand", "hide the coverage", never a Track type, and the point of driving igv.js through a model is that the person's words are enough. So there is one tool per kind of change, and where the same change exists on several Track types, one tool covers them all: `set_display_mode`, `set_signal_style`, `set_data_range`, `set_color_by`, `group_reads`, `set_track_color`, `show_track_parts`, `set_arcs`, `set_visibility_window` and `rename_track`, beside `set_track_height` and `remove_track`. Each Track option has exactly one home.

## Considered Options

- **One tool per family of Track types** (`set_signal_track`, `set_feature_track`, `set_alignment_track`, …), as first drafted from igv.js's Track classes. Each schema is exact, but the grouping follows igv.js's internals, so the model must translate twice, from the request to a Track type and from the type to a tool, and some options, such as color, had two homes.
- **One tool per Track type.** About 18, most for types the Connector cannot even create.
- **One generic tool taking a bag of options.** Its schema tells the model nothing.

## Consequences

- One argument can have different legal values on different Track types: alignment offers a `full` display mode, seg a `fill`. The schema lists every value; the Viewer rejects one the track does not support with an error naming those it does.
- The Viewer validates, not the server: it knows the live track, while the Room's Session summary may be stale after a change by hand. A tool aimed at a Track type it does not apply to is an error naming the right tool. The color and data range of a wig track drawn as a heatmap are an error pointing to `set_signal_style`'s `colorScale`.
- A call is all or nothing: every option is checked against every selected track before any is applied.
- Tracks are chosen as for `set_track_height`: names, positions or `all`, where `all` means every track the tool applies to. An alignment track is the target for its coverage too: `set_data_range` sets the coverage's range and `show_track_parts` shows or hides `coverage` and `alignments`.
- Track types are folded into igv.js's canonical name (genes, feature, snp → annotation; interaction → interact; maf, mut → seg), in the Session summary too, because igv.js's own menus treat the aliases inconsistently.
- The Session summary gives each track an `options` object: only the Track options a tool controls, and only those the track's saved state records, so replies stay short.
- Left out of v1: tools for the rare Track types beyond rename, color and data range; right-click sorts, which take a position and are not Track options; `.hic` normalization; base-modification coloring; and autoscale groups. Binding a chosen set of tracks together works better by hand than in words. A fixed range set on a track a person grouped by hand takes it out of the group, as it does in igv.js, and the reply says so (ADR 0006).
