/**
 * The Viewer's connection to its Room, driven through a fake socket: tests
 * assert what the Viewer sends and the statuses it reports.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { connectToRoom, roomSocketUrl, type RoomSocket, type RoomStatus } from '../src/roomConnection.ts'

class FakeSocket implements RoomSocket {
  onopen: RoomSocket['onopen'] = null
  onmessage: RoomSocket['onmessage'] = null
  onclose: RoomSocket['onclose'] = null
  sent: unknown[] = []
  url: string

  constructor(url: string) {
    this.url = url
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {}

  /** The server accepts the socket. */
  open() {
    this.onopen?.(new Event('open'))
  }
  /** The server sends a message. */
  receive(message: object) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }))
  }
  /** The socket drops. */
  drop() {
    this.onclose?.(new CloseEvent('close'))
  }
}

function connect() {
  const sockets: FakeSocket[] = []
  const statuses: RoomStatus[] = []
  connectToRoom({
    url: 'ws://server.test/ws?room=7ZQH4M2K9X',
    onStatus: (status) => statuses.push(status),
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
  })
  return { sockets, statuses }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('joining a Room', () => {
  it('sends join once the socket opens and reports the Room the server answers with', () => {
    const { sockets, statuses } = connect()

    expect(sockets.map((socket) => socket.url)).toEqual(['ws://server.test/ws?room=7ZQH4M2K9X'])
    expect(sockets[0].sent).toEqual([])
    expect(statuses).toEqual([{ state: 'connecting' }])

    sockets[0].open()
    expect(sockets[0].sent).toEqual([{ type: 'join' }])

    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })
    expect(statuses.at(-1)).toEqual({ state: 'joined', room: '7ZQH4M2K9X' })
  })
})

describe('when the socket drops', () => {
  it('reports it, then reconnects by itself and joins the Room again', () => {
    vi.useFakeTimers()
    const { sockets, statuses } = connect()
    sockets[0].open()
    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })

    sockets[0].drop()
    expect(statuses.at(-1)).toEqual({ state: 'reconnecting' })
    expect(sockets).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2)
    expect(sockets[1].url).toBe('ws://server.test/ws?room=7ZQH4M2K9X')

    sockets[1].open()
    sockets[1].receive({ type: 'joined', room: '7ZQH4M2K9X' })
    expect(sockets[1].sent).toEqual([{ type: 'join' }])
    expect(statuses.at(-1)).toEqual({ state: 'joined', room: '7ZQH4M2K9X' })
  })

  it('keeps trying while the server stays away, waiting longer each time up to 5 seconds', () => {
    vi.useFakeTimers()
    const { sockets } = connect()

    const waits: number[] = []
    for (let attempt = 1; attempt <= 7; attempt++) {
      sockets.at(-1)!.drop() // never opened: the server is away
      const before = Date.now()
      while (sockets.length === attempt && Date.now() - before < 60_000) vi.advanceTimersByTime(500)
      waits.push(Date.now() - before)
    }

    expect(waits).toEqual([1000, 2000, 3000, 4000, 5000, 5000, 5000])
  })

  it('starts again from a 1 second wait once a reconnect has succeeded', () => {
    vi.useFakeTimers()
    const { sockets } = connect()
    sockets[0].drop()
    vi.advanceTimersByTime(1000)
    sockets[1].drop()
    vi.advanceTimersByTime(2000)
    sockets[2].open()

    sockets[2].drop()
    vi.advanceTimersByTime(1000)

    expect(sockets).toHaveLength(4)
  })
})

describe('roomSocketUrl', () => {
  it.each([
    ['http://localhost:8787', 'ws://localhost:8787/ws?room=7ZQH4M2K9X'],
    ['https://igv-bot-mcp.example.org/', 'wss://igv-bot-mcp.example.org/ws?room=7ZQH4M2K9X'],
  ])("the Room's socket on %s is %s", (serverUrl, expected) => {
    expect(roomSocketUrl(serverUrl, '7ZQH4M2K9X')).toBe(expected)
  })
})
