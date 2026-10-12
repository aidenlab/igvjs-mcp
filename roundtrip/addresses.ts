/**
 * Where the round trip's own stack listens. Not the development ports (5173,
 * 8787), so it runs beside `npm run dev:*`. The Viewer's origin is on the local
 * Worker's VIEWER_ORIGINS list in server/wrangler.toml.
 */
export const VIEWER_URL = 'http://localhost:4173'
export const SERVER_URL = 'http://localhost:8797'
