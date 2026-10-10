const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{10}$/

/**
 * A Room id: 10 Crockford base32 characters (about 50 bits), short enough to
 * sit in a Join link, long enough to be unguessable.
 */
export function mintRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => CROCKFORD_BASE32[b & 31]).join('')
}

export function isRoomId(value: string | null): value is string {
  return value !== null && ROOM_ID.test(value)
}
