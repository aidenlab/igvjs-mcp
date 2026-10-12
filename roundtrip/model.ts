/**
 * The model's side of the round trip: tools called on the local Worker's /mcp,
 * and the Viewer the model's Join link opens, in a headless browser.
 */
import { expect } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import type { SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { SERVER_URL, VIEWER_URL } from './addresses.ts'

interface ToolResult {
  content: Array<{ type: string; text: string }>
  structuredContent?: { room?: string }
  isError?: boolean
}

let rpcId = 0
async function rpc(method: string, params: object, room?: string) {
  const res = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(room ? { 'mcp-session-id': room } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  return { headers: res.headers, body: (await res.json()) as { result: ToolResult } }
}

/** Starts an MCP session as a Host would and gives its id, which is the id of the session's Room. */
export async function newSession(): Promise<string> {
  const initialized = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'roundtrip', version: '0' } })
  return initialized.headers.get('mcp-session-id')!
}

/** A tool reply as it comes: its text, and whether it is an error. */
export async function toolReply(room: string, name: string, args: object = {}) {
  const { result } = (await rpc('tools/call', { name, arguments: args }, room)).body
  return { text: result.content[0].text, isError: result.isError === true, structuredContent: result.structuredContent }
}

/** A tool reply, with the Session summary it carries read out of its text. */
export async function callTool(room: string, name: string, args: object = {}) {
  const { text, isError } = await toolReply(room, name, args)
  const marker = 'Session summary:\n'
  expect(text).toContain(marker)
  const summary = JSON.parse(text.slice(text.indexOf(marker) + marker.length)) as SessionSummary
  return { text, isError, summary }
}

/** The start and end, in base pairs, of a locus such as "chr8:127,735,434-127,742,951". */
export function span(locus: string): [number, number] {
  const [start, end] = locus.split(':')[1].split('-').map((n) => Number(n.replaceAll(',', '')))
  return [start, end]
}

/** Opens the Join link of `room` in a headless browser and waits for the Viewer to join. */
export async function openViewer(room: string): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`${VIEWER_URL}/?room=${room}`)
  await page.locator('.viewer__status--joined').waitFor()
  return { browser, page }
}
