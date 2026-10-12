/**
 * MCP face: JSON-RPC over POST /mcp on the Worker under test.
 */
import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { MessageType } from 'igvjs-mcp-viewer/protocol'
import worker from '../src/index.ts'
import toolsFixture from './fixtures/tools.json'
import { serveGenomeList } from './genomeList.ts'
import { rpc, initialize, callTool, type ToolResult } from './mcp.ts'
import { openViewer, join, closeViewers } from './viewers.ts'

beforeAll(serveGenomeList)
afterEach(closeViewers)

const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{10}$/ // Crockford base32: no I, L, O, U

describe('initialize', () => {
  it('answers as igv-bot with an mcp-session-id that is a freshly minted Room id', async () => {
    const first = await initialize()
    const second = await initialize()

    expect(first.status).toBe(200)
    const body = await first.json<{ result: { serverInfo: { name: string } } }>()
    expect(body.result.serverInfo.name).toBe('igv-bot')
    expect(first.headers.get('mcp-session-id')).toMatch(ROOM_ID)
    expect(second.headers.get('mcp-session-id')).toMatch(ROOM_ID)
    expect(second.headers.get('mcp-session-id')).not.toBe(first.headers.get('mcp-session-id'))
  })
})

/** The Room an open_viewer reply names. */
function roomOf(result: ToolResult): string {
  return (result.structuredContent as { room: string }).room
}

describe('open_viewer', () => {
  it('without a room, returns the Join link for a new Room, as text and as a resource link', async () => {
    const result = await callTool('open_viewer', { 'mcp-session-id': '7ZQH4M2K9X' })

    const room = roomOf(result)
    expect(room).toMatch(ROOM_ID)
    const joinLink = `http://localhost:5173/?room=${room}` // VIEWER_URL in wrangler.toml
    expect(result.isError).toBeFalsy()
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(`\n${joinLink}\n`) // on a line of its own, so Hosts render it clickable
    expect(result.content[1]).toMatchObject({ type: 'resource_link', uri: joinLink, name: 'Open igv-bot', mimeType: 'text/html' })
  })

  it("a new Conversation gets a Room of its own: two calls without a room in one MCP session name two Rooms, neither the session's", async () => {
    const session = (await initialize()).headers.get('mcp-session-id')!

    const first = roomOf(await callTool('open_viewer', { 'mcp-session-id': session }))
    const second = roomOf(await callTool('open_viewer', { 'mcp-session-id': session }))

    expect(second).not.toBe(first)
    expect([first, second]).not.toContain(session)
  })

  it('tells the model to use only the built-in browser, reply briefly and not repeat the link or Room id', async () => {
    const res = await rpc('tools/list', {})
    const { result } = await res.json<{ result: { tools: Array<{ description: string }> } }>()
    const reply = (await callTool('open_viewer', { 'mcp-session-id': '7ZQH4M2K9X' })).content[0].text!

    for (const wording of [result.tools[0].description, reply]) {
      expect(wording).toMatch(/built-in browser/)
      expect(wording).toMatch(/Never use Claude in Chrome/)
      expect(wording).toMatch(/Do not repeat the link or the Room id/)
    }
    expect(reply).toMatch(/reply in one short sentence/)
  })

  it('tells the model to pass the Room id as room on every later tool call, and names the id', async () => {
    const res = await rpc('tools/list', {})
    const { result } = await res.json<{ result: { tools: Array<{ description: string }> } }>()
    const reply = (await callTool('open_viewer', undefined, { room: '265EDDEXA6' })).content[0].text!

    for (const wording of [result.tools[0].description, reply]) {
      expect(wording).toMatch(/as room on every later igv-bot tool call/)
    }
    expect(reply).toContain('Room id: 265EDDEXA6.')
    expect(reply.match(/265EDDEXA6/g)).toHaveLength(2) // there and in the Join link
  })

  it("given a room, returns the Join link for that Room, not the session's", async () => {
    const result = await callTool('open_viewer', { 'mcp-session-id': '7ZQH4M2K9X' }, { room: ' 265eddexa6 ' })

    const joinLink = 'http://localhost:5173/?room=265EDDEXA6'
    expect(result.content[0].text).toContain(`\n${joinLink}\n`)
    expect(result.content[1].uri).toBe(joinLink)
    expect(result.structuredContent).toEqual({ room: '265EDDEXA6', joinUrl: joinLink })
  })

  it.each(['', '  '])('given an empty room (%j), returns the Join link for a new Room', async (room) => {
    const result = await callTool('open_viewer', { 'mcp-session-id': '7ZQH4M2K9X' }, { room })

    expect(roomOf(result)).toMatch(ROOM_ID)
    expect(roomOf(result)).not.toBe('7ZQH4M2K9X')
  })

  it('given a room that is not a Room id, replies with an error and no link', async () => {
    const result = await callTool('open_viewer', { 'mcp-session-id': '7ZQH4M2K9X' }, { room: 'nope' })

    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].text).toMatch(/^Error: "nope" is not a Room id\./)
  })

  it.each([
    ['no session id', undefined],
    ['a session id that is not a Room id', { 'mcp-session-id': 'not a room' }],
  ])('with %s, still returns the Join link for a new Room', async (_, headers) => {
    const result = await callTool('open_viewer', headers)

    expect(result.isError).toBeFalsy()
    expect(result.content[1].uri).toBe(`http://localhost:5173/?room=${roomOf(result)}`)
  })
})

