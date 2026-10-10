/**
 * Cloudflare Worker entry point for igv-bot.
 *
 * Routes:
 *   GET  /ws?room= - WebSocket upgrade → the Room's Durable Object (Viewers); Origin must be a Viewer origin
 *   POST /mcp      - MCP protocol (stateless Streamable HTTP, JSON responses)
 *   GET  /mcp      - 405 (no SSE stream)
 *   OPTIONS /mcp   - CORS preflight
 *   GET  /*        - 404 (the Viewer is hosted on its own origin, not by this Worker)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isRoomId, mintRoomId } from './roomId.ts'
import { registerTools } from './tools.ts'

// Re-exported so Cloudflare can find the Durable Object class.
export { Room } from './room.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id',
}

function withCors(response: Response): Response {
  const patched = new Response(response.body, response)
  for (const [key, value] of Object.entries(CORS_HEADERS)) patched.headers.set(key, value)
  return patched
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      const origin = request.headers.get('Origin')
      if (!origin || !env.VIEWER_ORIGINS.includes(origin)) {
        console.warn(`[ws] refused Origin: ${origin}`)
        return new Response('Origin not allowed', { status: 403 })
      }
      const room = url.searchParams.get('room')
      if (!isRoomId(room)) return new Response('Missing or malformed room', { status: 400 })
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(request)
    }

    if (url.pathname === '/mcp') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
      if (request.method !== 'POST') {
        return new Response('Method not allowed. Use Streamable HTTP (POST).', {
          status: 405,
          headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS' },
        })
      }
      return withCors(await handleMcpRequest(request, env))
    }

    return new Response('Not Found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

interface JsonRpcMessage {
  method?: string
}

/**
 * Workers are stateless, so every request gets a fresh McpServer and transport.
 * The MCP session id is a Room id: minted on `initialize`, echoed back by the
 * Host on later requests, and read from the header here (ADR 0002).
 */
async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  let body: JsonRpcMessage | JsonRpcMessage[]
  try {
    body = await request.json()
  } catch {
    return Response.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, { status: 400 })
  }

  try {

    const sessionId = request.headers.get('mcp-session-id')

    const mcpServer = new McpServer({ name: 'igv-bot', version: '0.0.0' })
    registerTools(mcpServer, { roomId: isRoomId(sessionId) ? sessionId : null, viewerUrl: env.VIEWER_URL })
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await mcpServer.connect(transport)

    const response = await transport.handleRequest(request, { parsedBody: body })

    const isInitialize = [body].flat().some((message) => message.method === 'initialize')
    if (!isInitialize || !response.ok) return response
    const patched = new Response(response.body, response)
    patched.headers.set('mcp-session-id', mintRoomId())
    return patched
  } catch (error) {
    console.error('Error handling MCP request:', error)
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null },
      { status: 500 },
    )
  }
}
