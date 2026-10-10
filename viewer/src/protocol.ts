/**
 * Wire protocol between a Viewer and its Room on the server. Imported by the
 * server through the `igvjs-mcp-viewer/protocol` subpath so both ends share one
 * spelling. No runtime dependencies, no DOM.
 */

export const MessageType = {
  JOIN: 'join', // Viewer → Room: {}
  JOINED: 'joined', // Room → Viewer: {room}
} as const

export interface JoinMessage {
  type: typeof MessageType.JOIN
}

export interface JoinedMessage {
  type: typeof MessageType.JOINED
  room: string
}

export type ViewerMessage = JoinMessage
export type RoomMessage = JoinedMessage
