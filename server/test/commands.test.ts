/**
 * Command tools, end to end on the server: the model calls a tool on the MCP
 * face, a fake Viewer on the Room's socket receives the command and acks it,
 * and the ack becomes the tool's reply.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { MessageType, type CommandMessage, type SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { serveGenomeList } from './genomeList.ts'
import { callTool } from './mcp.ts'
import { openViewer, join, closeViewers, type FakeViewer } from './viewers.ts'

beforeAll(serveGenomeList)
afterEach(closeViewers)

const ACK_TIMEOUT_MS = 300 // the binding in vitest.config.ts; 15 s when deployed

const SUMMARY: SessionSummary = {
  genome: 'hg38',
  loci: ['chr8:127,735,434-127,742,951'],
  tracks: [{ name: 'Refseq Genes', type: 'annotation', url: 'https://example.org/refGene.txt.gz', height: 70 }],
  crosshairs: false,
  centreLine: false,
}

async function joinedViewer(room: string) {
  const viewer = await openViewer(room)
  await join(viewer)
  return viewer
}

async function nextCommand(viewer: FakeViewer) {
  const message = await viewer.next()
  expect(message.type).toBe(MessageType.COMMAND)
  return message as CommandMessage
}

describe('a command tool with a Viewer in the Room', () => {
  it('reaches the Viewer as one command with a request id, and the ack becomes the reply', async () => {
    const viewer = await joinedViewer('C0MMAND001')

    const reply = callTool('go_to_locus', { 'mcp-session-id': 'C0MMAND001' }, { locus: 'chr8:127,735,434-127,742,951' })
    const message = await nextCommand(viewer)
    expect(message.command).toEqual({ type: 'go_to_locus', locus: 'chr8:127,735,434-127,742,951' })
    expect(message.id).toEqual(expect.any(String))
    viewer.send({ type: MessageType.ACK, id: message.id, ok: true, summary: SUMMARY })

    const result = await reply
    expect(result.isError).toBeFalsy()
    expect(result.content).toHaveLength(1)
    expect(summaryIn(result.content[0].text!)).toEqual(SUMMARY)
  })

  it.each([
    ['go_to_gene', { gene: 'MYC' }, { type: 'go_to_gene', gene: 'MYC' }],
    ['zoom_in', {}, { type: 'zoom_in' }],
    ['zoom_out', {}, { type: 'zoom_out' }],
    [
      'load_tracks',
      { tracks: [{ url: 'https://example.org/ctcf.bigWig', name: 'K562 CTCF' }, { url: 'https://example.org/peaks.bed' }] },
      { type: 'load_tracks', tracks: [{ url: 'https://example.org/ctcf.bigWig', name: 'K562 CTCF' }, { url: 'https://example.org/peaks.bed' }] },
    ],
    ['remove_track', { name: 'K562 CTCF' }, { type: 'remove_track', name: 'K562 CTCF' }],
    ['remove_track', { position: 2 }, { type: 'remove_track', position: 2 }],
    // A number that is no position still reaches the Viewer, whose error lists the tracks.
    ['remove_track', { position: 0 }, { type: 'remove_track', position: 0 }],
    ['read_session_summary', {}, { type: 'read_session_summary' }],
  ])('%s reaches the Viewer as its command and replies with the Session summary', async (tool, args, command) => {
    const viewer = await joinedViewer('C0MMAND002')

    const reply = callTool(tool, { 'mcp-session-id': 'C0MMAND002' }, args)
    const message = await nextCommand(viewer)
    expect(message.command).toEqual(command)
    viewer.send({ type: MessageType.ACK, id: message.id, ok: true, summary: SUMMARY })

    expect(summaryIn((await reply).content[0].text!)).toEqual(SUMMARY)
  })

  it("an ack that is not ok becomes an error reply carrying igv.js's own message and the Session summary", async () => {
    const viewer = await joinedViewer('C0MMAND003')

    const reply = callTool('go_to_gene', { 'mcp-session-id': 'C0MMAND003' }, { gene: 'NOTAGENE' })
    const { id } = await nextCommand(viewer)
    viewer.send({ type: MessageType.ACK, id, ok: false, error: 'Unrecognized locus: NOTAGENE', summary: SUMMARY })

    const result = await reply
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/^Error: Unrecognized locus: NOTAGENE\n/)
    expect(summaryIn(result.content[0].text!)).toEqual(SUMMARY)
  })

  it('every Viewer in the Room receives the command, and the first ack is the reply', async () => {
    const first = await joinedViewer('C0MMAND004')
    const second = await joinedViewer('C0MMAND004')

    const reply = callTool('zoom_in', { 'mcp-session-id': 'C0MMAND004' })
    const toFirst = await nextCommand(first)
    const toSecond = await nextCommand(second)
    expect(toSecond).toEqual(toFirst)
    second.send({ type: MessageType.ACK, id: toSecond.id, ok: true, summary: SUMMARY })

    expect(summaryIn((await reply).content[0].text!)).toEqual(SUMMARY)
    first.send({ type: MessageType.ACK, id: toFirst.id, ok: false, error: 'late', summary: SUMMARY }) // ignored
  })

  it('a Viewer that never acks leaves the reply "sent, unconfirmed" once the wait is over', async () => {
    const viewer = await joinedViewer('C0MMAND005')

    const sent = Date.now()
    const reply = callTool('zoom_out', { 'mcp-session-id': 'C0MMAND005' })
    await nextCommand(viewer)
    const result = await reply

    expect(Date.now() - sent).toBeGreaterThanOrEqual(ACK_TIMEOUT_MS - 20) // workerd's clock is coarse
    expect(result.isError).toBeFalsy()
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Sent, unconfirmed: the Viewer did not answer in time, so it is not known whether zoom_out was applied.',
      },
    ])
  })
})

describe('the Session summary a Viewer sends after a change made by hand', () => {
  const PANNED: SessionSummary = { ...SUMMARY, loci: ['chr8:127,740,001-127,747,518'] }
  const UNCONFIRMED = 'Sent, unconfirmed: the Viewer did not answer in time, so it is not known whether zoom_in was applied.'

  it('is carried by a reply the Viewer does not answer, as the summary from before the call', async () => {
    const viewer = await joinedViewer('SVMMARY001')
    viewer.send({ type: MessageType.SESSION, session: {}, summary: SUMMARY })
    viewer.send({ type: MessageType.SESSION, session: {}, summary: PANNED })

    const reply = callTool('zoom_in', { 'mcp-session-id': 'SVMMARY001' })
    await nextCommand(viewer)
    const result = await reply

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toMatch(
      new RegExp(`^${UNCONFIRMED} The Session summary below is the last the Viewer sent, from before this call\\.\n`),
    )
    expect(summaryIn(result.content[0].text!)).toEqual(PANNED)
  })

  it('is kept by the Room after the Viewer that sent it has gone, and a later Viewer need not send it again', async () => {
    const first = await openViewer('SVMMARY002')
    await join(first)
    first.send({ type: MessageType.SESSION, session: {}, summary: PANNED })
    await join(first) // answered after the summary was taken in
    closeViewers()

    const second = await joinedViewer('SVMMARY002')
    const reply = callTool('zoom_in', { 'mcp-session-id': 'SVMMARY002' })
    await nextCommand(second)

    expect(summaryIn((await reply).content[0].text!)).toEqual(PANNED)
  })

  it("gives way to the summary of a later ack", async () => {
    const viewer = await joinedViewer('SVMMARY003')
    viewer.send({ type: MessageType.SESSION, session: {}, summary: PANNED })
    const acked = callTool('go_to_locus', { 'mcp-session-id': 'SVMMARY003' }, { locus: 'chr8:127,735,434-127,742,951' })
    viewer.send({ type: MessageType.ACK, id: (await nextCommand(viewer)).id, ok: true, summary: SUMMARY })
    await acked

    const reply = callTool('zoom_in', { 'mcp-session-id': 'SVMMARY003' })
    await nextCommand(viewer)

    expect(summaryIn((await reply).content[0].text!)).toEqual(SUMMARY)
  })
})

describe('a command tool given a room', () => {
  it("reaches the Viewer in that Room, not the session's, and the Room id stays out of the command", async () => {
    const viewer = await joinedViewer('R00MARG001')

    const reply = callTool('go_to_gene', { 'mcp-session-id': 'R00MARG002' }, { gene: 'MYC', room: 'R00MARG001' })
    const message = await nextCommand(viewer)
    expect(message.command).toEqual({ type: 'go_to_gene', gene: 'MYC' })
    viewer.send({ type: MessageType.ACK, id: message.id, ok: true, summary: SUMMARY })

    expect(summaryIn((await reply).content[0].text!)).toEqual(SUMMARY)
  })

  it('a room that is not a Room id is an error, and no Room gets the command', async () => {
    const viewer = await joinedViewer('R00MARG003')

    const result = await callTool('zoom_in', { 'mcp-session-id': 'R00MARG003' }, { room: 'the first one' })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Error: "the first one" is not a Room id. Pass the Room id from the reply of open_viewer.',
      },
    ])
    // The next thing the Viewer hears is a later command, not that one.
    const later = callTool('zoom_out', { 'mcp-session-id': 'R00MARG003' })
    expect((await nextCommand(viewer)).command).toEqual({ type: 'zoom_out' })
    await later
  })

  it('takes the Room id as a person might type it: lower case, with spaces around it', async () => {
    const viewer = await joinedViewer('R00MARG004')

    const reply = callTool('zoom_in', { 'mcp-session-id': 'R00MARG005' }, { room: ' r00marg004 ' })
    const { id } = await nextCommand(viewer)
    viewer.send({ type: MessageType.ACK, id, ok: true, summary: SUMMARY })

    expect((await reply).isError).toBeFalsy()
  })

  it('works in a session that has no Room of its own', async () => {
    const viewer = await joinedViewer('R00MARG006')

    const reply = callTool('zoom_in', undefined, { room: 'R00MARG006' })
    const { id } = await nextCommand(viewer)
    viewer.send({ type: MessageType.ACK, id, ok: true, summary: SUMMARY })

    expect((await reply).isError).toBeFalsy()
  })

  it('with no Viewer in that Room, the error names the Room and says to open igv-bot in it', async () => {
    const result = await callTool('zoom_in', { 'mcp-session-id': 'R00MARG007' }, { room: 'R00MARG008' })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Error: no Viewer is in Room R00MARG008. Call open_viewer with this room and open its Join link, then try again.',
      },
    ])
  })
})

describe('a command tool with no Viewer in the Room', () => {
  it('replies at once with an error saying to pass the room of an open igv-bot, or to open one', async () => {
    const result = await callTool('go_to_locus', { 'mcp-session-id': 'C0MMAND006' }, { locus: 'chr1' })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      {
        type: 'text',
        text: "Error: no Viewer is in this MCP session's Room. If igv-bot is already open, call again with room set to the Room id from the reply of open_viewer. Otherwise open igv-bot with open_viewer, then try again.",
      },
    ])
  })

  it('a Viewer in another Room does not count', async () => {
    await joinedViewer('C0MMAND007')

    const result = await callTool('zoom_in', { 'mcp-session-id': 'C0MMAND008' })

    expect(result.content[0].text).toMatch(/^Error: no Viewer is in this MCP session's Room/)
  })

  it('with no Room at all, the reply says to reconnect the Connector', async () => {
    const result = await callTool('zoom_in')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: this MCP session has no Room. Reconnect the igv-bot Connector and try again.')
  })
})

describe('change_genome', () => {
  const MOUSE: SessionSummary = {
    genome: 'mm10',
    loci: ['all'],
    tracks: [{ name: 'Refseq Genes', type: 'annotation', url: 'https://example.org/mm10/refGene.txt.gz', height: 70 }],
    crosshairs: false,
    centreLine: false,
  }

  it('for a genome on the igv.org list reaches the Viewer as its command, and replies with the Session summary of the new genome', async () => {
    const viewer = await joinedViewer('GEN0ME0001')

    const reply = callTool('change_genome', undefined, { genome: 'mm10', room: 'GEN0ME0001' })
    const message = await nextCommand(viewer)
    expect(message.command).toEqual({ type: 'change_genome', genome: 'mm10' })
    viewer.send({ type: MessageType.ACK, id: message.id, ok: true, summary: MOUSE })

    const result = await reply
    expect(result.isError).toBeFalsy()
    expect(summaryIn(result.content[0].text!)).toEqual(MOUSE)
  })

  it('for a genome that is not on the list replies that it is unavailable, naming those that are, and the Viewer hears nothing', async () => {
    const viewer = await joinedViewer('GEN0ME0002')

    const result = await callTool('change_genome', undefined, { genome: 'hg99', room: 'GEN0ME0002' })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Error: the genome "hg99" is not available: it is not on the igv.org genome list. The genomes available are: hs1 (Human (T2T CHM13-v2.0/hs1)); hg38 (Human (GRCh38/hg38)); mm10 (Mouse (GRCm38/mm10)); rn7 (Rat (rn7)). igv-bot was left as it was.',
      },
    ])
    // The next thing the Viewer hears is a later command, not that one.
    const later = callTool('zoom_out', undefined, { room: 'GEN0ME0002' })
    expect((await nextCommand(viewer)).command).toEqual({ type: 'zoom_out' })
    await later
  })

  it("takes the genome id as a person might type it, and sends the Viewer the list's own spelling", async () => {
    const viewer = await joinedViewer('GEN0ME0003')

    const reply = callTool('change_genome', undefined, { genome: ' MM10 ', room: 'GEN0ME0003' })
    const message = await nextCommand(viewer)
    expect(message.command).toEqual({ type: 'change_genome', genome: 'mm10' })
    viewer.send({ type: MessageType.ACK, id: message.id, ok: true, summary: MOUSE })
    await reply
  })
})

/** The Session summary a reply carries: the JSON after its "Session summary:" line. */
function summaryIn(text: string): unknown {
  const marker = 'Session summary:\n'
  expect(text).toContain(marker)
  return JSON.parse(text.slice(text.indexOf(marker) + marker.length))
}
