# The Viewer is an ordinary web page, opened in the Host's Side panel by a Join link

The Viewer is a hosted web page on its own origin. The Connector's "open viewer" tool returns a Join link (the page's URL carrying `?room=`), and the Host opens that link in its Side panel beside the Conversation. In Claude desktop this is the built-in browser pane: the model opens the link there itself, and a small join card (an MCP App) offers an "Open" button that goes through the Host's open-link request, which Claude routes to the same pane. This is how `juicebox-mcp` (Juicebot) works today, and this project copies it.

Where a Host has no Side panel, or does not route links to it, the same Join link opens in a browser tab and everything else works unchanged. ChatGPT should get the Side panel if it supports one; that is to be established by trying it.

## Considered Options

- **Embed the Viewer inline in the Conversation as an MCP App.** This was the first version of this ADR, written on the mistaken belief that a Connector cannot reach the Side panel. Rejected: it is not the experience wanted (about 500 pixels inline, re-mounted by every tool call that carries UI), and the sandboxed iframe restricts fetches to origins declared in advance. Claude's sandbox also forbids framing other origins, so a hosted page cannot be embedded that way either.

## Consequences

- The Viewer is free of the MCP Apps sandbox: it fetches any URL the browser allows (ordinary CORS), runs web workers, and holds a WebSocket to the server. No fetch allowlist is needed.
- The Viewer must be hosted and deployed as a site in its own right, and the server must check the `Origin` of pages that connect to it.
- The only MCP App is the join card. It carries a link and a button, never the genome browser.
- Opening in the Side panel depends on Host behaviour that is not a documented contract. The fallback (a browser tab) must always work.