describe('open_viewer given a genome and locus', () => {
  /** What a Viewer that opens the Join link of `result` is told to restore. */
  async function restoredBy(result: ToolResult) {
    const viewer = await openViewer(roomOf(result))
    const joined = await join(viewer)
    expect(joined.type).toBe(MessageType.JOINED)
    return (joined as { session?: object }).session
  }

  it('opens a new Room whose Viewer starts on that genome and locus', async () => {
    const result = await callTool('open_viewer', undefined, { genome: 'mm10', locus: 'chr11:101,442,000-101,553,000' })

    expect(result.isError).toBeFalsy()
    expect(result.content[1].uri).toBe(`http://localhost:5173/?room=${roomOf(result)}`)
    expect(result.content[0].text).toContain('igv-bot is set to open on mm10 at chr11:101,442,000-101,553,000.')
    expect(await restoredBy(result)).toEqual({ genome: 'mm10', locus: 'chr11:101,442,000-101,553,000' })
  })

  it("given a genome alone, the Viewer starts on that genome's default view, in the list's spelling of its id", async () => {
    const result = await callTool('open_viewer', undefined, { genome: 'HS1', locus: '' })

    expect(result.content[0].text).toContain('igv-bot is set to open on hs1.')
    expect(await restoredBy(result)).toEqual({ genome: 'hs1' })
  })

  it('given a locus alone, the Viewer starts on hg38 at that locus', async () => {
    const result = await callTool('open_viewer', undefined, { locus: 'MYC' })

    expect(await restoredBy(result)).toEqual({ genome: 'hg38', locus: 'MYC' })
  })

  it('given neither, nothing is saved in the new Room: the Viewer shows its default', async () => {
    const result = await callTool('open_viewer')

    expect(result.content[0].text).not.toContain('set to open on')
    expect(await restoredBy(result)).toBeUndefined()
  })

  it('given a genome that is not on the igv.org list, replies that it is unavailable, with no link', async () => {
    const result = await callTool('open_viewer', undefined, { genome: 'hg99', locus: 'chr1' })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Error: the genome "hg99" is not available: it is not on the igv.org genome list. The genomes available are: hs1 (Human (T2T CHM13-v2.0/hs1)); hg38 (Human (GRCh38/hg38)); mm10 (Mouse (GRCm38/mm10)); rn7 (Rat (rn7)). igv-bot was not opened.',
      },
    ])
  })
})

