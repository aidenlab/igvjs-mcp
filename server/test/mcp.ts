/**
 * The model's side: JSON-RPC over POST /mcp on the Worker under test.
 */
import { SELF } from 'cloudflare:test'

let rpcId = 0
export function rpc(method: string, params: object, headers: Record<string, string> = {}) {
  return SELF.fetch('https://igv-bot.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
}

export interface ToolResult {
  content: Array<{ type: string; text?: string; uri?: string; name?: string; mimeType?: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export async function callTool(name: string, args: object = {}, headers?: Record<string, string>) {
  const res = await rpc('tools/call', { name, arguments: args }, headers)
  return (await res.json<{ result: ToolResult }>()).result
}

/** The text of a reply's first content block. */
export function textOf(result: ToolResult): string {
  return result.content[0].text ?? ''
}
