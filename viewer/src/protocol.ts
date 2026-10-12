/**
 * Wire protocol between a Viewer and its Room on the server. Imported by the
 * server through the `igvjs-mcp-viewer/protocol` subpath so both ends share one
 * spelling. No runtime dependencies, no DOM.
 */

export const MessageType = {
  JOIN: 'join', // Viewer → Room: {}
  JOINED: 'joined', // Room → Viewer: {room}
  COMMAND: 'command', // Room → Viewer: {id, command}
  ACK: 'ack', // Viewer → Room: {id, ok: true, summary} or {id, ok: false, error, summary}
} as const

export interface JoinMessage {
  type: typeof MessageType.JOIN
}

export interface JoinedMessage {
  type: typeof MessageType.JOINED
  room: string
}

/** What a tool call asks the Viewer to do. One member per command type; each has an applier in the Viewer. */
export type Command =
  | { type: 'go_to_locus'; locus: string }
  | { type: 'go_to_gene'; gene: string }
  | { type: 'zoom_in' }
  | { type: 'zoom_out' }

export type CommandType = Command['type']

/** One track of the Session summary. */
export interface TrackSummary {
  name: string
  type: string
  /** Absent for tracks that have no file, such as the reference sequence. */
  url?: string
  height: number
}

/** The compact account of the Session the model is given with every tool reply. */
export interface SessionSummary {
  genome: string
  loci: string[]
  /** In display order, top to bottom. */
  tracks: TrackSummary[]
  crosshairs: boolean
  centreLine: boolean
}

/** How a command went in the Viewer: applied, or igv.js's own error. Either way with the Session summary afterwards. */
export type CommandOutcome = { ok: true; summary: SessionSummary } | { ok: false; error: string; summary: SessionSummary }

export interface CommandMessage {
  type: typeof MessageType.COMMAND
  /** The request id; the Viewer's ack carries it back. */
  id: string
  command: Command
}

export type AckMessage = { type: typeof MessageType.ACK; id: string } & CommandOutcome

export type ViewerMessage = JoinMessage | AckMessage
export type RoomMessage = JoinedMessage | CommandMessage
