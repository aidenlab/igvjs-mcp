# Release checklist

Done by hand in both Hosts before each release, against the deployed stack. For the dev stack the connector URL is `https://igv-bot-mcp-dev.3dg.io/mcp` and the Viewer is at `https://igv-bot-dev.3dg.io/`. `scripts/deploy-wizard.sh` walks through the same checks and writes the answers to a file.

Terms in capitals are defined in `GLOSSARY.md`.

Only Claude is supported for now (see the findings in `docs/v1-design.md`). Until ChatGPT works, skip its items below.

## Before trying the Hosts

- [ ] `npm run typecheck`, `npm run test:run` and `npm run test:roundtrip` pass.
- [ ] `scripts/deploy-dev.sh` finished without error.
- [ ] `https://igv-bot-dev.3dg.io/` loads hg38 and reads "Not connected. Ask Claude or ChatGPT to open igv-bot."
- [ ] The Connector is added to Claude and to ChatGPT with the connector URL above and no authentication.

## In each Host

Run this list four times: Claude desktop, claude.ai on the web, ChatGPT desktop, ChatGPT on the web. Start a new Conversation each time and say "hello igv-bot".

- [ ] The Viewer opens in the Side panel where the Host has one (Claude desktop, ChatGPT desktop), and in a browser tab otherwise.
- [ ] Where the Host shows the Join card, it has one status line and an "Open igv-bot" button, and the button opens the Viewer in the same place.
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

Once in Claude desktop and once in ChatGPT desktop. Read the Room id in the Viewer's status line.

- [ ] Asking for igv-bot again later in the same Conversation gives the same Room.
- [ ] After quitting and reopening the app, the same Conversation still gives the same Room.
- [ ] A second Conversation open at the same time: note whether it gets its own Room. Sharing one is accepted for v1.

If one Conversation changes Room partway through, stop the release: that needs an ADR and a ticket.

## Afterwards

- [ ] Anything that differs from the findings in `docs/v1-design.md` is written there.
