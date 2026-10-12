import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Command, SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { COMMAND_TOOLS } from './commandTools.ts'
import {
  JOIN_CARD_HTML,
  JOIN_CARD_META,
  JOIN_CARD_MIME_TYPE,
  JOIN_CARD_TOOL_META,
  JOIN_CARD_URI,
  type JoinCardContent,
} from './joinCard.ts'
import type { CommandDelivery } from './room.ts'

export interface ToolDeps {
  /** The Room this MCP session is bound to, or null when the request carries no usable session id. */
  roomId: string | null
  /** The Viewer's address; a Join link is this URL carrying `?room=`. */
  viewerUrl: string
  /** Pushes a command to the Viewers in a Room and waits for the first ack. */
  sendCommand: (roomId: string, command: Command) => Promise<CommandDelivery>
}

const NO_ROOM = {
  content: [{ type: 'text' as const, text: 'Error: this MCP session has no Room. Reconnect the igv-bot Connector and try again.' }],
  isError: true,
}

function withSummary(text: string, summary: SessionSummary): string {
  return `${text}\n\nSession summary:\n${JSON.stringify(summary, null, 2)}`
}

function joinLinkFor(viewerUrl: string, roomId: string): string {
  const joinLink = new URL(viewerUrl)
  joinLink.searchParams.set('room', roomId)
  return joinLink.toString()
}

export function registerTools(mcpServer: McpServer, { roomId, viewerUrl, sendCommand }: ToolDeps): void {
  mcpServer.registerResource(
    'igv-bot Join card',
    JOIN_CARD_URI,
    { description: 'MCP App view for open_viewer: one line of status and an Open igv-bot button', mimeType: JOIN_CARD_MIME_TYPE },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: JOIN_CARD_MIME_TYPE, text: JOIN_CARD_HTML, _meta: JOIN_CARD_META }] }),
  )

  // Hosts that render MCP Apps show the Join card, fed from structuredContent;
  // the others get the text link. The wording follows juicebox-mcp's
  // get_juicebox_url: built-in browser only, one short sentence in reply.
  mcpServer.registerTool(
    'open_viewer',
    {
      title: 'Open igv-bot',
      description:
        'Get the Join link that opens igv-bot, an igv.js genome browser, connected to the Room bound to this MCP session. Use this when the user asks to open a genome browser or says things like "open igv-bot", "open IGV", "launch igv-bot" or "show me the genome browser". A greeting addressed to igv-bot ("hello igv-bot", "hello IGV bot", "hi igv") is also a request to open it: call this tool straight away instead of only greeting back. It opens on hg38 in whole-genome view with the default gene annotation track. A card is shown to the user with an Open igv-bot button. If, and only if, you have the built-in browser of the Claude desktop app (the browser panel beside the conversation), open the Join link in it right away: the page connects to this session\'s Room and later tool calls redraw it there. Never use Claude in Chrome or any other browser tool for this; if the built-in browser is not available, do not try anything else. Do not repeat the link or the Room id in your reply.',
      inputSchema: {},
      _meta: JOIN_CARD_TOOL_META,
    },
    async () => {
      if (!roomId) return NO_ROOM
      const joinLink = joinLinkFor(viewerUrl, roomId)
      const structuredContent: JoinCardContent = { room: roomId, joinUrl: joinLink }
      // A bare URL on its own line: Hosts render it clickable, which a code block
      // would not be. The resource link is the same link for Hosts that render
      // link content blocks.
      return {
        content: [
          {
            type: 'text',
            text: `igv-bot Join link:\n${joinLink}\n\nThe user already sees a card for this. Next step: if you have the Claude desktop app's built-in browser, open this link in it now so igv-bot shows in the panel beside the conversation. Never use Claude in Chrome or another browser tool, and if the built-in browser is unavailable do not attempt to open the link at all. Then reply in one short sentence (igv-bot is opening in the panel, or: press Open igv-bot) and ask what to look at. Do not repeat the link or the Room id.`,
          },
          { type: 'resource_link', uri: joinLink, name: 'Open igv-bot', description: 'Join link for igv-bot', mimeType: 'text/html' },
        ],
        structuredContent,
      }
    },
  )
  // Every command tool is the same round trip: one command to the Room's
  // Viewers, and the first ack, or its absence, becomes the reply.
  for (const tool of COMMAND_TOOLS) {
    mcpServer.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        if (!roomId) return NO_ROOM
        const delivery = await sendCommand(roomId, { type: tool.commandType, ...args } as Command)
        switch (delivery.status) {
          case 'no-viewer':
            return {
              content: [{ type: 'text', text: 'Error: no Viewer is in this Room. Open igv-bot first with open_viewer, then try again.' }],
              isError: true,
            }
          case 'unconfirmed':
            return {
              content: [
                {
                  type: 'text',
                  text: `Sent, unconfirmed: the Viewer did not answer in time, so it is not known whether ${tool.name} was applied.`,
                },
              ],
            }
          case 'acked': {
            const { outcome } = delivery
            if (outcome.ok) return { content: [{ type: 'text', text: withSummary('Done.', outcome.summary) }] }
            return { content: [{ type: 'text', text: withSummary(`Error: ${outcome.error}`, outcome.summary) }], isError: true }
          }
        }
      },
    )
  }
}
