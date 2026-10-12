const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{10}$/

function roomIdFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 10), (b) => CROCKFORD_BASE32[b & 31]).join('')
}

/**
 * A Room id: 10 Crockford base32 characters (about 50 bits), short enough to
 * sit in a Join link, long enough to be unguessable.
 */
export function mintRoomId(): string {
  return roomIdFromBytes(crypto.getRandomValues(new Uint8Array(10)))
}

/**
 * The Room id for a Host-specific session header (ChatGPT's `x-openai-session`),
 * by HMAC-SHA256 under `secret`: the same value always gives the same Room, and
 * the raw value never appears in a Join link.
 */
export async function deriveRoomId(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return roomIdFromBytes(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))))
}

/** The Room id in `value` as a model or person may give it, lower case or with spaces around it; null if it is not one. */
export function parseRoomId(value: string): string | null {
  const roomId = value.trim().toUpperCase()
  return isRoomId(roomId) ? roomId : null
}

export function isRoomId(value: string | null): value is string {
  return value !== null && ROOM_ID.test(value)
}
