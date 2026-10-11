import { DurableObject } from 'cloudflare:workers'
import {
  MessageType,
  isAck,
  type Command,
  type RoomMessage,
  type SessionSummary,
  type ViewerMessage,
} from 'igvjs-mcp-viewer/protocol'

/** How long a command waits for its first ack before the tool reports "sent, unconfirmed". */
export const ACK_TIMEOUT_MS = 15_000

/**
 * What sending a command to a Room comes to: `acked` with the first Viewer's
 * answer, `unconfirmed` when none acks within ACK_TIMEOUT_MS, `no-viewer` when
 * no Viewer is in the Room.
 */
export type CommandOutcome =
  | { status: 'acked'; ok: true; result: SessionSummary }
  | { status: 'acked'; ok: false; error: string }
  | { status: 'unconfirmed' }
  | { status: 'no-viewer' }

/**
 * One Room: the live channel that joins a Connector to its Viewers (ADR 0002).
 * One instance per Room id. Viewers arrive on `fetch` (the WebSocket upgrade
 * from /ws?room=) and are held with the Hibernation API, so an idle Room costs
 * nothing. The Worker's tools call `send` over RPC.
 */
export class Room extends DurableObject<Env> {
  /** Commands awaiting their first ack, by request id. */
  private pendingAcks = new Map<string, { resolve: (outcome: CommandOutcome) => void; timer: ReturnType<typeof setTimeout> }>()

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Not Found', { status: 404 })

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    // The Room id rides on the socket: a hibernated Durable Object does not know its own name.
    server.serializeAttachment({ room: new URL(request.url).searchParams.get('room') })
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Pushes `command`, with a fresh request id, to every Viewer in the Room and waits for the first ack. */
  async send(command: Command): Promise<CommandOutcome> {
    const requestId = crypto.randomUUID()
    let sent = 0
    for (const ws of this.ctx.getWebSockets()) {
      try {
        send(ws, { ...command, requestId })
        sent++
      } catch {
        /* that Viewer is leaving */
      }
    }
    if (sent === 0) return { status: 'no-viewer' }

    // Registered before this method yields, so no ack can arrive ahead of it.
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(requestId)
        resolve({ status: 'unconfirmed' })
      }, ACK_TIMEOUT_MS)
      this.pendingAcks.set(requestId, { resolve, timer })
    })
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
      return
    }

    // The first ack for a command settles it; later acks from other Viewers are dropped.
    if (isAck(data)) {
      const pending = this.pendingAcks.get(data.requestId)
      if (!pending) return
      this.pendingAcks.delete(data.requestId)
      clearTimeout(pending.timer)
      pending.resolve(data.ok ? { status: 'acked', ok: true, result: data.result } : { status: 'acked', ok: false, error: data.error })
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
