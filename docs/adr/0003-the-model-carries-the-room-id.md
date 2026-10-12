# The model carries the Room id from one tool call to the next

ADR 0002 binds each MCP session to a Room and assumed one session per Conversation. Claude desktop does not work that way (#19). One Conversation calls the Connector through two clients, each with its own MCP session: the chat (`x-anthropic-client: ClaudeAI`) makes the first calls, and once the model has used the built-in browser an agent runtime (`Cowork`) starts a second session and makes every later one. `open_viewer` therefore ran in the first session's Room and the commands went to the second's, which is empty. No header the Host sends identifies the Conversation, and the chat's session is itself shared by several Conversations.

So the Room id travels through the model. `open_viewer` names the Room id in its reply and tells the model to pass it back; every tool takes an optional `room` argument, and a call that carries one acts on that Room whichever session it arrives through. A call without `room` acts on the session's Room, as before. The server keeps no record of which session goes with which Room.

## Considered Options

- **Bind the Room to something stable for the Conversation**, as ChatGPT's `x-openai-session` is. Rejected: Claude sends no such thing. The headers were logged on 2026-10-11; `mcp-session-id` is per client and `traceparent` is per request.
- **A `join_room` tool, as in `juicebox-mcp`**, with the session-to-Room binding kept in a Durable Object. Rejected: the model cannot tell that its session has changed, so the first command after the change still fails before it knows to call `join_room`, and the binding is server state that a `room` argument does not need.
- **Leave it.** The model was seen to recover by calling `open_viewer` again, which reloads the Viewer into the second Room. Rejected: nothing guarantees the recovery, and once a Room holds a Session the reload leaves that Session behind in the first Room.

## Consequences

- The model has to carry the Room id on every call. The wording that asks for this lives in `open_viewer`'s description and reply and in the `room` argument's description. If the model leaves it out, the call falls back to the session's Room; when that Room has no Viewer the error says to call again with `room`.
- `open_viewer` takes `room` too, so asking for igv-bot again later in a Conversation returns the same Room instead of the new session's.
- The model is still told not to repeat the Join link or the Room id to the person. It holds the id for tool calls only.
- A Room id is a capability: whoever has it can drive that Room's Viewer. That was already true of the Join link, and `room` adds no new way to obtain one.
- ChatGPT's path is unchanged: its Room id is still derived from `x-openai-session`, and it may pass `room` or not.
