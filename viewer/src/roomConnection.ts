import { MessageType, type Command, type CommandOutcome, type RoomMessage, type ViewerMessage } from './protocol.ts'

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
}: RoomConnectionOptions): void {
  let current: RoomSocket | null = null
  let failedAttempts = 0
  let lastCommand: Promise<unknown> = Promise.resolve()

  const send = (socket: RoomSocket, message: ViewerMessage) => socket.send(JSON.stringify(message))

  function connect() {
    const socket = createSocket(url)
    current = socket

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
        onStatus({ state: 'joined', room: message.room })
      } else if (message?.type === MessageType.COMMAND) {
        const { id, command } = message
        lastCommand = lastCommand
          .then(async () => {
            const outcome = await onCommand(command)
            // A socket that dropped meanwhile has no one to tell.
            if (socket === current) send(socket, { type: MessageType.ACK, id, ...outcome })
          })
          // Unacked, so the tool replies "sent, unconfirmed"; later commands still run.
          .catch((error) => console.error('[room] command failed', error))
      }
    }

    socket.onclose = () => {
      if (socket !== current) return
      current = null
      onStatus({ state: 'reconnecting' })
      failedAttempts++
      setTimeout(connect, 1000 * Math.min(failedAttempts, 5))
    }
  }

  onStatus({ state: 'connecting' })
  connect()
}
