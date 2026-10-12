import { DurableObject } from 'cloudflare:workers'
import {
  MessageType,
  type Command,
  type CommandOutcome,
  type RoomMessage,
  type ViewerMessage,
} from 'igvjs-mcp-viewer/protocol'

/** How long a command waits for the first ack. The tests shorten it with an ACK_TIMEOUT_MS binding. */
const ACK_TIMEOUT_MS = 15_000

/** What became of a command sent to a Room. */
export type CommandDelivery = { status: 'acked'; outcome: CommandOutcome } | { status: 'unconfirmed' } | { status: 'no-viewer' }

/**
 * One Room: the live channel that joins a Connector to its Viewers (ADR 0002).
 * One instance per Room id. Viewers arrive on `fetch` (the WebSocket upgrade
 * from /ws?room=) and are held with the Hibernation API, so an idle Room costs
 * nothing.
 */
export class Room extends DurableObject<Env> {
  /** Commands waiting for their first ack, by request id. */
  private pending = new Map<string, (outcome: CommandOutcome) => void>()

  /**
   * Pushes `command` to every Viewer in the Room and waits for the first ack.
   * Called by the tools over RPC.
   */
  async command(command: Command): Promise<CommandDelivery> {
    const viewers = this.ctx.getWebSockets()
    if (viewers.length === 0) return { status: 'no-viewer' }

    const id = crypto.randomUUID()
    const wait = (this.env as { ACK_TIMEOUT_MS?: number }).ACK_TIMEOUT_MS ?? ACK_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const outcome = await new Promise<CommandOutcome | null>((resolve) => {
        this.pending.set(id, resolve)
        timer = setTimeout(resolve, wait, null)
        for (const viewer of viewers) {
          try {
            send(viewer, { type: MessageType.COMMAND, id, command })
          } catch {
            /* this Viewer is leaving; the others still get the command */
          }
        }
      })
      return outcome ? { status: 'acked', outcome } : { status: 'unconfirmed' }
    } finally {
      clearTimeout(timer)
      this.pending.delete(id)
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Not Found', { status: 404 })

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    // The Room id rides on the socket: a hibernated Durable Object does not know its own name.
    server.serializeAttachment({ room: new URL(request.url).searchParams.get('room') })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let data: ViewerMessage
    try {
      data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    } catch {
      return // not ours; ignored
    }

    // The socket already reached this Room through /ws?room=; `join` confirms which one.
    if (data?.type === MessageType.JOIN) {
      const { room } = ws.deserializeAttachment() as { room: string }
      send(ws, { type: MessageType.JOINED, room })
    } else if (data?.type === MessageType.ACK) {
      // Later acks of the same command, from other Viewers, find nothing pending.
      const { type: _, id, ...outcome } = data
      this.pending.get(id)?.(outcome)
    }
  }

  webSocketClose(ws: WebSocket): void {
    // Answer the close so the socket leaves the Room.
    try {
      ws.close()
    } catch {
      /* already closed */
    }
  }
}

function send(ws: WebSocket, message: RoomMessage): void {
  ws.send(JSON.stringify(message))
}
