import igv from 'igv'
import './styles/viewer.scss'
import { watchChanges, type ChangeSource } from './changes.ts'
import { applyCommand, captureSession, type GenomeBrowser } from './commands.ts'
import { connectToRoom, roomSocketUrl, statusText, type RoomStatus } from './roomConnection.ts'
import { sessionSummary } from './session.ts'

const statusElement = document.querySelector<HTMLElement>('.viewer__status')!
const browserElement = document.querySelector<HTMLElement>('.viewer__browser')!

function showStatus(status: RoomStatus) {
  statusElement.textContent = statusText(status)
  statusElement.classList.toggle('viewer__status--joined', status.state === 'joined')
  if (status.state === 'joined') statusElement.dataset.room = status.room
  else delete statusElement.dataset.room
}

// The default Viewer: hg38 in whole-genome view, with the genome's own default
// gene annotation track and nothing else.
const browser = igv.createBrowser(browserElement, { genome: 'hg38', locus: 'all' }) as unknown as Promise<GenomeBrowser & ChangeSource>

// A Join link carries ?room=; without it there is no Room to join. The Viewer
// joins while igv.js is still loading; a command that arrives early waits for it.
const room = new URLSearchParams(location.search).get('room')
if (room) {
  const { reportSummary } = connectToRoom({
    url: roomSocketUrl(import.meta.env.VITE_SERVER_URL, room),
    onStatus: showStatus,
    onCommand: async (command) => applyCommand(await browser, command),
  })
  // The Room hears of every change, whoever made it: by hand in igv.js, or by a command.
  void browser.then((loaded) => watchChanges(loaded, () => sessionSummary(captureSession(loaded)), reportSummary))
} else {
  statusElement.textContent = 'Not connected. Ask Claude or ChatGPT to open igv-bot.'
}
