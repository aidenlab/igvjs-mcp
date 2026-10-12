/**
 * Command tools, end to end on the server: the model calls a tool on the MCP
 * face, a fake Viewer on the Room's socket receives the command and acks it,
 * and the ack becomes the tool's reply.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { MessageType, type CommandMessage, type SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool } from './mcp.ts'
import { openViewer, join, closeViewers, type FakeViewer } from './viewers.ts'

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
        text: 'Error: "the first one" is not a Room id. Pass the value after ?room= in the Join link from open_viewer, or leave room out.',
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
        text: "Error: no Viewer is in this session's Room. If igv-bot is already open, call again with room set to the Room id in its Join link. Otherwise open igv-bot with open_viewer, then try again.",
      },
    ])
  })

  it('a Viewer in another Room does not count', async () => {
    await joinedViewer('C0MMAND007')

    const result = await callTool('zoom_in', { 'mcp-session-id': 'C0MMAND008' })

    expect(result.content[0].text).toMatch(/^Error: no Viewer is in this session's Room/)
  })

  it('with no Room at all, the reply says to reconnect the Connector', async () => {
    const result = await callTool('zoom_in')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: this MCP session has no Room. Reconnect the igv-bot Connector and try again.')
  })
})

/** The Session summary a reply carries: the JSON after its "Session summary:" line. */
function summaryIn(text: string): unknown {
  const marker = 'Session summary:\n'
  expect(text).toContain(marker)
  return JSON.parse(text.slice(text.indexOf(marker) + marker.length))
}
