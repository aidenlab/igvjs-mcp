/**
 * The Viewer's connection to its Room, driven through a fake socket: tests
 * assert what the Viewer sends and the statuses it reports.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Command, CommandOutcome, SavedSession, SessionReport, SessionSummary, ViewerSettings } from '../src/protocol.ts'
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

const SUMMARY: SessionSummary = { genome: 'hg38', loci: ['all'], tracks: [], crosshairs: false, centreLine: false }

function connect(onCommand: (command: Command) => Promise<CommandOutcome> = async () => ({ ok: true, summary: SUMMARY })) {
  const sockets: FakeSocket[] = []
  const statuses: RoomStatus[] = []
  const restores: Array<SavedSession | undefined> = []
  const restoredSettings: ViewerSettings[] = []
  const { reportSession, reportViewerSettings } = connectToRoom({
    url: 'ws://server.test/ws?room=7ZQH4M2K9X',
    onStatus: (status) => statuses.push(status),
    onFirstJoin: (saved, viewerSettings) => {
      restores.push(saved)
      restoredSettings.push(viewerSettings)
    },
    onCommand,
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
  })
  return { sockets, statuses, restores, restoredSettings, reportSession, reportViewerSettings }
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

describe('a command from the Room', () => {
  function joined(onCommand: (command: Command) => Promise<CommandOutcome>) {
    const { sockets } = connect(onCommand)
    sockets[0].open()
    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })
    sockets[0].sent.length = 0
    return sockets[0]
  }

  it('is applied, and its outcome is sent back as the ack with the same request id', async () => {
    const applied: Command[] = []
    const socket = joined(async (command) => {
      applied.push(command)
      return { ok: true, summary: SUMMARY }
    })

    socket.receive({ type: 'command', id: 'req-1', command: { type: 'go_to_gene', gene: 'MYC' } })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))

    expect(applied).toEqual([{ type: 'go_to_gene', gene: 'MYC' }])
    expect(socket.sent).toEqual([{ type: 'ack', id: 'req-1', ok: true, summary: SUMMARY }])
  })

  it('that fails is acked with the error', async () => {
    const socket = joined(async () => ({ ok: false, error: 'Unrecognized locus: NOTAGENE', summary: SUMMARY }))

    socket.receive({ type: 'command', id: 'req-2', command: { type: 'go_to_gene', gene: 'NOTAGENE' } })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))

    expect(socket.sent).toEqual([{ type: 'ack', id: 'req-2', ok: false, error: 'Unrecognized locus: NOTAGENE', summary: SUMMARY }])
  })

  it('waits for the command before it to finish, so commands apply in the order they arrived', async () => {
    const events: string[] = []
    let finishFirst!: () => void
    const socket = joined(async (command) => {
      events.push(`start ${command.type}`)
      if (command.type === 'go_to_gene') await new Promise<void>((resolve) => (finishFirst = resolve))
      events.push(`end ${command.type}`)
      return { ok: true, summary: SUMMARY }
    })

    socket.receive({ type: 'command', id: 'req-1', command: { type: 'go_to_gene', gene: 'MYC' } })
    socket.receive({ type: 'command', id: 'req-2', command: { type: 'zoom_in' } })
    await vi.waitFor(() => expect(finishFirst).toBeDefined())
    expect(events).toEqual(['start go_to_gene'])

    finishFirst()
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))

    expect(events).toEqual(['start go_to_gene', 'end go_to_gene', 'start zoom_in', 'end zoom_in'])
    expect(socket.sent.map((ack) => (ack as { id: string }).id)).toEqual(['req-1', 'req-2'])
  })
})

describe('the Session reported after a change', () => {
  const REPORT: SessionReport = { session: { reference: { id: 'hg38' }, locus: 'all', tracks: [] }, summary: SUMMARY }
  const PANNED: SessionReport = {
    session: { reference: { id: 'hg38' }, locus: 'chr8:127,740,001-127,747,518', tracks: [] },
    summary: { ...SUMMARY, loci: ['chr8:127,740,001-127,747,518'] },
  }

  function joined() {
    const connection = connect()
    connection.sockets[0].open()
    connection.sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })
    connection.sockets[0].sent.length = 0
    return connection
  }

  it('is sent to the Room with its summary', () => {
    const { sockets, reportSession } = joined()

    reportSession(PANNED)

    expect(sockets[0].sent).toEqual([{ type: 'session', ...PANNED }])
  })

  it('is not sent again while it stays the same', () => {
    const { sockets, reportSession } = joined()

    reportSession(PANNED)
    reportSession(structuredClone(PANNED))
    reportSession(REPORT)

    expect(sockets[0].sent).toEqual([
      { type: 'session', ...PANNED },
      { type: 'session', ...REPORT },
    ])
  })

  it('is sent when the Session changed in a way its summary does not show', () => {
    const { sockets, reportSession } = joined()
    const recoloured: SessionReport = { ...REPORT, session: { ...REPORT.session, tracks: [{ name: 'Genes', color: 'red' }] } }

    reportSession(REPORT)
    reportSession(recoloured)

    expect(sockets[0].sent).toEqual([
      { type: 'session', ...REPORT },
      { type: 'session', ...recoloured },
    ])
  })

  it('is sent after a command too: the ack carried the summary, not the Session', async () => {
    const { sockets, reportSession } = joined()
    sockets[0].receive({ type: 'command', id: 'req-1', command: { type: 'zoom_in' } })
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1))

    reportSession(REPORT)

    expect(sockets[0].sent).toEqual([
      { type: 'ack', id: 'req-1', ok: true, summary: SUMMARY },
      { type: 'session', ...REPORT },
    ])
  })

  it('reported before the Room is joined is sent once it is', () => {
    const { sockets, reportSession } = connect()

    reportSession(REPORT)
    reportSession(PANNED)
    sockets[0].open()
    expect(sockets[0].sent).toEqual([{ type: 'join' }])

    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })
    expect(sockets[0].sent).toEqual([{ type: 'join' }, { type: 'session', ...PANNED }])
  })

  it('is sent again after a reconnect, with whatever changed while the socket was down', () => {
    vi.useFakeTimers()
    const { sockets, reportSession } = joined()
    reportSession(REPORT)

    sockets[0].drop()
    reportSession(PANNED)
    vi.advanceTimersByTime(1000)
    sockets[1].open()
    sockets[1].receive({ type: 'joined', room: '7ZQH4M2K9X' })

    expect(sockets[0].sent).toEqual([{ type: 'session', ...REPORT }])
    expect(sockets[1].sent).toEqual([{ type: 'join' }, { type: 'session', ...PANNED }])
  })
})

describe('the Session saved in the Room', () => {
  const SAVED = { reference: { id: 'hg19' }, locus: 'chr8:1-1,000', tracks: [], showCursorGuide: true }

  it('is handed over when the Viewer first joins', () => {
    const { sockets, restores } = connect()
    sockets[0].open()
    expect(restores).toEqual([])

    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X', session: SAVED })

    expect(restores).toEqual([SAVED])
  })

  it('is absent in a Room with nothing saved: the Viewer is told there is nothing to restore', () => {
    const { sockets, restores } = connect()
    sockets[0].open()

    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })

    expect(restores).toEqual([undefined])
  })

  it('is not handed over again on a reconnect: by then the Viewer has its own Session', () => {
    vi.useFakeTimers()
    const { sockets, restores } = connect()
    sockets[0].open()
    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })

    sockets[0].drop()
    vi.advanceTimersByTime(1000)
    sockets[1].open()
    sockets[1].receive({ type: 'joined', room: '7ZQH4M2K9X', session: SAVED })

    expect(restores).toEqual([undefined])
  })
})

describe('the Viewer settings reported after a change', () => {
  function joined() {
    const connection = connect()
    connection.sockets[0].open()
    connection.sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })
    connection.sockets[0].sent.length = 0
    return connection
  }

  it('are sent to the Room', () => {
    const { sockets, reportViewerSettings } = joined()

    reportViewerSettings({ controls: true })

    expect(sockets[0].sent).toEqual([{ type: 'viewer_settings', viewerSettings: { controls: true } }])
  })

  it('are not sent again while they stay the same', () => {
    const { sockets, reportViewerSettings } = joined()

    reportViewerSettings({ controls: true })
    reportViewerSettings({ controls: true })
    reportViewerSettings({ controls: false })

    expect(sockets[0].sent).toEqual([
      { type: 'viewer_settings', viewerSettings: { controls: true } },
      { type: 'viewer_settings', viewerSettings: { controls: false } },
    ])
  })

  it('reported before the Room is joined are sent once it is, beside the Session', () => {
    const { sockets, reportSession, reportViewerSettings } = connect()
    const report: SessionReport = { session: { reference: { id: 'hg38' }, locus: 'all', tracks: [] }, summary: SUMMARY }

    reportViewerSettings({ controls: true })
    reportSession(report)
    sockets[0].open()
    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X' })

    expect(sockets[0].sent).toEqual([{ type: 'join' }, { type: 'session', ...report }, { type: 'viewer_settings', viewerSettings: { controls: true } }])
  })

  it('are sent again after a reconnect, as they were last changed', () => {
    vi.useFakeTimers()
    const { sockets, reportViewerSettings } = joined()
    reportViewerSettings({ controls: true })

    sockets[0].drop()
    reportViewerSettings({ controls: false })
    vi.advanceTimersByTime(1000)
    sockets[1].open()
    sockets[1].receive({ type: 'joined', room: '7ZQH4M2K9X' })

    expect(sockets[1].sent).toEqual([{ type: 'join' }, { type: 'viewer_settings', viewerSettings: { controls: false } }])
  })
})

describe('the Viewer settings saved in the Room', () => {
  it('are handed over when the Viewer first joins', () => {
    const { sockets, restoredSettings } = connect()
    sockets[0].open()

    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X', viewerSettings: { controls: true } })

    expect(restoredSettings).toEqual([{ controls: true }])
  })

  it('in a Room with none saved, read as the Controls hidden', () => {
    const { sockets, restoredSettings } = connect()
    sockets[0].open()

    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X', session: { reference: { id: 'hg19' } } })

    expect(restoredSettings).toEqual([{ controls: false }])
  })

  it('are not handed over again on a reconnect', () => {
    vi.useFakeTimers()
    const { sockets, restoredSettings } = connect()
    sockets[0].open()
    sockets[0].receive({ type: 'joined', room: '7ZQH4M2K9X', viewerSettings: { controls: true } })

    sockets[0].drop()
    vi.advanceTimersByTime(1000)
    sockets[1].open()
    sockets[1].receive({ type: 'joined', room: '7ZQH4M2K9X', viewerSettings: { controls: false } })

    expect(restoredSettings).toEqual([{ controls: true }])
  })
})

describe('an expired Room', () => {
  it('is reported, and the Viewer does not try to join it again', () => {
    vi.useFakeTimers()
    const { sockets, statuses } = connect()
    sockets[0].open()

    sockets[0].receive({ type: 'expired' })
    sockets[0].drop() // the Room closes the socket
    vi.advanceTimersByTime(60_000)

    expect(statuses.at(-1)).toEqual({ state: 'expired' })
    expect(sockets).toHaveLength(1)
  })

  it('hands no Session over', () => {
    const { sockets, restores } = connect()
    sockets[0].open()

    sockets[0].receive({ type: 'expired' })

    expect(restores).toEqual([])
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
    [{ state: 'expired' }, 'This igv-bot has expired. Ask Claude or ChatGPT to open a new one.'],
  ])('%o reads "%s"', (status, expected) => {
    expect(statusText(status)).toBe(expected)
  })
})
