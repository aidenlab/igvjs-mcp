import { MessageType, type Command, type CommandOutcome, type RoomMessage, type SavedSession, type SessionReport, type ViewerMessage } from './protocol.ts'

/** The part of a WebSocket the connection uses; tests supply a fake. */
export interface RoomSocket {
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(): void
}

export type RoomStatus = { state: 'connecting' } | { state: 'joined'; room: string } | { state: 'reconnecting' } | { state: 'expired' }

/** The Viewer's status line. A joined Viewer names its Room, so Rooms can be compared across Conversations. */
export function statusText(status: RoomStatus): string {
  switch (status.state) {
    case 'connecting':
      return 'Connecting…'
    case 'joined':
      return `Connected · Room ${status.room}`
    case 'reconnecting':
      return 'Connection lost. Reconnecting…'
    case 'expired':
      return 'This igv-bot has expired. Ask Claude or ChatGPT to open a new one.'
  }
}

export interface RoomConnectionOptions {
  /** The Room's socket address; see `roomSocketUrl`. */
  url: string
  onStatus: (status: RoomStatus) => void
  /**
   * Called once, the first time the Room is joined, with the Session saved
   * there for the Viewer to restore, or with nothing when the Room has none.
   * Not called for an expired Room.
   */
  onFirstJoin: (saved: SavedSession | undefined) => void
  /** Applies a command from the Room; what it resolves with is sent back as the ack. */
  onCommand: (command: Command) => Promise<CommandOutcome>
  createSocket?: (url: string) => RoomSocket
}

export interface RoomConnection {
  /**
   * Saves the Session as it now stands in the Room, with its summary. Call it
   * after any change, whoever made it: a Session the Room already has is not
   * sent again, and one reported while the socket is down is sent on the next join.
   */
  reportSession: (report: SessionReport) => void
}

/** The address of a Room's socket on the server at `serverUrl`. */
export function roomSocketUrl(serverUrl: string, room: string): string {
  const url = new URL('/ws', serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('room', room)
  return url.toString()
}

/**
 * Connects the Viewer to its Room and joins it. When the socket drops it
 * reconnects by itself, waiting 1 s, 2 s, … up to 5 s between attempts, and
 * joins again, unless the Room has expired. Commands from the Room are applied one at a time, in the order
 * they arrive, and each is acked on the socket it came in on.
 */
export function connectToRoom({
  url,
  onStatus,
  onFirstJoin,
  onCommand,
  createSocket = (socketUrl) => new WebSocket(socketUrl),
}: RoomConnectionOptions): RoomConnection {
  let current: RoomSocket | null = null
  let joined = false
  let everJoined = false
  let failedAttempts = 0
  let lastCommand: Promise<unknown> = Promise.resolve()
  /** The Session as last reported. */
  let latestReport: SessionReport | null = null
  /** The report the Room was last sent on the current socket, as JSON. */
  let sentReportJson: string | null = null

  const send = (socket: RoomSocket, message: ViewerMessage) => socket.send(JSON.stringify(message))

  function sendLatestReport(socket: RoomSocket) {
    if (!latestReport) return
    const reportJson = JSON.stringify(latestReport)
    if (reportJson === sentReportJson) return
    send(socket, { type: MessageType.SESSION, ...latestReport })
    sentReportJson = reportJson
  }

  function connect() {
    const socket = createSocket(url)
    current = socket
    joined = false
    sentReportJson = null

    // A socket that is no longer `current` has dropped; its late events are ignored.
    socket.onopen = () => {
      if (socket !== current) return
      failedAttempts = 0
      send(socket, { type: MessageType.JOIN })
    }

    socket.onmessage = (event) => {
      if (socket !== current) return
      let message: RoomMessage
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return // not ours; ignored
      }
      if (message?.type === MessageType.JOINED) {
        joined = true
        onStatus({ state: 'joined', room: message.room })
        // Only a Viewer that has just been opened restores: after that its own Session is the truth.
        if (!everJoined) onFirstJoin(message.session)
        everJoined = true
        sendLatestReport(socket)
      } else if (message?.type === MessageType.EXPIRED) {
        // The Room closes the socket; with no `current`, nothing reconnects.
        current = null
        joined = false
        onStatus({ state: 'expired' })
      } else if (message?.type === MessageType.COMMAND) {
        const { id, command } = message
        lastCommand = lastCommand
          .then(async () => {
            const outcome = await onCommand(command)
            // A socket that dropped meanwhile has no one to tell.
            if (socket !== current) return
            send(socket, { type: MessageType.ACK, id, ...outcome })
          })
          // Unacked, so the tool replies "sent, unconfirmed"; later commands still run.
          .catch((error) => console.error('[room] command failed', error))
      }
    }

    socket.onclose = () => {
      if (socket !== current) return
      current = null
      joined = false
      onStatus({ state: 'reconnecting' })
      failedAttempts++
      setTimeout(connect, 1000 * Math.min(failedAttempts, 5))
    }
  }

  onStatus({ state: 'connecting' })
  connect()

  return {
    reportSession(report) {
      latestReport = report
      if (current && joined) sendLatestReport(current)
    },
  }
}
