/**
 * The Viewer's connection to its Room, driven through a fake socket: tests
 * assert what the Viewer sends and the statuses it reports.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Command, SessionSummary } from '../src/protocol.ts'
import { connectToRoom, roomSocketUrl, statusText, type RoomSocket, type RoomStatus } from '../src/roomConnection.ts'

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

const SUMMARY: SessionSummary = { genome: 'hg38', loci: ['chr8:1-100'], tracks: [], crosshairs: false, centreLine: false }

function connect(applyCommand: (command: Command) => Promise<SessionSummary> = async () => SUMMARY) {
  const sockets: FakeSocket[] = []
  const statuses: RoomStatus[] = []
  connectToRoom({
    url: 'ws://server.test/ws?room=7ZQH4M2K9X',
    onStatus: (status) => statuses.push(status),
    applyCommand,
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

describe('a command from the Room', () => {
  function joined(applyCommand?: (command: Command) => Promise<SessionSummary>) {
    const { sockets } = connect(applyCommand)
    sockets[0].open()
    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })
    sockets[0].sent.length = 0
    return sockets[0]
  }

  it('is applied without its request id and acked ok with the resulting Session summary', async () => {
    const applied: Command[] = []
    const socket = joined(async (command) => {
      applied.push(command)
      return SUMMARY
    })

    socket.receive({ type: 'goToLocus', locus: 'chr8:1-100', requestId: 'request-1' })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))

    expect(applied).toEqual([{ type: 'goToLocus', locus: 'chr8:1-100' }])
    expect(socket.sent).toEqual([{ type: 'ack', requestId: 'request-1', ok: true, result: SUMMARY }])
  })

  it('that fails is acked not ok, carrying the message of the error raised', async () => {
    const socket = joined(async () => {
      throw new Error('Unrecognized locus: NOTAGENE')
    })

    socket.receive({ type: 'goToGene', gene: 'NOTAGENE', requestId: 'request-2' })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))

    expect(socket.sent).toEqual([{ type: 'ack', requestId: 'request-2', ok: false, error: 'Unrecognized locus: NOTAGENE' }])
  })

  it('is acked once each, in the order the commands arrived', async () => {
    const release: Array<() => void> = []
    const socket = joined(() => new Promise((resolve) => release.push(() => resolve(SUMMARY))))

    socket.receive({ type: 'zoomIn', requestId: 'first' })
    socket.receive({ type: 'zoomOut', requestId: 'second' })
    await vi.waitFor(() => expect(release).toHaveLength(1)) // the second waits for the first
    release[0]()
    await vi.waitFor(() => expect(release).toHaveLength(2))
    release[1]()
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))

    expect(socket.sent.map((ack) => (ack as { requestId: string }).requestId)).toEqual(['first', 'second'])
  })

  it('a message that is not a command is ignored', async () => {
    const socket = joined()

    socket.receive({ type: 'somethingElse', requestId: 'request-3' })
    socket.receive({ type: 'zoomIn' }) // no request id: nothing to ack
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(socket.sent).toEqual([])
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

describe('statusText', () => {
  it.each<[RoomStatus, string]>([
    [{ state: 'connecting' }, 'Connecting…'],
    [{ state: 'joined', room: '7ZQH4M2K9X' }, 'Connected · Room 7ZQH4M2K9X'],
    [{ state: 'reconnecting' }, 'Connection lost. Reconnecting…'],
  ])('%o reads "%s"', (status, expected) => {
    expect(statusText(status)).toBe(expected)
  })
})
