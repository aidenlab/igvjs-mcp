import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Command, SavedSession, SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { COMMAND_TOOLS } from './commandTools.ts'
import { lookUpGenome, type Genome } from './genomes.ts'
import {
  JOIN_CARD_HTML,
  JOIN_CARD_META,
  JOIN_CARD_MIME_TYPE,
  JOIN_CARD_TOOL_META,
  JOIN_CARD_URI,
  type JoinCardContent,
} from './joinCard.ts'
import type { CommandDelivery } from './room.ts'
import { mintRoomId, parseRoomId } from './roomId.ts'

export interface ToolDeps {
  /** The Room this MCP session is bound to, or null when the request carries no usable session id. A command without a `room` argument acts on it; open_viewer never does. */
  roomId: string | null
  /** The Viewer's address; a Join link is this URL carrying `?room=`. */
  viewerUrl: string
  /** Pushes a command to the Viewers in a Room and waits for the first ack. */
  sendCommand: (roomId: string, command: Command) => Promise<CommandDelivery>
  /** Makes an expired Room a new one, so that its Join link works again. */
  renewRoom: (roomId: string) => Promise<void>
  /** Saves a Session in a new Room, for the first Viewer that joins it to restore. */
  startRoomOn: (roomId: string, session: SavedSession) => Promise<void>
  /** The igv.org genome list: the genomes igv-bot can show. */
  listGenomes: () => Promise<Genome[]>
}

/**
 * Every tool takes the Room id back from the model: a Host may move a
 * Conversation to another MCP session, whose own Room is empty (ADR 0003).
 */
const ROOM_ARGUMENT = z
  .string()
  .optional()
  .describe('The Room id igv-bot was opened with, as given in the reply of open_viewer. Pass it on every call.')

/** open_viewer's own `room`: there is no Room id to pass the first time, and without one igv-bot opens in a new Room. */
const REOPEN_ROOM_ARGUMENT = z
  .string()
  .optional()
  .describe('Only when igv-bot was already opened in this conversation: the Room id from that reply of open_viewer, to get the same igv-bot back, showing what it last showed. Leave it out the first time: igv-bot then opens in a new Room, on the default view.')

/** The genome igv-bot opens on when open_viewer names a locus and no genome. */
const DEFAULT_GENOME = 'hg38'

const OPEN_GENOME_ARGUMENT = z
  .string()
  .optional()
  .describe('Only when opening a new igv-bot, without room: genome id as on the igv.org genome list, such as "hg19", "mm39" or "hs1", to open on that genome with its default tracks. Leave it out for hg38. For an igv-bot that was already opened, use change_genome instead.')

const OPEN_LOCUS_ARGUMENT = z
  .string()
  .optional()
  .describe('Only when opening a new igv-bot, without room: where it opens, as coordinates chr:start-end, a chromosome name, or a gene name such as "MYC". Leave it out for the genome\'s default view. For an igv-bot that was already opened, use go_to_locus or go_to_gene instead.')

/** An optional argument as the model gave it, trimmed; undefined when it was left out or passed empty. */
function given(argument: string | undefined): string | undefined {
  return argument === undefined || argument.trim() === '' ? undefined : argument.trim()
}

function errorReply(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true }
}

/** The Room a command is for: the one the model names, or else the MCP session's. */
function roomFor(room: string | undefined, sessionRoomId: string | null): { roomId: string; named: boolean } | { refusal: ReturnType<typeof errorReply> } {
  // An empty string is an argument left out, not a malformed Room id.
  if (room === undefined || room.trim() === '') {
    if (sessionRoomId) return { roomId: sessionRoomId, named: false }
    return { refusal: errorReply('this MCP session has no Room. Reconnect the igv-bot Connector and try again.') }
  }
  const roomId = parseRoomId(room)
  if (roomId) return { roomId, named: true }
  return { refusal: errorReply(`"${room}" is not a Room id. Pass the Room id from the reply of open_viewer.`) }
}

/** One log line per tool call: which Room it acted on and how that Room was chosen, so a run can be read back from the Worker's log. */
function logRoom(tool: string, target: { roomId: string; named: boolean }, outcome?: string): void {
  console.log(`[mcp] ${tool} | Room ${target.roomId} from ${target.named ? 'the room argument' : 'the MCP session'}${outcome ? ` | ${outcome}` : ''}`)
}

function withSummary(text: string, summary: SessionSummary): string {
  return `${text}\n\nSession summary:\n${JSON.stringify(summary, null, 2)}`
}

function joinLinkFor(viewerUrl: string, roomId: string): string {
  const joinLink = new URL(viewerUrl)
  joinLink.searchParams.set('room', roomId)
  return joinLink.toString()
}

