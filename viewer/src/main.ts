import igv, { type CreateOpt } from 'igv'
import './styles/viewer.scss'
import { watchChanges, type ChangeSource } from './changes.ts'
import { applyCommand, captureSession, type GenomeBrowser } from './commands.ts'
import { controls as pageControls, type NavigationBarOwner } from './controls.ts'
import type { SavedSession, SessionReport } from './protocol.ts'
import { connectToRoom, roomSocketUrl, statusText, type RoomStatus } from './roomConnection.ts'
import { sessionSummary } from './session.ts'
import { shareableUrl } from './shareableUrl.ts'

const statusElement = document.querySelector<HTMLElement>('.viewer__status')!
const browserElement = document.querySelector<HTMLElement>('.viewer__browser')!
const controls = pageControls()

function showStatus(status: RoomStatus) {
  statusElement.textContent = statusText(status)
  statusElement.classList.toggle('viewer__status--joined', status.state === 'joined')
  if (status.state === 'joined') statusElement.dataset.room = status.room
  else delete statusElement.dataset.room
}

type Browser = GenomeBrowser & ChangeSource & NavigationBarOwner

// The default Viewer: hg38 in whole-genome view, with the genome's own default
// gene annotation track and nothing else.
const DEFAULT_VIEWER: CreateOpt = { genome: 'hg38', locus: 'all' }

/** igv.js showing `config`, as the genome browser on the page: Controls hidden while it loaded are hidden on it. */
async function createBrowser(config: CreateOpt): Promise<Browser> {
  const browser = (await igv.createBrowser(browserElement, config)) as unknown as Browser
  controls.setGenomeBrowser(browser)
  return browser
}

/** igv.js showing the Session saved in the Room, or the default Viewer when there is none or it will not load. */
async function openBrowser(saved: SavedSession | undefined): Promise<Browser> {
  if (!saved) return createBrowser(DEFAULT_VIEWER)
  try {
    // igv.js takes a Session it wrote as its configuration.
    return await createBrowser(saved as CreateOpt)
  } catch (error) {
    // Left as it is, every reload would restore the same Session and fail the same way.
    console.error('[viewer] the saved Session did not load; showing the default Viewer', error)
    igv.removeAllBrowsers()
    return createBrowser(DEFAULT_VIEWER)
  }
}

/**
 * Watches igv.js for changes, whoever makes them: by hand in igv.js, or by a
 * command. After each, `reportSession` is given the Session as it stands and
 * the Controls show its Shareable URL. Returns the function to call
 * after a change igv.js does not announce.
 */
function watchSession(loaded: Browser, reportSession: (report: SessionReport) => void = () => {}): () => void {
  const changed = watchChanges(
    loaded,
    () => {
      const session = captureSession(loaded)
      return { session, summary: sessionSummary(session) }
    },
    (report) => {
      // The Room first: it is told whatever becomes of the link.
      reportSession(report)
      controls.showShareableUrl(shareableUrl(loaded))
    },
  )
  // igv.js announces nothing when its crosshairs or centre line button is pressed.
  browserElement.addEventListener('click', changed)
  return changed
}

// A Join link carries ?room=; without it there is no Room to join.
const room = new URLSearchParams(location.search).get('room')
if (room) {
  // igv.js starts once the Room has said what to restore; a command that
  // arrives while it is loading waits for it. In an expired Room it never starts.
  let restore!: (saved: SavedSession | undefined) => void
  const browser = new Promise<SavedSession | undefined>((resolve) => (restore = resolve)).then(openBrowser)
  /** Tells the Room the Session may have changed. Does nothing until igv.js has loaded, which a command waits for. */
  let changed = () => {}
  const { reportSession } = connectToRoom({
    url: roomSocketUrl(import.meta.env.VITE_SERVER_URL, room),
    onStatus: showStatus,
    onFirstJoin: restore,
    onCommand: async (command) => {
      const outcome = await applyCommand(await browser, command)
      // igv.js announces nothing when its crosshairs or centre line is shown or hidden, by a command as by its own button.
      changed()
      return outcome
    },
  })
  // The Room hears of every change.
  void browser.then((loaded) => {
    changed = watchSession(loaded, reportSession)
  })
} else {
  statusElement.textContent = 'Not connected. Ask Claude or ChatGPT to open igv-bot.'
  // With no Room the Shareable URL still works: it needs none.
  void createBrowser(DEFAULT_VIEWER).then((loaded) => watchSession(loaded))
}
