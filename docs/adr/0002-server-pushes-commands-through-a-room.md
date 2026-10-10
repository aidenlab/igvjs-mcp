# The server pushes commands to the Viewer through a Room

The Viewer is a web page, not part of the MCP exchange (ADR 0001), so the server needs its own channel to it. Each MCP session is bound to a Room: one Durable Object, identified by a short server-minted Room id. A Viewer opened from the Join link connects to its Room by WebSocket. A tool call becomes a command pushed to the Viewers in the Room; the Viewer applies it and answers with an ack carrying the resulting Session summary or igv.js's own error. The tool waits about 15 seconds for the ack. With no Viewer in the Room, the tool replies that one must be opened first.

The Viewer also sends the Session summary and the Session to its Room after every change made by hand, so the Room always holds the latest of both.

This follows `juicebox-mcp`, including how a Room is tied to an MCP session: the session id is minted as a Room id on `initialize`, and for ChatGPT, which does not echo that id back, it is derived by HMAC from the `x-openai-session` header.

## Considered Options

- **Queue commands for the Viewer to collect through Viewer-only MCP tools.** The first version of this ADR, needed only because an inline MCP App cannot be pushed to. Rejected along with inline embedding.

## Consequences

- The server is stateful: per Room it holds the sockets, the latest Session summary and the last saved Session, all expired after inactivity. The Session itself still lives in the Viewer; the Room's copy is a mirror, never the source of truth.
- A Viewer that joins a Room which already has a saved Session restores it. Reopening the Join link therefore brings back the last view, with no "one live Viewer" rule to enforce.
- The model is not notified when a person changes something by hand. It sees the current Session summary in the reply to its next tool call, or by asking for it.
- More than one Viewer may join a Room. All receive commands; tools that need an answer ask the first live one. Keeping several Viewers in step with each other's hand changes is not attempted in v1.
