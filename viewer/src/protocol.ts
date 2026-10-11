/**
 * Wire protocol between a Viewer and its Room on the server. Imported by the
 * server through the `igvjs-mcp-viewer/protocol` subpath so both ends share one
 * spelling. No runtime dependencies, no DOM.
 */

export const MessageType = {
  JOIN: 'join', // Viewer → Room: {}
  JOINED: 'joined', // Room → Viewer: {room}
  ACK: 'ack', // Viewer → Room: {requestId, ok, result?, error?}
} as const

/** Commands: Room → Viewer. Every one carries `requestId` and is answered with one `ack`. */
export const CommandType = {
  GO_TO_LOCUS: 'goToLocus', // {locus}
  GO_TO_GENE: 'goToGene', // {gene}
  ZOOM_IN: 'zoomIn', // {}
  ZOOM_OUT: 'zoomOut', // {}
} as const

export interface JoinMessage {
  type: typeof MessageType.JOIN
}

export interface JoinedMessage {
  type: typeof MessageType.JOINED
  room: string
}

/** What a tool asks of the Viewer, before the Room gives it a request id. */
export type Command =
  | { type: typeof CommandType.GO_TO_LOCUS; locus: string }
  | { type: typeof CommandType.GO_TO_GENE; gene: string }
  | { type: typeof CommandType.ZOOM_IN }
  | { type: typeof CommandType.ZOOM_OUT }

export type CommandMessage = Command & { requestId: string }

export interface SessionSummaryTrack {
  name: string
  type: string
  /** Absent for tracks that have no file of their own, such as the reference sequence. */
  url?: string
  /** In pixels. Absent when the Session states none. */
  height?: number
}

/** The compact account of the Session carried on every tool reply. */
export interface SessionSummary {
  genome: string
  loci: string[]
  /** In display order, top to bottom. */
  tracks: SessionSummaryTrack[]
  crosshairs: boolean
  centreLine: boolean
}

/**
 * The single answer to a command: ok with the resulting Session summary, or
 * not ok with igv.js's own error message.
 */
export type AckMessage =
  | { type: typeof MessageType.ACK; requestId: string; ok: true; result: SessionSummary }
  | { type: typeof MessageType.ACK; requestId: string; ok: false; error: string }

export type ViewerMessage = JoinMessage | AckMessage
export type RoomMessage = JoinedMessage | CommandMessage

const commandTypes = new Set<string>(Object.values(CommandType))

export function isCommand(message: unknown): message is CommandMessage {
  if (typeof message !== 'object' || message === null) return false
  const { type, requestId } = message as Record<string, unknown>
  return typeof type === 'string' && commandTypes.has(type) && typeof requestId === 'string'
}

export function isAck(message: unknown): message is AckMessage {
  if (typeof message !== 'object' || message === null) return false
  const { type, requestId, ok } = message as Record<string, unknown>
  return type === MessageType.ACK && typeof requestId === 'string' && typeof ok === 'boolean'
}
