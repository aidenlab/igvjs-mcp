/**
 * GET /version as a person sees it in a browser: the same report as the JSON,
 * laid out as a page in the visual language of geenee's own pages (aidenlab/geenee
 * src/page.ts, its /versions): its tokens and fonts, light and dark. The JSON
 * stays the answer for everything else.
 */
import type { VersionReport } from './version.ts'

const escapeHtml = (text: unknown) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@500;600&family=Source+Serif+4:opsz,wght@8..60,400&display=swap'

const STYLE = `
:root {
  --bg: #f5f6f4; --box: #ffffff; --fg: #1b1d1c; --muted: #636966; --rule: #cdd2ce;
  --serif: "Source Serif 4", "Iowan Old Style", Georgia, serif;
  --sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151716; --box: #1e2120; --fg: #e5e7e4; --muted: #9aa19c; --rule: #3b403d; color-scheme: dark; }
}
body { margin: 0; background: var(--bg); color: var(--fg); font: 1.0625rem/1.6 var(--serif); }
main {
  max-width: 42rem; margin-inline: auto;
  padding: 12vh max(16px, env(safe-area-inset-right, 0px)) 4rem max(16px, env(safe-area-inset-left, 0px));
}
.brand { font: 400 0.85rem var(--mono); color: var(--muted); margin: 0 0 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--rule); }
h1 { font: 600 2rem/1.15 var(--sans); letter-spacing: -0.01em; margin: 0 0 0.75rem; }
.lede { font-size: 1.2rem; line-height: 1.5; color: var(--muted); margin: 0 0 2.25rem; text-wrap: pretty; }
code { font-family: var(--mono); font-size: 0.9em; }
a { color: inherit; text-decoration-color: var(--rule); text-underline-offset: 0.15em; }
a:hover { text-decoration-color: currentColor; }
table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
th, td { text-align: left; padding: 0.55rem 1rem 0.55rem 0; border-bottom: 1px solid var(--rule); vertical-align: baseline; }
thead th { font: 500 0.8rem var(--sans); color: var(--muted); }
tbody th { font: 600 0.95rem var(--sans); }
td code { overflow-wrap: anywhere; }
.host { color: var(--muted); }
.absent { font: 500 0.9rem var(--sans); color: var(--muted); }
footer { margin-top: 3rem; padding-top: 0.75rem; border-top: 1px solid var(--rule); font: 0.8rem/1.45 var(--sans); color: var(--muted); }
`

/** The page for the Worker at `origin` and `report`, what /version answers as JSON. */
export function versionPage(origin: string, { worker, viewer }: VersionReport): string {
  const row = (name: string, url: string, version: unknown, error?: unknown) => `
      <tr>
        <th scope="row">${name}</th>
        <td>${version === undefined
          ? `<span class="absent">could not be read: ${escapeHtml(error ?? 'version.json names no version')}</span>`
          : `<code>${escapeHtml(version)}</code>`}</td>
        <td><a class="host" href="${escapeHtml(url)}"><code>${escapeHtml(new URL(url).host)}</code></a></td>
      </tr>`
  const host = escapeHtml(new URL(origin).host)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>igv versions</title>
<meta name="description" content="The version of this igv MCP Worker and of the Viewer page it serves.">
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>
<main>
  <p class="brand">${host}</p>
  <h1>Versions</h1>
  <p class="lede">What this igv Deployment runs: its MCP Worker, and the Viewer page as it reported when this page loaded.</p>
  <table>
    <thead><tr><td></td><th scope="col">Version</th><th scope="col">Address</th></tr></thead>
    <tbody>${row('Worker', `${origin}/mcp`, worker)}${row('Viewer page', new URL('/', viewer.url).href, viewer.version, viewer.error)}
    </tbody>
  </table>
  <footer>Each version is a tag or branch and its commit. Reload to ask again. Scripts get this as JSON (any request that does not ask for HTML).</footer>
</main>
</body>
</html>
`
}
