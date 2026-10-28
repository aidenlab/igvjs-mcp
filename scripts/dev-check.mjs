#!/usr/bin/env node
// Call one MCP tool on the igv-bot dev Worker, aimed at a Room, and print the reply text.
//
//   node scripts/dev-check.mjs <room> <tool> ['<json args>']
//   node scripts/dev-check.mjs SMKTEST001 read_session_summary
//   node scripts/dev-check.mjs SMKTEST001 go_to_gene '{"gene":"BRCA1"}'
//
// Open the Viewer in the Room first: https://igv-bot-web-dev.pages.dev/?room=<room>. Any 10 Crockford
// base32 characters make a Room id (digits and A-Z without I, L, O or U). Use a throwaway Room,
// never one someone is working in. See docs/dev-check.md.
//
// Every call passes `room`, as the model does (ADR 0003), so each run is a fresh MCP session
// and no join step is needed. MCP_URL points the script at another Worker, such as
// http://localhost:8787/mcp under `npm run dev:server`.
const [roomArgument, tool, argsJson = '{}'] = process.argv.slice(2);
if (!roomArgument || !tool) {
  console.error('usage: node scripts/dev-check.mjs <room> <tool> [json-args]');
  process.exit(2);
}
const room = roomArgument.trim().toUpperCase();
if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(room)) {
  console.error(`"${roomArgument}" is not a Room id: it takes 10 characters from 0-9 and A-Z without I, L, O or U, such as SMKTEST001.`);
  process.exit(2);
}
let args;
try {
  args = JSON.parse(argsJson);
} catch {
  console.error(`The arguments are not JSON: ${argsJson}`);
  process.exit(2);
}
const url = process.env.MCP_URL || 'https://igv-bot-mcp-dev.3dg.io/mcp';
const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

async function rpc(id, method, params, sessionId) {
  const res = await fetch(url, {
    method: 'POST',
    headers: sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = JSON.parse(text.match(/data: (.*)/)[1]); // SSE-framed answer
  }
  return [json, res.headers.get('mcp-session-id')];
}

const [, sessionId] = await rpc(1, 'initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'dev-check', version: '0' },
});
const [reply] = await rpc(2, 'tools/call', { name: tool, arguments: { ...args, room } }, sessionId);
const text = (reply.result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
console.log(text || JSON.stringify(reply, null, 2));
if (reply.result?.isError || reply.error) process.exit(1);
