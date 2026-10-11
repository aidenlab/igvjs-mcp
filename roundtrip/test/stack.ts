/**
 * The two ends of a round trip: the model's side, calling tools over the local
 * Worker's MCP endpoint, and the person's side, the built Viewer in a headless
 * browser.
 */
import { chromium, type Browser, type Page } from 'playwright'
import type { SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { SERVER_URL, VIEWER_URL } from '../addresses.ts'

export interface ToolResult {
  content: Array<{ type: string; text?: string }>
  structuredContent?: { sessionSummary?: SessionSummary }
  isError?: boolean
}

let rpcId = 0
function rpc(method: string, params: object, room?: string): Promise<Response> {
  return fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(room ? { 'mcp-session-id': room } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
}

/** A new MCP session, as a Host starts one; its id is the Room id. */
export async function newRoom(): Promise<string> {
  const res = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'roundtrip', version: '0' } })
  return res.headers.get('mcp-session-id')!
}

export async function callTool(room: string, name: string, args: object = {}): Promise<ToolResult> {
  const res = await rpc('tools/call', { name, arguments: args }, room)
  return ((await res.json()) as { result: ToolResult }).result
}

export function textOf(result: ToolResult): string {
  return result.content[0].text ?? ''
}

/** The Session summary a reply carries. */
export function summaryOf(result: ToolResult): SessionSummary {
  if (!result.structuredContent?.sessionSummary) throw new Error(`The reply carries no Session summary: ${textOf(result)}`)
  return result.structuredContent.sessionSummary
}

let browser: Browser | undefined
const pages: Page[] = []

/** Open the Join link for `room`, as the Side panel would; resolves once the Viewer has joined and shows the genome. */
export async function openViewer(room: string): Promise<Page> {
  browser ??= await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  pages.push(page)
  await page.goto(`${VIEWER_URL}/?room=${room}`)
  await page.waitForSelector(`.viewer__status--joined[data-room="${room}"]`)
  await page.waitForSelector('.viewer__browser .igv-track-label', { timeout: 45_000 }) // the gene track is drawn
  return page
}

/** Close every Viewer opened since the last call, and the browser with them; for afterEach. */
export async function closeViewers(): Promise<void> {
  await Promise.all(pages.splice(0).map((page) => page.close()))
  await browser?.close()
  browser = undefined
}
