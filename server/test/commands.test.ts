/**
 * Command tools, through both faces: a tool is called over POST /mcp while a
 * fake Viewer on the Room's socket receives the command and acks it.
 */
import { env, runInDurableObject } from 'cloudflare:test'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { CommandType, MessageType, type AckMessage, type CommandMessage, type SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, textOf } from './mcp.ts'
import { openViewer, join, closeViewers } from './viewers.ts'

afterEach(() => {
  vi.useRealTimers()
  closeViewers()
})

const SUMMARY: SessionSummary = {
  genome: 'hg38',
  loci: ['chr8:127,735,434-127,742,951'],
  tracks: [{ name: 'Refseq Select', type: 'annotation', url: 'https://example.org/refseq.bed.gz', height: 70 }],
  crosshairs: false,
  centreLine: false,
}

let rooms = 0
/** A Room of its own for each test: a Room id is 10 Crockford base32 characters. */
function newRoom() {
  return `CMD${String(++rooms).padStart(7, '0')}`
}

async function viewerIn(room: string) {
  const viewer = await openViewer(room)
  await join(viewer)
  return viewer
}

type Ack = { ok: true; result: SessionSummary } | { ok: false; error: string }

/** Call `name` with one Viewer in a new Room, which answers the command with `ack`. */
async function callAndAck(name: string, args: object, ack: Ack = { ok: true, result: SUMMARY }) {
  const room = newRoom()
  const viewer = await viewerIn(room)
  const call = callTool(name, args, { 'mcp-session-id': room })
  const command = (await viewer.next()) as CommandMessage
  viewer.send({ type: MessageType.ACK, requestId: command.requestId, ...ack } as AckMessage)
  return { command, result: await call }
}

describe('a command tool with a Viewer in the Room', () => {
  it.each([
    ['go_to_locus', { locus: 'chr8:127,735,434-127,742,951' }, { type: CommandType.GO_TO_LOCUS, locus: 'chr8:127,735,434-127,742,951' }, 'Went to locus chr8:127,735,434-127,742,951.'],
    ['go_to_gene', { gene: 'MYC' }, { type: CommandType.GO_TO_GENE, gene: 'MYC' }, 'Went to gene MYC.'],
    ['zoom_in', {}, { type: CommandType.ZOOM_IN }, 'Zoomed in.'],
    ['zoom_out', {}, { type: CommandType.ZOOM_OUT }, 'Zoomed out.'],
  ])('%s reaches the Viewer as one command with a request id, and the ack becomes the reply', async (name, args, sent, done) => {
    const { command, result } = await callAndAck(name, args)

    expect(command).toEqual({ ...sent, requestId: expect.any(String) })
    expect(result.isError).toBeFalsy()
    expect(textOf(result)).toBe(`${done}\nSession summary: ${JSON.stringify(SUMMARY)}`)
    expect(result.structuredContent).toEqual({ sessionSummary: SUMMARY })
  })

  it('every Viewer in the Room receives the command, and the first ack is the reply', async () => {
    const room = newRoom()
    const [first, second] = [await viewerIn(room), await viewerIn(room)]

    const call = callTool('zoom_in', {}, { 'mcp-session-id': room })
    const [toFirst, toSecond] = (await Promise.all([first.next(), second.next()])) as CommandMessage[]
    second.send({ type: MessageType.ACK, requestId: toSecond.requestId, ok: true, result: SUMMARY })
    const result = await call
    first.send({ type: MessageType.ACK, requestId: toFirst.requestId, ok: false, error: 'too late to matter' })

    expect(toFirst).toEqual(toSecond)
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toEqual({ sessionSummary: SUMMARY })
  })

  it("an ack that is not ok becomes an error reply carrying igv.js's own message", async () => {
    const { result } = await callAndAck('go_to_gene', { gene: 'NOTAGENE' }, { ok: false, error: 'Unrecognized locus: NOTAGENE' })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: 'Error: Unrecognized locus: NOTAGENE' }])
  })

  it('with no ack for 15 seconds, the reply is "sent, unconfirmed" and not an error', async () => {
    const room = newRoom()
    const viewer = await viewerIn(room)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    let settled = false
    const call = callTool('zoom_out', {}, { 'mcp-session-id': room }).finally(() => (settled = true))
    await viewer.next() // the command is out and its ack timer is running
    // Advanced from inside the Room: its timer callback must run in the Room's I/O context.
    const stub = env.ROOM.get(env.ROOM.idFromName(room))
    await runInDurableObject(stub, () => vi.advanceTimersByTimeAsync(14_999))
    expect(settled).toBe(false)
    await runInDurableObject(stub, () => vi.advanceTimersByTimeAsync(1))
    const result = await call

    expect(result.isError).toBeFalsy()
    expect(result.content).toEqual([
      { type: 'text', text: 'zoom_out sent, unconfirmed: no Viewer answered within 15 s, so the resulting Session summary is not known.' },
    ])
  })
})

describe('a command tool with no Viewer in the Room', () => {
  it('replies with an error saying to open one first', async () => {
    const result = await callTool('go_to_locus', { locus: 'chr1' }, { 'mcp-session-id': newRoom() })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      { type: 'text', text: 'Error: no Viewer is in this Room. Use open_viewer to open igv-bot first, then try again.' },
    ])
  })

  it('a Viewer that has left the Room no longer counts', async () => {
    const room = newRoom()
    const viewer = await viewerIn(room)
    await viewer.close()

    const result = await callTool('zoom_in', {}, { 'mcp-session-id': room })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/no Viewer is in this Room/)
  })

  it('with no Room at all, replies that the session has no Room', async () => {
    const result = await callTool('zoom_in', {})

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Error: this MCP session has no Room. Reconnect the igv-bot Connector and try again.')
  })
})
