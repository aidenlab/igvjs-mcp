## Agent skills

### Issue tracker

Issues live in GitHub Issues for `aidenlab/igvjs-mcp`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Viewer conventions

- TypeScript and Vite.
- Stylesheets are Sass.
- Widgets are hand-built. No Bootstrap or other CSS framework: their global styles bleed into igv.js's own popups and menus.
- Class names this project writes follow BEM (Block Element Modifier): `block__element--modifier`.
