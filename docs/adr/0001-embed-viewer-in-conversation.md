# Embed the Viewer in the Conversation as an MCP App

The original intent was to show the Viewer in the Host's side panel beside the chat. As of October 2026 neither Claude nor ChatGPT documents a way for a third-party Connector to target that panel (Claude's artifacts panel or browser pane, ChatGPT's canvas); the only surfaces a Connector can use are inline in the Conversation, fullscreen, and picture-in-picture on ChatGPT. We therefore deliver the Viewer as an MCP App: a `ui://` resource the Host renders inline, with a fullscreen button the Viewer supplies itself. Both Hosts implement the same MCP Apps standard, so one implementation serves both.

## Considered Options

- **Separate browser tab driven by the server.** Rejected: nothing is embedded in the Conversation, which is the point of the project. This is how the deprecated `igvweb-mcp` worked.
- **Host side panel.** Not available to a Connector. Revisit if either Host opens it up.

## Consequences

- The Viewer runs in a sandboxed iframe and may only fetch from origins the server declares in advance, each of which must also permit the sandbox origin via CORS. Arbitrary track URLs work only on allowlisted hosts until a proxy is added.
- OAuth popups and local file access should be assumed unavailable, which is why Dropbox, Google Drive and local files are out of scope.
