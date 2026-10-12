/**
 * Wire protocol between a Viewer and its Room on the server. Imported by the
 * server through the `igvjs-mcp-viewer/protocol` subpath so both ends share one
 * spelling. No runtime dependencies, no DOM.
 */

export const MessageType = {
  JOIN: 'join', // Viewer → Room: {}
  JOINED: 'joined', // Room → Viewer: {room}, and {session} when the Room has one saved
  EXPIRED: 'expired', // Room → Viewer: {}, in answer to a join of a Room whose stored data was deleted; the Room then closes the socket
  COMMAND: 'command', // Room → Viewer: {id, command}
  ACK: 'ack', // Viewer → Room: {id, ok: true, summary} or {id, ok: false, error, summary}
  SESSION: 'session', // Viewer → Room: {session, summary}, whenever the Room's copies may be out of date
} as const

export interface JoinMessage {
  type: typeof MessageType.JOIN
}

/** A Session as it travels to the Room and back: igv.js's own JSON, which the Room keeps without reading. */
export type SavedSession = object

export interface JoinedMessage {
  type: typeof MessageType.JOINED
  room: string
  /** The Session last saved in the Room, for the Viewer to restore. Absent when nothing is saved. */
  session?: SavedSession
}

export interface ExpiredMessage {
  type: typeof MessageType.EXPIRED
}

/** What a tool call asks the Viewer to do. One member per command type; each has an applier in the Viewer. */
export type Command =
  | { type: 'go_to_locus'; locus: string }
  | { type: 'go_to_gene'; gene: string }
  | { type: 'zoom_in' }
  | { type: 'zoom_out' }
  | { type: 'change_genome'; genome: string }
  | { type: 'load_tracks'; tracks: TrackToLoad[] }
  | ({ type: 'remove_track' } & TrackAddress)
  | ({ type: 'set_track_height'; height: TrackHeight } & TrackSelection)
  | { type: 'read_session_summary' }

/** A track to load: any URL the browser can fetch. */
export interface TrackToLoad {
  url: string
  /** Absent for igv.js's default, the file's name. */
  name?: string
}

/** Which track of the Session summary is meant: one of the two. */
export interface TrackAddress {
  name?: string
  /** Counted from 1 at the top of the Session summary's tracks. */
  position?: number
}

/** Which tracks of the Session summary are meant: some by name or position, or all of them. */
export interface TrackSelection {
  names?: string[]
  /** Each counted from 1 at the top of the Session summary's tracks. */
  positions?: number[]
  all?: boolean
}

/** The height to give a track: a number of pixels, or half as high again, or two thirds as high. */
export type TrackHeight = number | 'taller' | 'shorter'

export type CommandType = Command['type']

/** One track of the Session summary. */
export interface TrackSummary {
  name: string
  type: string
  /** Absent for tracks that have no file, such as the reference sequence. */
  url?: string
  /** In whole pixels: "shorter" can leave a track a part of one. */
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

/** The Session as it stands, with its summary. */
export interface SessionReport {
  session: SavedSession
  summary: SessionSummary
}

/**
 * Saves the Session and its summary in the Room: sent on joining and after
 * every change, whoever made it. A command's ack carries the summary alone.
 */
export type SessionMessage = { type: typeof MessageType.SESSION } & SessionReport

export type ViewerMessage = JoinMessage | AckMessage | SessionMessage
export type RoomMessage = JoinedMessage | ExpiredMessage | CommandMessage
