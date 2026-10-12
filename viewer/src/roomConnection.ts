import { MessageType, type Command, type CommandOutcome, type RoomMessage, type SessionSummary, type ViewerMessage } from './protocol.ts'

/** The part of a WebSocket the connection uses; tests supply a fake. */
export interface RoomSocket {
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(): void
}

export type RoomStatus = { state: 'connecting' } | { state: 'joined'; room: string } | { state: 'reconnecting' }

/** The Viewer's status line. A joined Viewer names its Room, so Rooms can be compared across Conversations. */
export function statusText(status: RoomStatus): string {
  switch (status.state) {
    case 'connecting':
      return 'Connecting…'
    case 'joined':
      return `Connected · Room ${status.room}`
    case 'reconnecting':
      return 'Connection lost. Reconnecting…'
  }
}

export interface RoomConnectionOptions {
  /** The Room's socket address; see `roomSocketUrl`. */
  url: string
  onStatus: (status: RoomStatus) => void
  /** Applies a command from the Room; what it resolves with is sent back as the ack. */
  onCommand: (command: Command) => Promise<CommandOutcome>
  createSocket?: (url: string) => RoomSocket
}

export interface RoomConnection {
  /**
   * Tells the Room the Session summary as it now stands. Call it after any
   * change, whoever made it: a summary the Room already has is not sent again,
   * and one reported while the socket is down is sent on the next join.
   */
  reportSummary: (summary: SessionSummary) => void
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
 * joins again. Commands from the Room are applied one at a time, in the order
 * they arrive, and each is acked on the socket it came in on.
 */
export function connectToRoom({
  url,
  onStatus,
  onCommand,
  createSocket = (socketUrl) => new WebSocket(socketUrl),
}: RoomConnectionOptions): RoomConnection {
  let current: RoomSocket | null = null
  let joined = false
  let failedAttempts = 0
  let lastCommand: Promise<unknown> = Promise.resolve()
  /** The Session summary as the Viewer last knew it, from an ack or a report. */
  let latest: SessionSummary | null = null
  /** The summary the Room was last sent on the current socket, as JSON. */
  let roomHas: string | null = null

  const send = (socket: RoomSocket, message: ViewerMessage) => socket.send(JSON.stringify(message))

  function sendLatestSummary(socket: RoomSocket) {
    if (!latest || JSON.stringify(latest) === roomHas) return
    send(socket, { type: MessageType.SUMMARY, summary: latest })
    roomHas = JSON.stringify(latest)
  }

  function connect() {
    const socket = createSocket(url)
    current = socket
    joined = false
    roomHas = null

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
        sendLatestSummary(socket)
      } else if (message?.type === MessageType.COMMAND) {
        const { id, command } = message
        lastCommand = lastCommand
          .then(async () => {
            const outcome = await onCommand(command)
            latest = outcome.summary
            // A socket that dropped meanwhile has no one to tell.
            if (socket !== current) return
            send(socket, { type: MessageType.ACK, id, ...outcome })
            roomHas = JSON.stringify(latest)
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
    reportSummary(summary) {
      latest = summary
      if (current && joined) sendLatestSummary(current)
    },
  }
}
