import { DurableObject } from 'cloudflare:workers'
import {
  MessageType,
  type AckMessage,
  type Command,
  type CommandOutcome,
  type RoomMessage,
  type SavedSession,
  type SessionSummary,
  type ViewerMessage,
} from 'igvjs-mcp-viewer/protocol'

/** How long a command waits for the first ack. The tests shorten it with an ACK_TIMEOUT_MS binding. */
const ACK_TIMEOUT_MS = 15_000

/** What became of a command sent to a Room. An unconfirmed one carries the Session summary the Room last heard, if any. */
export type CommandDelivery =
  | { status: 'acked'; outcome: CommandOutcome }
  | { status: 'unconfirmed'; lastSummary?: SessionSummary }
  | { status: 'no-viewer' }

/** Storage key of the latest Session summary a Viewer sent, in an ack or with its Session. */
const SUMMARY_KEY = 'summary'

/** Storage key of the last Session a Viewer saved. */
const SESSION_KEY = 'session'

/** How long after the last message from a Viewer a Room with no Viewer in it has its stored data deleted. It is also how long a Join link lives. */
const INACTIVITY_MS = 24 * 60 * 60 * 1000

/** Storage key that marks a Room whose stored data was deleted with no Viewer in it. */
const EXPIRED_KEY = 'expired'

/**
 * One Room: the live channel that joins a Connector to its Viewers (ADR 0002).
 * One instance per Room id. Viewers arrive on `fetch` (the WebSocket upgrade
 * from /ws?room=) and are held with the Hibernation API, so an idle Room costs
 * nothing. The Room keeps the latest Session summary and Session its Viewers
 * send. They are mirrors: the Viewer's own answer is preferred whenever there
 * is one, and the saved Session is only for a Viewer that joins later to restore.
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
      if (outcome) return { status: 'acked', outcome }
      return { status: 'unconfirmed', lastSummary: await this.ctx.storage.get<SessionSummary>(SUMMARY_KEY) }
    } finally {
      clearTimeout(timer)
      this.pending.delete(id)
    }
  }

  /**
   * The latest Session summary a Viewer sent, if any. Called by
   * search_catalogues over RPC, which reads the genome from it and sends the
   * Viewer nothing.
   */
  async lastSummary(): Promise<SessionSummary | undefined> {
    return this.ctx.storage.get<SessionSummary>(SUMMARY_KEY)
  }

  /**
   * Makes an expired Room a new one, so that its Join link works again. Called
   * by open_viewer over RPC: a Host may ask for igv-bot in the same Room after
   * the Room has expired, and ChatGPT's Room id never changes.
   */
  async renew(): Promise<void> {
    await this.ctx.storage.delete(EXPIRED_KEY)
  }

  /**
   * Saves `session` in a new Room, for the first Viewer that joins to restore.
   * Called by open_viewer over RPC when it is asked for a genome or locus. A
   * Room no Viewer ever joins expires like any other.
   */
  async startOn(session: SavedSession): Promise<void> {
    await this.ctx.storage.put(SESSION_KEY, session)
    await this.ctx.storage.setAlarm(Date.now() + INACTIVITY_MS)
  }

  /**
   * The inactivity period is over. With no Viewer in the Room its stored data
   * is deleted, and a later join is told the Room has expired. A Viewer still
   * here keeps its Room as it is: it would not save its Session a second time.
   */
  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + INACTIVITY_MS)
      return
    }
    await this.ctx.storage.deleteAll()
    await this.ctx.storage.put(EXPIRED_KEY, true)
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

    if (data?.type === MessageType.JOIN && (await this.ctx.storage.get(EXPIRED_KEY))) {
      send(ws, { type: MessageType.EXPIRED })
      ws.close(1000, 'Room expired')
      return
    }

    // A command is answered before anything is stored. Later acks of the same
    // command, from other Viewers, find nothing pending.
    if (data?.type === MessageType.ACK) this.pending.get(data.id)?.(outcomeOf(data))

    // Every message from a Viewer puts the deletion of the Room's stored data off.
    await this.ctx.storage.setAlarm(Date.now() + INACTIVITY_MS)

    // The socket already reached this Room through /ws?room=; `join` confirms which one.
    if (data?.type === MessageType.JOIN) {
      const { room } = ws.deserializeAttachment() as { room: string }
      const session = await this.ctx.storage.get<SavedSession>(SESSION_KEY)
      send(ws, { type: MessageType.JOINED, room, ...(session ? { session } : {}) })
    } else if (data?.type === MessageType.ACK) {
      await this.ctx.storage.put(SUMMARY_KEY, data.summary)
    } else if (data?.type === MessageType.SESSION) {
      await this.ctx.storage.put({ [SUMMARY_KEY]: data.summary, [SESSION_KEY]: data.session })
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

function outcomeOf({ type: _, id: __, ...outcome }: AckMessage): CommandOutcome {
  return outcome
}

function send(ws: WebSocket, message: RoomMessage): void {
  ws.send(JSON.stringify(message))
}
