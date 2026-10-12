import type { Command, CommandOutcome, CommandType, TrackAddress, TrackHeight, TrackSelection, TrackToLoad } from './protocol.ts'
import { displayOrder, sessionSummary, type Session } from './session.ts'
import { addressTrack, addressTracks } from './trackAddress.ts'
import { changedHeight } from './trackHeight.ts'

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
  loadTrack(config: TrackToLoad): Promise<unknown>
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
  /** The limits igv.js keeps a track within when it is dragged taller or shorter. */
  minHeight?: number
  maxHeight?: number
  /** False for the sequence track. */
  removable?: boolean
  config?: object
  getState?: () => object
  /** The track as it is drawn. */
  trackView?: {
    /** True while igv.js fits the track's height to what it holds. */
    autoHeight?: boolean
    /** `force` sets the height whatever the track's limits. */
    setTrackHeight(height: number, force?: boolean): void
    checkContentHeight(): void
    repaintViews(): void
  }
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
  // The Session's tracks are the saved tracks, one for one: see `captureSession`.
  const track = savedTracks(browser)[displayOrder(session.tracks)[position]]
  // igv.js's own menu offers no removal of the sequence track, though its API would carry one out.
  if (track.removable === false) throw new Error('The sequence track cannot be removed.')
  browser.removeTrack(track)
}

/** Gives `track` the height, as igv.js's own "Set track height" does. */
function resize(track: BrowserTrack, height: number): void {
  if (!track.trackView) return
  // A height that was asked for is kept: igv.js stops fitting the track to what it holds,
  // and a later drag by hand starts from limits that take the height in.
  track.trackView.autoHeight = false
  if (track.minHeight !== undefined && track.minHeight > height) track.minHeight = height
  if (track.maxHeight !== undefined && track.maxHeight < height) track.maxHeight = height
  track.trackView.setTrackHeight(height, true)
  track.trackView.checkContentHeight()
  track.trackView.repaintViews()
}

function setTrackHeight(browser: GenomeBrowser, { height, ...selection }: { height: TrackHeight } & TrackSelection): void {
  const session = captureSession(browser)
  const summarized = sessionSummary(session).tracks
  // The sequence track's height is igv.js's to set: its own menu offers none. All tracks is all the others.
  const sizable = (position: number) => summarized[position].type !== 'sequence'
  const addressed = addressTracks(summarized, selection)
  if (!selection.all && !addressed.every(sizable)) throw new Error("The sequence track's height cannot be set.")

  // The Session's tracks are the saved tracks, one for one: see `captureSession`.
  const saved = savedTracks(browser)
  const order = displayOrder(session.tracks)
  // Every new height is worked out before any is set: a height that is an error changes no track.
  const changes = addressed.filter(sizable).map((position) => {
    const track = saved[order[position]]
    return { track, height: changedHeight(track.height ?? 0, height) }
  })
  for (const change of changes) resize(change.track, change.height)
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
  remove_track: removeTrack,
  set_track_height: setTrackHeight,
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
