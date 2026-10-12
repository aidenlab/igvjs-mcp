import type { Command, CommandOutcome, CommandType } from './protocol.ts'
import { sessionSummary, type Session } from './session.ts'

/**
 * The part of an igv.js browser the commands use. igv.js's own typings are
 * looser than its behaviour: `search` resolves with whether the locus was found.
 */
export interface GenomeBrowser {
  search(locus: string): Promise<boolean>
  zoomIn(): void
  zoomOut(): void
  toJSON(): Session
  findTracks(filter: (track: BrowserTrack) => boolean): BrowserTrack[]
  /** Crosshairs. */
  doShowCursorGuide?: boolean
  doShowCenterLine?: boolean
}

interface BrowserTrack {
  height?: number
  config?: object
  getState?: () => object
}

type Applier<T extends CommandType> = (browser: GenomeBrowser, command: Extract<Command, { type: T }>) => Promise<void> | void

/** `browser.search` reports an unknown locus by resolving false; the wording is the alert igv.js's own locus box shows. */
async function goTo(browser: GenomeBrowser, locus: string): Promise<void> {
  if (!(await browser.search(locus))) throw new Error(`Unrecognized locus: ${locus}`)
}

/** One applier per command type: what the command does to igv.js. */
const APPLIERS: { [T in CommandType]: Applier<T> } = {
  go_to_locus: (browser, { locus }) => goTo(browser, locus),
  go_to_gene: (browser, { gene }) => goTo(browser, gene),
  zoom_in: (browser) => browser.zoomIn(),
  zoom_out: (browser) => browser.zoomOut(),
}

/**
 * The Session as it stands: what igv.js writes, plus two things it leaves out.
 * A track's height is written only when it differs from the default, and the
 * crosshairs and centre line are not written at all.
 */
export function captureSession(browser: GenomeBrowser): Session {
  const session = browser.toJSON()
  // The tracks igv.js writes to a Session, in the order it writes them: those with state to save.
  const savedTracks = browser.findTracks((track) => typeof track.getState === 'function' || Boolean(track.config))
  return {
    ...session,
    tracks: session.tracks.map((track, index) => ({ ...track, height: track.height ?? savedTracks[index]?.height })),
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
