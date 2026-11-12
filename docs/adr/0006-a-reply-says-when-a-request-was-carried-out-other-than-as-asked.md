# A reply says when a request was carried out other than as asked

Direct manipulation has no ambiguity: a person clicks, drags or groups tracks by hand and sees what happens. Through a model, a person has only words, and finer-grained tools (ADR 0005) give more room for something to be lost in translation, most of all when the request meets something the person cannot see or has forgotten, such as tracks they grouped by hand. So the feedback has two layers. Every change gets a brief acknowledgement, which the model writes from the Session summary. Only when the outcome departs from what was literally asked does the reply also carry a note: a short statement of fact from the Viewer, the only party that knows the live track, which the model passes to the person in a sentence of its own, with discretion, never as a report.

The model learns this from the server's MCP `instructions`, backed by one line in each track tool's description for Hosts that make little of `instructions`.

## When a reply carries a note

- The change reached beyond the track named, or took it out of something, such as an autoscale group.
- `all` passed over tracks the tool does not apply to.
- The change was made but will not show at the current zoom, such as `dynseq` above 2 bp/pixel, or a visibility window smaller than the view.
- The value was already set, so nothing changed.
- "Taller" or "shorter" stopped at a height limit.

A name matched only by ignoring case gets no note: it is what the person meant. A request that changes nothing because it cannot be done is an error, not a note.

## Consequences

- No note on every reply: one the model learns to skip is no note at all. Comparing Session summaries before and after is not left to the model, since that is the guessing this removes.
- The principle holds for every tool. It is first implemented for the track tools and `set_track_height`; the other tools are reviewed separately.
