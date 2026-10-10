/**
 * MCP face: JSON-RPC over POST /mcp on the Worker under test.
 */
import { SELF } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{10}$/ // Crockford base32: no I, L, O, U

let rpcId = 0
function rpc(method: string, params: object, headers: Record<string, string> = {}) {
  return SELF.fetch('https://igv-bot.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
}

function initialize() {
  return rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
}

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

interface ToolResult {
  content: Array<{ type: string; text?: string; uri?: string; name?: string; mimeType?: string }>
  isError?: boolean
}

async function callTool(name: string, headers?: Record<string, string>) {
  const res = await rpc('tools/call', { name, arguments: {} }, headers)
  return (await res.json<{ result: ToolResult }>()).result
}

describe('open_viewer', () => {
  it('is the one tool the Connector lists', async () => {
    const res = await rpc('tools/list', {})
    const { result } = await res.json<{ result: { tools: Array<{ name: string; title: string }> } }>()

    expect(result.tools.map((tool) => [tool.name, tool.title])).toEqual([['open_viewer', 'Open igv-bot']])
  })

  it("returns the Join link for the session's Room, as text and as a resource link", async () => {
    const result = await callTool('open_viewer', { 'mcp-session-id': '7ZQH4M2K9X' })

    const joinLink = 'http://localhost:5173/?room=7ZQH4M2K9X' // VIEWER_URL in wrangler.toml
    expect(result.isError).toBeFalsy()
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(`\n${joinLink}\n`) // on a line of its own, so Hosts render it clickable
    expect(result.content[1]).toMatchObject({ type: 'resource_link', uri: joinLink, name: 'Open igv-bot', mimeType: 'text/html' })
  })

  it('the Room of a session just initialized is the one in its Join link', async () => {
    const session = (await initialize()).headers.get('mcp-session-id')!

    const result = await callTool('open_viewer', { 'mcp-session-id': session })

    expect(result.content[1].uri).toBe(`http://localhost:5173/?room=${session}`)
  })

  it.each([
    ['no session id', undefined],
    ['a session id that is not a Room id', { 'mcp-session-id': 'not a room' }],
  ])('with %s, replies with an error and no link', async (_, headers) => {
    const result = await callTool('open_viewer', headers)

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      { type: 'text', text: 'Error: this MCP session has no Room. Reconnect the igv-bot Connector and try again.' },
    ])
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
