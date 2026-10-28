# dev-check cheat sheet

`scripts/dev-check.mjs` drives a Viewer on the dev stack from the terminal, taking the model's place: one tool call per run, aimed at a Room you choose. Use it for a quick smoke test after `scripts/deploy-dev.sh`, without a Host.

Terms in capitals are defined in `GLOSSARY.md`.

## 1. Open the Viewer in a throwaway Room

Make up a Room id: 10 characters from `0-9` and `A-Z` without `I`, `L`, `O` or `U`. `SMKTEST001` works; `SMOKETEST1` does not (it has an `O`). Then open it in a browser:

```
https://igv-bot-web-dev.pages.dev/?room=SMKTEST001
```

This is the address dev Join links use (`VIEWER_URL` in `server/wrangler.toml`): the custom domain `igv-bot-dev.3dg.io` is not attached to the Pages project yet (#15) and answers 502.

Wait for the status line to read "Connected · Room SMKTEST001". Never use a Room someone is working in.

## 2. Send it commands

```sh
node scripts/dev-check.mjs <room> <tool> ['<json args>']
```

The script adds `room` to the arguments itself. It prints the reply, which ends with the Session summary, and exits 1 if the tool answered with an error.

| To | Run |
| --- | --- |
| See what the Viewer shows | `node scripts/dev-check.mjs SMKTEST001 read_session_summary` |
| Go to a gene | `node scripts/dev-check.mjs SMKTEST001 go_to_gene '{"gene":"BRCA1"}'` |
| Go to a locus | `node scripts/dev-check.mjs SMKTEST001 go_to_locus '{"locus":"chr8:127,735,434-127,742,951"}'` |
| Zoom | `node scripts/dev-check.mjs SMKTEST001 zoom_in` (or `zoom_out`) |
| Change genome | `node scripts/dev-check.mjs SMKTEST001 change_genome '{"genome":"mm39"}'` |
| Find tracks | `node scripts/dev-check.mjs SMKTEST001 search_catalogues '{"text":"CTCF ChIP-seq K562"}'` |
| Load a track by URL | `node scripts/dev-check.mjs SMKTEST001 load_tracks '{"tracks":[{"url":"https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw","name":"phyloP"}]}'` |
| Remove a track | `node scripts/dev-check.mjs SMKTEST001 remove_track '{"name":"phyloP"}'` (or `{"position":2}`) |
| Set track height | `node scripts/dev-check.mjs SMKTEST001 set_track_height '{"height":"taller","all":true}'` |
| Crosshairs, centre line | `node scripts/dev-check.mjs SMKTEST001 set_crosshairs '{"show":true}'` (also `set_centre_line`) |
| Show or hide the Controls | `node scripts/dev-check.mjs SMKTEST001 set_controls '{"show":true}'` |
| Get a Shareable URL | `node scripts/dev-check.mjs SMKTEST001 get_shareable_url` |
| Get the Join link again | `node scripts/dev-check.mjs SMKTEST001 open_viewer` |

`docs/tools.md` and `server/src/commandTools.ts` give every tool's arguments.

## A smoke test

```sh
node scripts/dev-check.mjs SMKTEST001 go_to_gene '{"gene":"MYC"}'
node scripts/dev-check.mjs SMKTEST001 search_catalogues '{"text":"CTCF ChIP-seq K562"}'
# load one of the rows it lists, by its url and name, such as
node scripts/dev-check.mjs SMKTEST001 load_tracks '{"tracks":[{"url":"https://www.encodeproject.org/files/ENCFF024JKM/@@download/ENCFF024JKM.bigWig","name":"K562 CTCF"}]}'
node scripts/dev-check.mjs SMKTEST001 read_session_summary
```

Watch the Viewer move and the track appear as each command lands.

## When it goes wrong

- **"no Viewer is in Room …"**: the browser tab is not open on that Room, or has not connected yet.
- **"Sent, unconfirmed"**: the Viewer did not answer in time, often while a large track is still loading. Run `read_session_summary` to see whether the command was applied.
- **Another Worker**: `MCP_URL` overrides the dev Worker, e.g. `MCP_URL=http://localhost:8787/mcp` under `npm run dev:server`. The Viewer must then be one built for that Worker.
- **The server's view**: `npx wrangler tail --env dev` in `server/` logs each call and which Room it acted on.
