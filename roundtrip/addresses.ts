/**
 * Where the round-trip stack listens. Ports of its own, so it runs beside
 * `npm run dev:server` and `npm run dev:viewer`. The Viewer's origin here is on
 * the VIEWER_ORIGINS list in server/wrangler.toml.
 */
export const SERVER_URL = 'http://localhost:8798'
export const VIEWER_URL = 'http://localhost:4183'
