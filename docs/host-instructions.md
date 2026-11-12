# How Hosts give the model a server's `instructions`

Checked 2026-11-12 for #59 (ADR 0006). The MCP spec makes `InitializeResult.instructions` only a hint: a Host "MAY" add it to the system prompt ([schema](https://modelcontextprotocol.io/specification/2025-11-25/schema)). What each Host actually does:

| Host | Gives `instructions` to the model? | Confidence |
| --- | --- | --- |
| Claude Code | Yes, in the system prompt under "MCP Server Instructions". Cut at 4,096 characters by default (2,048 before v2.1.296) ([docs](https://code.claude.com/docs/en/mcp)) | High |
| Claude desktop app, custom connectors | Unknown. No official doc mentions the field. Only reports from users, not maintainers, say it is stored and never read ([#43749](https://github.com/anthropics/claude-code/issues/43749), [#41834](https://github.com/anthropics/claude-code/issues/41834)) | Low |
| claude.ai, custom connectors | Unknown, for the same reasons as the desktop app ([#41834](https://github.com/anthropics/claude-code/issues/41834)) | Low |
| ChatGPT (Apps SDK, developer mode) | Used "alongside tool metadata". OpenAI advises: "Keep the most important details in the first 512 characters." Nothing documents whether the text reaches the system prompt ([docs](https://developers.openai.com/plugins/build/mcp-server)) | Medium |
| Codex CLI | Yes, but as the description of the server's tool namespace, used in tool search, not as a block of instructions (`codex-rs/codex-mcp/src/rmcp_client.rs`; [openai/codex#29097](https://github.com/openai/codex/issues/29097)) | High |

## What igv-bot does about it

- `SERVER_INSTRUCTIONS` (`server/src/tools.ts`) is under 512 characters, so ChatGPT's advice is met and Claude Code's limit is far off.
- Because the Claude desktop app and claude.ai may never show `instructions` to the model, the tool description carries the rule. Each tool that can give a note ends with `NOTE_LINE` (`server/src/commandTools.ts`).
- To settle the two unknowns, run a live test: give the server a distinctive instruction, then ask Claude, in the desktop app and in claude.ai, to quote it.
