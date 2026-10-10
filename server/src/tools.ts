import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface ToolDeps {
  /** The Room this MCP session is bound to, or null when the request carries no usable session id. */
  roomId: string | null
  /** The Viewer's address; a Join link is this URL carrying `?room=`. */
  viewerUrl: string
}

function joinLinkFor(viewerUrl: string, roomId: string): string {
  const joinLink = new URL(viewerUrl)
  joinLink.searchParams.set('room', roomId)
  return joinLink.toString()
}

export function registerTools(mcpServer: McpServer, { roomId, viewerUrl }: ToolDeps): void {
  mcpServer.registerTool(
    'open_viewer',
    {
      title: 'Open igv-bot',
      description:
        'Get the Join link that opens igv-bot, an igv.js genome browser, connected to this conversation. Use this when the user asks to open a genome browser or says things like "hello igv-bot", "open igv-bot", "open IGV" or "show me the genome browser". It opens on hg38 in whole-genome view with the default gene annotation track.',
      inputSchema: {},
    },
    async () => {
      if (!roomId) {
        return {
          content: [{ type: 'text', text: 'Error: this MCP session has no Room. Reconnect the igv-bot Connector and try again.' }],
          isError: true,
        }
      }
      const joinLink = joinLinkFor(viewerUrl, roomId)
      // A bare URL on its own line: Hosts render it clickable, which a code block
      // would not be. The resource link is the same link for Hosts that render
      // link content blocks.
      return {
        content: [
          { type: 'text', text: `igv-bot Join link:\n${joinLink}\n\nOpening it shows the genome browser connected to this conversation.` },
          { type: 'resource_link', uri: joinLink, name: 'Open igv-bot', description: 'Join link for igv-bot', mimeType: 'text/html' },
        ],
      }
    },
  )
}
