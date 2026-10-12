/**
 * The model's side of the MCP face: JSON-RPC over POST /mcp on the Worker under test.
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

export function initialize(headers?: Record<string, string>) {
  return rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } }, headers)
}

export interface ToolResult {
  content: Array<{ type: string; text?: string; uri?: string; name?: string; mimeType?: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export async function callTool(name: string, headers?: Record<string, string>, args: object = {}) {
  const res = await rpc('tools/call', { name, arguments: args }, headers)
  return (await res.json<{ result: ToolResult }>()).result
}