describe('Join card', () => {
  interface CardResource {
    mimeType: string
    text: string
    _meta: { ui: { csp: { resourceDomains: string[]; frameDomains?: string[] } } }
  }

  it('open_viewer is an MCP App: the tool names the Join card, which the Connector serves', async () => {
    const tools = await rpc('tools/list', {})
    const [tool] = (await tools.json<{ result: { tools: Array<{ _meta: Record<string, any> }> } }>()).result.tools
    expect(tool._meta.ui.resourceUri).toBe('ui://igv-bot/join')
    expect(tool._meta['ui/resourceUri']).toBe('ui://igv-bot/join') // flat key, older Hosts

    const listed = await rpc('resources/list', {})
    const { resources } = (await listed.json<{ result: { resources: Array<{ uri: string }> } }>()).result
    expect(resources.map((resource) => resource.uri)).toEqual(['ui://igv-bot/join'])

    const read = await rpc('resources/read', { uri: 'ui://igv-bot/join' })
    const [card] = (await read.json<{ result: { contents: CardResource[] } }>()).result.contents
    expect(card.mimeType).toBe('text/html;profile=mcp-app')
    expect(card._meta.ui.csp.resourceDomains).toEqual(['https://unpkg.com'])
    expect(card.text).toMatch(/unpkg\.com\/@modelcontextprotocol\/ext-apps@\d+\.\d+\.\d+\//) // a pinned version
  })

  it('carries a status line and an Open igv-bot button, and never the genome browser, a link or a QR code', async () => {
    const read = await rpc('resources/read', { uri: 'ui://igv-bot/join' })
    const [card] = (await read.json<{ result: { contents: CardResource[] } }>()).result.contents

    expect(card.text).toContain('class="join-card__status"')
    expect(card.text).toMatch(/<button class="join-card__open" hidden>Open igv-bot<\/button>/)
    expect(card.text).toContain('app.openLink({ url: joinUrl })') // through the Host's open-link request
    expect(card.text).not.toMatch(/<iframe|<a |<img/)
    expect(card._meta.ui.csp.frameDomains).toBeUndefined() // the Host's sandbox forbids framing other origins
  })

  it("is handed the Join link and Room id as the tool's structured content", async () => {
    const result = await callTool('open_viewer', undefined, { room: '7ZQH4M2K9X' })

    expect(result.structuredContent).toEqual({ room: '7ZQH4M2K9X', joinUrl: 'http://localhost:5173/?room=7ZQH4M2K9X' })
    const read = await rpc('resources/read', { uri: 'ui://igv-bot/join' })
    const [card] = (await read.json<{ result: { contents: CardResource[] } }>()).result.contents
    expect(card.text).toContain('sc?.joinUrl') // a rename on either side would leave the card scraping the text
  })
})

describe('the tools the Connector lists', () => {
  it('match the pinned fixture: every name, title, description and schema', async () => {
    const res = await rpc('tools/list', {})
    const { result } = await res.json<{ result: { tools: Array<Record<string, unknown>> } }>()

    const listed = result.tools.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema }))
    expect(listed).toEqual(toolsFixture)
  })
})

describe("ChatGPT's path: x-openai-session and no mcp-session-id", () => {
  it('binds the same Room every time, and a different one per value', async () => {
    const a1 = (await initialize({ 'x-openai-session': 'openai-a' })).headers.get('mcp-session-id')
    const a2 = (await initialize({ 'x-openai-session': 'openai-a' })).headers.get('mcp-session-id')
    const b = (await initialize({ 'x-openai-session': 'openai-b' })).headers.get('mcp-session-id')

    expect(a1).toMatch(ROOM_ID)
    expect(a2).toBe(a1)
    expect(b).not.toBe(a1)
  })

  it('the Room id is not the raw header value', async () => {
    const raw = 'ABCDEFGHJK' // itself shaped like a Room id
    expect((await initialize({ 'x-openai-session': raw })).headers.get('mcp-session-id')).not.toBe(raw)
  })

  it('a command carrying only x-openai-session and no room goes to the Room derived from it', async () => {
    const room = (await initialize({ 'x-openai-session': 'openai-c' })).headers.get('mcp-session-id')!
    const viewer = await openViewer(room)
    await join(viewer)

    const reply = callTool('zoom_in', { 'x-openai-session': 'openai-c' })

    expect(await viewer.next()).toMatchObject({ type: MessageType.COMMAND, command: { type: 'zoom_in' } })
    await reply
  })

  it('mcp-session-id is used when the Host sends it', async () => {
    const viewer = await openViewer('7ZQH4M2K9X')
    await join(viewer)

    const reply = callTool('zoom_in', { 'mcp-session-id': '7ZQH4M2K9X', 'x-openai-session': 'openai-d' })

    expect(await viewer.next()).toMatchObject({ type: MessageType.COMMAND, command: { type: 'zoom_in' } })
    await reply
  })

  /** open_viewer on a Worker deployed without the secret. */
  function openViewerWithoutSecret(id: number, headers: Record<string, string>) {
    const { SESSION_HMAC_SECRET: _, ...envWithoutSecret } = env
    const request = new Request<unknown, IncomingRequestCfProperties>('https://igv-bot.test/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'open_viewer', arguments: {} } }),
    })
    return worker.fetch(request, envWithoutSecret as Env)
  }

  it('without SESSION_HMAC_SECRET the request fails; there is no fallback key', async () => {
    const res = await openViewerWithoutSecret(7, { 'x-openai-session': 'openai-a' })

    expect(res.status).toBe(500)
    expect(res.headers.get('mcp-session-id')).toBeNull()
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Server misconfigured: SESSION_HMAC_SECRET is not set' },
      id: 7,
    })
  })

  it('without the secret, a Host that echoes mcp-session-id is unaffected', async () => {
    expect((await openViewerWithoutSecret(8, { 'mcp-session-id': '7ZQH4M2K9X' })).status).toBe(200)
  })
})

describe('a request that is not JSON', () => {
  it('is answered with a JSON-RPC parse error', async () => {
    const res = await SELF.fetch('https://igv-bot.test/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: '{not json',
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })
  })
})
