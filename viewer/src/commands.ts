import type { Command, CommandOutcome, CommandType, TrackAddress, TrackToLoad } from './protocol.ts'
import { displayOrder, sessionSummary, type Session } from './session.ts'
import { addressTrack } from './trackAddress.ts'

/**
 * The part of an igv.js browser the commands use. igv.js's own typings are
 * looser than its behaviour: `search` resolves with whether the locus was found.
 */
export interface GenomeBrowser {
  search(locus: string): Promise<boolean>
  zoomIn(): void
  zoomOut(): void
  /** Replaces the genome, and the tracks with the new genome's default ones. */
  loadGenome(id: string): Promise<unknown>
  /** Rejects with igv.js's own error when the track's file cannot be read. */
  loadTrack(config: { url: string; name?: string }): Promise<unknown>
  removeTrack(track: BrowserTrack): void
  toJSON(): Session
  findTracks(filter: (track: BrowserTrack) => boolean): BrowserTrack[]
  /** Crosshairs. */
  doShowCursorGuide?: boolean
  doShowCenterLine?: boolean
}

interface BrowserTrack {
  /** The name the track is shown under. */
  name?: string
  height?: number
  /** False for the sequence track. */
  removable?: boolean
  config?: object
  getState?: () => object
}

type Applier<T extends CommandType> = (browser: GenomeBrowser, command: Extract<Command, { type: T }>) => Promise<void> | void

/** `browser.search` reports an unknown locus by resolving false; the wording is the alert igv.js's own locus box shows. */
async function goTo(browser: GenomeBrowser, locus: string): Promise<void> {
  if (!(await browser.search(locus))) throw new Error(`Unrecognized locus: ${locus}`)
}

/** The tracks igv.js writes to a Session, in the order it writes them: those with state to save. */
function savedTracks(browser: GenomeBrowser): BrowserTrack[] {
  return browser.findTracks((track) => typeof track.getState === 'function' || Boolean(track.config))
}

/**
 * Loads the tracks one after another, so that they are shown in the order
 * given and one that fails does not stop the rest.
 */
async function loadTracks(browser: GenomeBrowser, tracks: TrackToLoad[]): Promise<void> {
  const errors: string[] = []
  for (const { url, name } of tracks) {
    try {
      // An empty name is a name left out: igv.js then gives its default.
      await browser.loadTrack({ url, ...(name ? { name } : {}) })
    } catch (raised) {
      errors.push(raised instanceof Error ? raised.message : String(raised))
    }
  }
  if (errors.length === 0) return
  if (tracks.length === 1) throw new Error(errors[0])
  throw new Error(`${errors.length} of the ${tracks.length} tracks did not load:\n${errors.join('\n')}`)
}

function removeTrack(browser: GenomeBrowser, address: TrackAddress): void {
  const session = captureSession(browser)
  const position = addressTrack(sessionSummary(session).tracks, address)
  const track = savedTracks(browser)[displayOrder(session.tracks)[position]]
  // igv.js's own menu offers no removal of the sequence track, though its API would carry one out.
  if (track.removable === false) throw new Error('The sequence track cannot be removed.')
  browser.removeTrack(track)
}

/** One applier per command type: what the command does to igv.js. */
const APPLIERS: { [T in CommandType]: Applier<T> } = {
  go_to_locus: (browser, { locus }) => goTo(browser, locus),
  go_to_gene: (browser, { gene }) => goTo(browser, gene),
  zoom_in: (browser) => browser.zoomIn(),
  zoom_out: (browser) => browser.zoomOut(),
  change_genome: async (browser, { genome }) => {
    await browser.loadGenome(genome)
  },
  load_tracks: (browser, { tracks }) => loadTracks(browser, tracks),
  remove_track: (browser, { name, position }) => removeTrack(browser, { name, position }),
  // Changes nothing: the ack carries the Session summary, as every ack does.
  read_session_summary: () => {},
}

/**
 * The Session as it stands: what igv.js writes, plus what it leaves out. A
 * track's height is written only when it differs from the default, its name
 * only when it was loaded with one, and the crosshairs and centre line are not
 * written at all.
 */
export function captureSession(browser: GenomeBrowser): Session {
  const session = browser.toJSON()
  const saved = savedTracks(browser)
  return {
    ...session,
    tracks: session.tracks.map((track, index) => ({
      ...track,
      name: track.name ?? saved[index]?.name,
      height: track.height ?? saved[index]?.height,
    })),
    showCursorGuide: browser.doShowCursorGuide === true,
    showCenterGuide: browser.doShowCenterLine === true,
  }
}

/** Applies `command` to igv.js. An error igv.js raises applying it becomes the outcome. */
export async function applyCommand(browser: GenomeBrowser, command: Command): Promise<CommandOutcome> {
  let error: string | undefined
  try {
    await (APPLIERS[command.type] as Applier<CommandType>)(browser, command)
  } catch (raised) {
    error = raised instanceof Error ? raised.message : String(raised)
  }
  const summary = sessionSummary(captureSession(browser))
  return error === undefined ? { ok: true, summary } : { ok: false, error, summary }
}
