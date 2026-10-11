import { MessageType, isCommand, type Command, type RoomMessage, type SessionSummary, type ViewerMessage } from './protocol.ts'

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
  /**
   * Applies a command from the Room to the genome browser and resolves with the
   * resulting Session summary; a rejection's message is sent back as the error.
   */
  applyCommand: (command: Command) => Promise<SessionSummary>
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
 * they arrive, and each is answered with one ack.
 */
export function connectToRoom({
  url,
  onStatus,
  applyCommand,
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
      if (message?.type === MessageType.JOINED) onStatus({ state: 'joined', room: message.room })
      else if (isCommand(message)) {
        const { requestId, ...command } = message
        lastCommand = lastCommand
          .then(() => applyCommand(command))
          .then(
            (result): ViewerMessage => ({ type: MessageType.ACK, requestId, ok: true, result }),
            (error): ViewerMessage => ({ type: MessageType.ACK, requestId, ok: false, error: errorMessage(error) }),
          )
          .then((ack) => {
            // The Room that asked is the one on this socket; if it has dropped, the ack has nowhere to go.
            if (socket === current) send(socket, ack)
          })
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
