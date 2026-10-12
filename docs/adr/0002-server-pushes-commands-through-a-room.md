# The server pushes commands to the Viewer through a Room

The Viewer is a web page, not part of the MCP exchange (ADR 0001), so the server needs its own channel to it. Each MCP session is bound to a Room: one Durable Object, identified by a short server-minted Room id. A Viewer opened from the Join link connects to its Room by WebSocket. A tool call becomes a command pushed to the Viewers in the Room; the Viewer applies it and answers with an ack: ok, or igv.js's own error, either way with the resulting Session summary. The tool waits about 15 seconds for the ack. With no Viewer in the Room, the tool replies that one must be opened first.

The Viewer also sends the Session summary and the Session to its Room after every change, whoever made it, so the Room always holds the latest of both.

This follows `juicebox-mcp`, including how a Room is tied to an MCP session: the session id is minted as a Room id on `initialize`, and for ChatGPT, which does not echo that id back, it is derived by HMAC from the `x-openai-session` header. That describes a ChatGPT chat. ChatGPT desktop in Codex mode, the one ChatGPT Host supported in v1 (#17), echoes `mcp-session-id` and sends `x-openai-session` only some of the time; both paths stay.

An MCP session is not a Conversation: Claude desktop moves one Conversation across two MCP sessions. ADR 0003 has the model carry the Room id so that a call reaches the right Room whichever MCP session it arrives through.

## Considered Options

- **Queue commands for the Viewer to collect through Viewer-only MCP tools.** The first version of this ADR, needed only because an inline MCP App cannot be pushed to. Rejected along with inline embedding.

## Consequences

- The server is stateful: per Room it holds the sockets, the latest Session summary and the last saved Session, all expired after inactivity. The Session itself still lives in the Viewer; the Room's copy is a mirror, never the source of truth.
- A Viewer that joins a Room which already has a saved Session restores it, when it has just been opened; one that reconnects keeps its own. Reopening the Join link therefore brings back the last view, with no "one live Viewer" rule to enforce.
- A Room's stored data is deleted 24 hours after the last message from a Viewer, unless a Viewer is still connected, and the Room then answers a join with "expired". `open_viewer` makes such a Room a new one: the Room id of an MCP session never changes, and ChatGPT's is derived, so asking the model for a new Viewer leads back to the same Room.
- The model is not notified when a person changes something by hand. It sees the current Session summary in the reply to its next tool call, or by asking for it.
- More than one Viewer may join a Room. All receive commands; tools that need an answer ask the first live one. Keeping several Viewers in step with each other's hand changes is not attempted in v1.
