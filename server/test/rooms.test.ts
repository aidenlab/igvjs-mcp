/**
 * Room face: Viewers are real WebSocket clients on the Worker's /ws; tests
 * assert the messages each Viewer receives.
 */
import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { MessageType, type SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool } from './mcp.ts'
import { ORIGIN, upgrade, openViewer, join, closeViewers, type FakeViewer } from './viewers.ts'

afterEach(() => {
  closeViewers()
  vi.useRealTimers()
})

describe('join', () => {
  it('a Viewer that joins is answered with the id of its Room', async () => {
    const viewer = await openViewer('7ZQH4M2K9X')

    expect(await join(viewer)).toEqual({ type: MessageType.JOINED, room: '7ZQH4M2K9X' })
  })
})

const SUMMARY: SessionSummary = {
  genome: 'hg38',
  loci: ['chr8:127,735,434-127,742,951'],
  tracks: [{ name: 'Refseq Genes', type: 'annotation', url: 'https://example.org/refGene.txt.gz', height: 70 }],
  crosshairs: true,
  centreLine: false,
}

/** A Session as igv.js writes it. The Room keeps it without reading it. */
const SESSION = {
  version: '3.8.9',
  reference: { id: 'hg38' },
  locus: 'chr8:127,735,434-127,742,951',
  tracks: [{ name: 'Refseq Genes', type: 'annotation', url: 'https://example.org/refGene.txt.gz', height: 70, order: 1 }],
  showCursorGuide: true,
  showCenterGuide: false,
}

/** `viewer` saves `session` in its Room; resolves once the Room has stored it. */
async function save(viewer: FakeViewer, session: object = SESSION) {
  viewer.send({ type: MessageType.SESSION, session, summary: SUMMARY })
  await join(viewer) // answered after the Session was stored
}

describe('the saved Session', () => {
  it('a Room with nothing saved answers a join with its id alone', async () => {
    const viewer = await openViewer('SESS10N001')

    expect(await join(viewer)).toEqual({ type: MessageType.JOINED, room: 'SESS10N001' })
  })

  it('a Viewer that joins after another saved its Session and left is handed that Session', async () => {
    const first = await openViewer('SESS10N002')
    await join(first)
    await save(first)
    closeViewers()

    const later = await openViewer('SESS10N002')

    expect(await join(later)).toEqual({ type: MessageType.JOINED, room: 'SESS10N002', session: SESSION })
  })

  it('the latest Session saved is the one handed over', async () => {
    const first = await openViewer('SESS10N003')
    await join(first)
    await save(first)
    await save(first, { ...SESSION, locus: 'chr1:1-1,000' })

    const second = await openViewer('SESS10N003')

    expect(await join(second)).toEqual({ type: MessageType.JOINED, room: 'SESS10N003', session: { ...SESSION, locus: 'chr1:1-1,000' } })
  })
})

describe('expiry', () => {
  const HOUR = 60 * 60 * 1000
  const stub = (room: string) => env.ROOM.get(env.ROOM.idFromName(room))
  const alarmOf = (room: string) => runInDurableObject(stub(room), (_, state) => state.storage.getAlarm())

  /** A Viewer saves its Session in `room` and leaves. */
  async function savedAndLeft(room: string) {
    const viewer = await openViewer(room)
    await join(viewer)
    await save(viewer)
    closeViewers()
  }

  it("a Room is due to expire 24 hours after the last message from a Viewer; a message at 23 hours puts it off", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = Date.now()
    const viewer = await openViewer('EXP1RY0001')
    await join(viewer)

    expect(await alarmOf('EXP1RY0001')).toBe(t0 + 24 * HOUR)

    vi.setSystemTime(t0 + 23 * HOUR)
    await save(viewer)

    expect(await alarmOf('EXP1RY0001')).toBe(t0 + 47 * HOUR)
  })

  it('when the time comes with no Viewer in the Room, a join is answered with expired and the socket closed', async () => {
    await savedAndLeft('EXP1RY0002')

    expect(await runDurableObjectAlarm(stub('EXP1RY0002'))).toBe(true)

    const later = await openViewer('EXP1RY0002')
    expect(await join(later)).toEqual({ type: MessageType.EXPIRED })
    expect(await later.closed).toBe(true)
  })

  it('a command to an expired Room finds no Viewer', async () => {
    await savedAndLeft('EXP1RY0003')
    await runDurableObjectAlarm(stub('EXP1RY0003'))

    const result = await callTool('zoom_in', { 'mcp-session-id': 'EXP1RY0003' })

    expect(result.content[0].text).toMatch(/^Error: no Viewer is in this MCP session's Room/)
  })

  it('a Viewer still connected when the time comes keeps its Room and its saved Session, for another 24 hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = Date.now()
    const viewer = await openViewer('EXP1RY0004')
    await join(viewer)
    await save(viewer)

    vi.setSystemTime(t0 + 24 * HOUR)
    expect(await runDurableObjectAlarm(stub('EXP1RY0004'))).toBe(true)

    expect(await alarmOf('EXP1RY0004')).toBe(t0 + 48 * HOUR)
    const second = await openViewer('EXP1RY0004')
    expect(await join(second)).toEqual({ type: MessageType.JOINED, room: 'EXP1RY0004', session: SESSION })
  })

  it('open_viewer for an expired Room makes it a new Room again: a join is answered, with no Session from before', async () => {
    await savedAndLeft('EXP1RY0005')
    await runDurableObjectAlarm(stub('EXP1RY0005'))

    const result = await callTool('open_viewer', undefined, { room: 'EXP1RY0005' })

    expect(result.structuredContent).toMatchObject({ room: 'EXP1RY0005' })
    const viewer = await openViewer('EXP1RY0005')
    expect(await join(viewer)).toEqual({ type: MessageType.JOINED, room: 'EXP1RY0005' })
  })

  it('open_viewer for a Room with a saved Session leaves the Session there', async () => {
    await savedAndLeft('EXP1RY0006')

    await callTool('open_viewer', undefined, { room: 'EXP1RY0006' })

    const viewer = await openViewer('EXP1RY0006')
    expect(await join(viewer)).toEqual({ type: MessageType.JOINED, room: 'EXP1RY0006', session: SESSION })
  })
})

describe('Room id', () => {
  it.each([
    ['no room', ''],
    ['a room that is not a Room id', '?room=not-a-room'],
  ])('an upgrade with %s is refused with 400', async (_, query) => {
    expect((await upgrade(query)).status).toBe(400)
  })
})

describe('Viewer origins', () => {
  it('every origin on the configured list may upgrade', async () => {
    expect(env.VIEWER_ORIGINS).toContain(ORIGIN)
    for (const origin of env.VIEWER_ORIGINS) {
      const res = await upgrade('?room=7ZQH4M2K9X', origin)
      expect(res.status, origin).toBe(101)
      res.webSocket!.accept()
      res.webSocket!.close()
    }
  })

  it('an upgrade from an origin not on the list is refused with 403', async () => {
    expect((await upgrade('?room=7ZQH4M2K9X', 'https://evil.example')).status).toBe(403)
  })

  it('an upgrade with no Origin header is refused with 403', async () => {
    expect((await upgrade('?room=7ZQH4M2K9X', null)).status).toBe(403)
  })
})
