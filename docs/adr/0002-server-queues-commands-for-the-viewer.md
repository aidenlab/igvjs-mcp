# The server queues commands; the Viewer collects them

A Host mounts a new iframe for every tool call that carries UI, and MCP Apps gives the Host no way to push an unrelated tool call into a Viewer that is already on screen. So exactly one tool, "open viewer", carries UI. Every other tool is UI-less: the server queues the command, the live Viewer collects it through tools only the Viewer can call, applies it, and reports the resulting Session summary back.

## Consequences

- The server is stateful: per Viewer it holds a command queue and a mirror of the latest Session summary, expired after inactivity. The server is hosted on Cloudflare, where a Worker keeps nothing in memory between requests, so this state lives in one Durable Object per Viewer.
- The Session itself still lives in the Viewer; the server's copy is a mirror, never the source of truth.
- Only one Viewer per Conversation is live. Opening another restores the latest Session into it, and earlier copies become inert.
