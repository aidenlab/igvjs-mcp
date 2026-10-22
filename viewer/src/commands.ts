import type { Command, CommandAnswer, CommandOutcome, CommandType, TrackAddress, TrackHeight, TrackSelection, TrackToLoad, ViewerSettings } from './protocol.ts'
import { displayOrder, sessionLoci, sessionSummary, trackSummaries, type Session } from './session.ts'
import { shareableUrl, type SessionCompressor } from './shareableUrl.ts'
import { addressTrack, addressTracks } from './trackAddress.ts'
import { changedHeight, checkHeight } from './trackHeight.ts'

/**
 * The part of an igv.js browser the commands use. igv.js's own typings are
 * looser than its behaviour: `search` resolves with whether the locus was found.
 */
export interface GenomeBrowser extends SessionCompressor {
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
  /** Centre line. */
  doShowCenterLine?: boolean
  setCursorGuideVisibility(show: boolean): void
  setCenterLineVisibility(show: boolean): void
  /** igv.js's own buttons, each lit while what it toggles is showing. */
  navbar: {
    cursorGuideButton: NavbarButton
    centerLineButton: NavbarButton
  }
}

/** The part of the Controls the commands use. See `controls.ts`. */
export interface ViewerControls {
  showControls(shown: boolean): void
  viewerSettings(): ViewerSettings
}

interface NavbarButton {
  setState(lit: boolean): void
}

interface BrowserTrack {
  /** The name the track is shown under. */
  name?: string
  height?: number
  /** True while igv.js fits the track's height to what it holds. */
  autoHeight?: boolean
  /** The limits igv.js keeps a track within when it is dragged taller or shorter. */
  minHeight?: number
  maxHeight?: number
  /** False for the sequence track. */
  removable?: boolean
  config?: object
  getState?: () => object
  /** The track as it is drawn. */
  trackView: {
    /** `force` sets the height whatever the track's limits. */
    setTrackHeight(height: number, force?: boolean): void
    checkContentHeight(): void
    repaintViews(): void
  }
}

/** What a command does to igv.js, or to the Controls around it. One that asks for an answer returns it. */
type Applier<T extends CommandType> = (
  browser: GenomeBrowser,
  command: Extract<Command, { type: T }>,
  controls: ViewerControls,
) => Promise<CommandAnswer | void> | CommandAnswer | void

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

/**
 * igv.js's tracks as the Session summary of `session` lists them, top to
 * bottom. The Session's tracks are the saved tracks, one for one: see
 * `captureSession`.
 */
function summarizedTracks(browser: GenomeBrowser, session: Session): BrowserTrack[] {
  const saved = savedTracks(browser)
  return displayOrder(session.tracks).map((index) => saved[index])
}

function removeTrack(browser: GenomeBrowser, address: TrackAddress): void {
  const session = captureSession(browser)
  const track = summarizedTracks(browser, session)[addressTrack(trackSummaries(session), address)]
  // igv.js's own menu offers no removal of the sequence track, though its API would carry one out.
  if (track.removable === false) throw new Error('The sequence track cannot be removed.')
  browser.removeTrack(track)
}

/**
 * Gives `track` the height, as igv.js's own "Set track height" does, but for
 * `autoHeight`: igv.js 3.8 clears it on the track's view, where nothing reads it.
 */
function resize(track: BrowserTrack, height: number): void {
  // A height that was asked for is kept: igv.js stops fitting the track to what it holds,
  // and a later drag by hand starts from limits that take the height in.
  track.autoHeight = false
  if (track.minHeight !== undefined && track.minHeight > height) track.minHeight = height
  if (track.maxHeight !== undefined && track.maxHeight < height) track.maxHeight = height
  track.trackView.setTrackHeight(height, true)
  track.trackView.checkContentHeight()
  track.trackView.repaintViews()
}

function setTrackHeight(browser: GenomeBrowser, { height, ...selection }: { height: TrackHeight } & TrackSelection): void {
  // Before any track is looked at: a height that is an error is one whatever tracks it is for.
  checkHeight(height)
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  // The sequence track's height is igv.js's to set: its own menu offers none. All tracks is all the others.
  const sizable = (index: number) => summarized[index].type !== 'sequence'
  const addressed = addressTracks(summarized, selection)
  if (!selection.all && !addressed.every(sizable)) throw new Error("The sequence track's height cannot be set.")

  const tracks = summarizedTracks(browser, session)
  for (const index of addressed.filter(sizable)) {
    const track = tracks[index]
    // The height igv.js has, which the Session summary gives in whole pixels.
    resize(track, changedHeight(track.height ?? summarized[index].height, height))
  }
}

/** Whether igv.js is in its whole-genome view, which the Session summary gives as the locus "all". */
function inWholeGenomeView(browser: GenomeBrowser): boolean {
  return sessionLoci(captureSession(browser))[0] === 'all'
}

/** Shows or hides the crosshairs, as igv.js's own button does. */
function setCrosshairs(browser: GenomeBrowser, show: boolean): void {
  // igv.js's button would show them there, and igv.js turn them off again the next time it lays the view out.
  if (show && inWholeGenomeView(browser)) {
    throw new Error('The whole-genome view has no crosshairs. Go to a locus or gene first.')
  }
  browser.doShowCursorGuide = show
  browser.setCursorGuideVisibility(show)
  browser.navbar.cursorGuideButton.setState(show)
}

/** Shows or hides the centre line, as igv.js's own button does. */
function setCentreLine(browser: GenomeBrowser, show: boolean): void {
  // igv.js hides its button in the whole-genome view, and the line with it.
  if (show && inWholeGenomeView(browser)) {
    throw new Error('The whole-genome view has no centre line. Go to a locus or gene first.')
  }
  browser.doShowCenterLine = show
  browser.setCenterLineVisibility(show)
  browser.navbar.centerLineButton.setState(show)
}

/** One applier per command type. */
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
  set_crosshairs: (browser, { show }) => setCrosshairs(browser, show),
  set_centre_line: (browser, { show }) => setCentreLine(browser, show),
  // The same call as the Controls' own button.
  set_controls: (_browser, { show }, controls) => controls.showControls(show),
  // Changes nothing: the ack carries the Session summary, as every ack does.
  read_session_summary: () => {},
  // Changes nothing either.
  get_shareable_url: (browser) => ({ shareableUrl: shareableUrl(browser) }),
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

/** Applies `command` to igv.js, or to the `controls` around it. An error igv.js raises applying it becomes the outcome. */
export async function applyCommand(browser: GenomeBrowser, command: Command, controls: ViewerControls): Promise<CommandOutcome> {
  let error: string | undefined
  let answer: CommandAnswer | void = undefined
  try {
    answer = await (APPLIERS[command.type] as Applier<CommandType>)(browser, command, controls)
  } catch (raised) {
    error = raised instanceof Error ? raised.message : String(raised)
  }
  const summary = sessionSummary(captureSession(browser), controls.viewerSettings())
  return error === undefined ? { ok: true, summary, ...answer } : { ok: false, error, summary }
}