export function registerTools(mcpServer: McpServer, { roomId: sessionRoomId, viewerUrl, sendCommand, renewRoom, startRoomOn, listGenomes }: ToolDeps): void {
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
        'Get the Join link that opens igv-bot, an igv.js genome browser, connected to a Room. Use this when the user asks to open a genome browser or says things like "open igv-bot", "open IGV", "launch igv-bot" or "show me the genome browser". A greeting addressed to igv-bot ("hello igv-bot", "hello IGV bot", "hi igv") is also a request to open it: call this tool straight away instead of only greeting back. It opens on hg38 in whole-genome view with the default gene annotation track, or on the genome and locus you pass. A card is shown to the user with an Open igv-bot button. If, and only if, you have the built-in browser of the Claude desktop app (the browser panel beside the conversation), open the Join link in it right away: the page connects to its Room and later tool calls redraw it there. Never use Claude in Chrome or any other browser tool for this; if the built-in browser is not available, do not try anything else. Do not repeat the link or the Room id in your reply. The result of this tool names the Room id: pass it as room on every later igv-bot tool call in this conversation, so the calls reach this igv-bot whichever MCP session they arrive through.',
      inputSchema: { room: REOPEN_ROOM_ARGUMENT, genome: OPEN_GENOME_ARGUMENT, locus: OPEN_LOCUS_ARGUMENT },
      _meta: JOIN_CARD_TOOL_META,
    },
    async ({ room, genome, locus }) => {
      const askedGenome = given(genome)
      const askedLocus = given(locus)
      const starting = askedGenome !== undefined || askedLocus !== undefined
      let roomId: string
      let opensOn = ''
      if (given(room) === undefined) {
        // An unavailable genome opens nothing: it is looked up before a Room is minted.
        const found = askedGenome ? await lookUpGenome(askedGenome, listGenomes) : { id: DEFAULT_GENOME }
        if ('unavailable' in found) return errorReply(`${found.unavailable} igv-bot was not opened.`)
        // This is the first open_viewer of a Conversation, and a Conversation
        // gets a Room of its own: an MCP session may be shared by several, and
        // its Room would hand one the Session another saved.
        roomId = mintRoomId()
        console.log(`[mcp] open_viewer | new Room ${roomId}`)
        if (starting) {
          // igv.js takes a genome and locus as its configuration, as it takes a
          // Session it wrote, so the Viewer restores them like any saved Session.
          await startRoomOn(roomId, { genome: found.id, ...(askedLocus ? { locus: askedLocus } : {}) })
          opensOn = `\n\nigv-bot is set to open on ${found.id}${askedLocus ? ` at ${askedLocus}. A locus igv.js does not recognise leaves it on the genome's default view` : ''}.`
        }
      } else {
        const target = roomFor(room, sessionRoomId)
        if ('refusal' in target) return target.refusal
        // A Room that was opened before has a Session of its own, and maybe a
        // Viewer showing it: a genome or locus here would take its place.
        if (starting) {
          return errorReply(
            `genome and locus are for opening a new igv-bot, and Room ${target.roomId} was already opened. To get that igv-bot back, call open_viewer with room alone, then use change_genome, go_to_locus or go_to_gene. To open a new igv-bot on that genome and locus, call open_viewer without room.`,
          )
        }
        logRoom('open_viewer', target)
        roomId = target.roomId
        // The Room may have expired since the model was given its id.
        await renewRoom(roomId)
      }
      const joinLink = joinLinkFor(viewerUrl, roomId)
      const structuredContent: JoinCardContent = { room: roomId, joinUrl: joinLink }
      // A bare URL on its own line: Hosts render it clickable, which a code block
      // would not be. The resource link is the same link for Hosts that render
      // link content blocks.
      return {
        content: [
          {
            type: 'text',
            text: `igv-bot Join link:\n${joinLink}\n\nRoom id: ${roomId}. Pass it as room on every later igv-bot tool call in this conversation.${opensOn}\n\nThe user already sees a card for this. Next step: if you have the Claude desktop app's built-in browser, open this link in it now so igv-bot shows in the panel beside the conversation. Never use Claude in Chrome or another browser tool, and if the built-in browser is unavailable do not attempt to open the link at all. Then reply in one short sentence (igv-bot is opening in the panel, or: press Open igv-bot) and ask what to look at. Do not repeat the link or the Room id in your reply.`,
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
      { title: tool.title, description: tool.description, inputSchema: { ...tool.inputSchema, room: ROOM_ARGUMENT } },
      async ({ room, ...args }: { room?: string } & Record<string, unknown>) => {
        const target = roomFor(room, sessionRoomId)
        if ('refusal' in target) return target.refusal
        if (tool.genomeArgument) {
          const genome = await lookUpGenome(String(args[tool.genomeArgument]), listGenomes)
          if ('unavailable' in genome) {
            logRoom(tool.name, target, 'genome unavailable')
            return errorReply(`${genome.unavailable} igv-bot was left as it was.`)
          }
          args[tool.genomeArgument] = genome.id
        }
        const delivery = await sendCommand(target.roomId, { type: tool.commandType, ...args } as Command)
        logRoom(tool.name, target, delivery.status)
        switch (delivery.status) {
          case 'no-viewer':
            return errorReply(
              target.named
                ? `no Viewer is in Room ${target.roomId}. Call open_viewer with this room and open its Join link, then try again.`
                : "no Viewer is in this MCP session's Room. If igv-bot is already open, call again with room set to the Room id from the reply of open_viewer. Otherwise open igv-bot with open_viewer, then try again.",
            )
          case 'unconfirmed': {
            const unconfirmed = `Sent, unconfirmed: the Viewer did not answer in time, so it is not known whether ${tool.name} was applied.`
            const { lastSummary } = delivery
            const text = lastSummary
              ? withSummary(`${unconfirmed} The Session summary below is the last the Viewer sent, from before this call.`, lastSummary)
              : unconfirmed
            return { content: [{ type: 'text', text }] }
          }
          case 'acked': {
            const { outcome } = delivery
            if (outcome.ok) return { content: [{ type: 'text', text: withSummary('Done.', outcome.summary) }] }
            return errorReply(withSummary(outcome.error, outcome.summary))
          }
        }
      },
    )
  }
}
