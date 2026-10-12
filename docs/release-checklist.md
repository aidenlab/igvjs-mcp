# Release checklist

Done by hand in each Host before each release, against the deployed stack. For the dev stack the connector URL is `https://igv-bot-mcp-dev.3dg.io/mcp` and the Viewer is at `https://igv-bot-dev.3dg.io/`. `scripts/deploy-wizard.sh` walks through the same checks and writes the answers to a file.

Terms in capitals are defined in `GLOSSARY.md`.

The Hosts are Claude desktop, claude.ai on the web, and ChatGPT desktop in Codex mode. A plain ChatGPT chat and ChatGPT on the web are not supported (see the findings in `docs/v1-design.md`).

## Before trying the Hosts

- [ ] `npm run typecheck`, `npm run test:run` and `npm run test:roundtrip` pass.
- [ ] `scripts/deploy-dev.sh` finished without error.
- [ ] `https://igv-bot-dev.3dg.io/` loads hg38 and reads "Not connected. Ask Claude or ChatGPT to open igv-bot."
- [ ] The Connector is added to Claude: Settings → Connectors → Add custom connector, with the connector URL above and the OAuth fields blank.
- [ ] The Connector is added to ChatGPT desktop. In Codex mode: Settings → Plugins → Add → Add MCP server, with Name `igv-bot`, Type Streamable HTTP, the connector URL above, and everything else blank. Save.

## In each Host

Run this list three times: Claude desktop, claude.ai on the web, ChatGPT desktop in Codex mode. Start a new Conversation each time and say "show igv-bot".

- [ ] Claude desktop: the Viewer opens in the Side panel by itself, within about half a minute.
- [ ] claude.ai on the web: the Viewer opens in a browser tab after pressing "Open igv-bot".
- [ ] ChatGPT desktop in Codex mode: the Viewer opens in the Side panel after pressing "Open igv-bot".
- [ ] The Join card has one status line and an "Open igv-bot" button.
- [ ] The model replies in one short sentence and does not repeat the Join link or the Room id.
- [ ] The Viewer launches as igv-webapp does: hg38 in whole-genome view with the ruler, the sequence track and RefSeq genes.
- [ ] The status line reads "Connected · Room …".

## Navigation

Once in each Host, with the Viewer open.

- [ ] "Go to chr8:127,735,434-127,742,951" moves the Viewer there.
- [ ] "Go to BRCA1" moves the Viewer to the gene.
- [ ] "Zoom in" and "zoom out" each change the scale by a factor of two.
- [ ] "Go to NOTAGENE" leaves the view where it was, and the model says the gene was not recognised.

## Room and Conversation

Once in Claude desktop and once in ChatGPT desktop in Codex mode. Read the Room id in the Viewer's status line. The Worker's log (`npx wrangler tail --env dev` in `server`) names the Room each tool call acted on.

- [ ] The first command after opening igv-bot works, and the Viewer does not reload. The Room id in the status line is the same before and after.
- [ ] Asking for igv-bot again later in the same Conversation gives the same Room.
- [ ] After quitting and reopening the app, the same Conversation still gives the same Room.
- [ ] A second Conversation open at the same time: note whether it gets its own Room. Sharing one is accepted for v1.

If one Conversation changes Room partway through, stop the release: the model is not passing `room` as ADR 0003 expects.

## Reopening

Once in each Host, after going to a locus, giving a track a new height and turning on the crosshairs.

- [ ] Reloading the Viewer brings back the same locus, tracks and heights, and the crosshairs.
- [ ] Closing the Viewer and opening it again from the Join card brings back the same view.

## Afterwards

- [ ] Anything that differs from the findings in `docs/v1-design.md` is written there.
