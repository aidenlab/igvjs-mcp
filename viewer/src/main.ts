import igv from 'igv'
import './styles/viewer.scss'
import { connectToRoom, roomSocketUrl, type RoomStatus } from './roomConnection.ts'

const statusElement = document.querySelector<HTMLElement>('.viewer__status')!
const browserElement = document.querySelector<HTMLElement>('.viewer__browser')!

const STATUS_TEXT: Record<RoomStatus['state'], string> = {
  connecting: 'Connecting…',
  joined: 'Connected',
  reconnecting: 'Connection lost. Reconnecting…',
}

function showStatus(status: RoomStatus) {
  statusElement.textContent = STATUS_TEXT[status.state]
  statusElement.classList.toggle('viewer__status--joined', status.state === 'joined')
  if (status.state === 'joined') statusElement.dataset.room = status.room
  else delete statusElement.dataset.room
}

// A Join link carries ?room=; without it there is no Room to join.
const room = new URLSearchParams(location.search).get('room')
if (room) {
  connectToRoom({ url: roomSocketUrl(import.meta.env.VITE_SERVER_URL, room), onStatus: showStatus })
} else {
  statusElement.textContent = 'Not connected. Ask Claude or ChatGPT to open igv-bot.'
}

// The default Viewer: hg38 in whole-genome view, with the genome's own default
// gene annotation track and nothing else.
await igv.createBrowser(browserElement, { genome: 'hg38', locus: 'all' })
