/**
 * Fake Viewers: real WebSocket clients on the Worker's /ws.
 */
import { SELF } from 'cloudflare:test'
import { expect } from 'vitest'
import { MessageType, type RoomMessage, type ViewerMessage } from 'igvjs-mcp-viewer/protocol'

export const ORIGIN = 'http://localhost:5173' // on the wrangler.toml list of Viewer origins

export function upgrade(query = '', origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { Upgrade: 'websocket' }
  if (origin) headers.Origin = origin
  return SELF.fetch(`https://igv-bot.test/ws${query}`, { headers })
}

const open: WebSocket[] = []

/** Close every socket opened since the last call; for afterEach. */
export function closeViewers() {
  for (const ws of open.splice(0)) ws.close()
}

/** Open a Viewer's socket to `room`; `next()` resolves with the next message it receives. */
export async function openViewer(room: string) {
  const res = await upgrade(`?room=${room}`)
  expect(res.status).toBe(101)
  const ws = res.webSocket!
  ws.accept()
  open.push(ws)

  const queued: RoomMessage[] = []
  const waiting: Array<(msg: RoomMessage) => void> = []
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data as string) as RoomMessage
    const resolve = waiting.shift()
    if (resolve) resolve(msg)
    else queued.push(msg)
  })

  return {
    send: (msg: ViewerMessage) => ws.send(JSON.stringify(msg)),
    next: () => (queued.length ? Promise.resolve(queued.shift()!) : new Promise<RoomMessage>((r) => waiting.push(r))),
  }
}

export type FakeViewer = Awaited<ReturnType<typeof openViewer>>

export function join(viewer: FakeViewer) {
  viewer.send({ type: MessageType.JOIN })
  return viewer.next()
}
