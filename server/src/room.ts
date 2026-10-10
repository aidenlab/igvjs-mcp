import { DurableObject } from 'cloudflare:workers'
import { MessageType, type RoomMessage, type ViewerMessage } from 'igvjs-mcp-viewer/protocol'

/**
 * One Room: the live channel that joins a Connector to its Viewers (ADR 0002).
 * One instance per Room id. Viewers arrive on `fetch` (the WebSocket upgrade
 * from /ws?room=) and are held with the Hibernation API, so an idle Room costs
 * nothing.
 */
export class Room extends DurableObject<Env> {
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
