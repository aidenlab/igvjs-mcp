import type { Command, CommandAnswer, CommandOutcome, CommandType, TrackAddress, TrackHeight, TrackSelection, TrackToLoad, ViewerSettings } from './protocol.ts'
import { displayOrder, sessionLoci, sessionSummary, trackSummaries, type Session } from './session.ts'
import { shareableUrl, type SessionCompressor } from './shareableUrl.ts'
import { addressTrack } from './trackAddress.ts'
import { colorByAsked, colorByNote, colorByTool, type ColorByAsk } from './trackColorBy.ts'
import { colorNote, colorsAsked, colorTool, sameColor, UNSET, type ColorChange, type TrackColors } from './trackColor.ts'
import { dataRangeAsked, dataRangeNote, dataRangeTool, fixedRange, nestedArcs, type DataRange, type DataRangeAsk, type DataRangeChange } from './trackDataRange.ts'
import { displayModeAsked, displayModeNote, displayModeTool, type DisplayModeChange } from './trackDisplayMode.ts'
import { groupReadsAsked, groupReadsNote, groupReadsTool, type GroupReadsAsk } from './trackGroupReads.ts'
import { changedHeight, checkHeight, heightNote, type HeightChange } from './trackHeight.ts'
import { checkRenamable, newTrackName, renameNote } from './trackName.ts'
import { colorScaleFor, DEFAULT_GRAPH_TYPE, sameColorScale, signalStyleAsked, signalStyleNote, signalStyleTool, type ColorScale, type SignalStyleAsk, type SignalStyleChange } from './trackSignalStyle.ts'
import { partsAsked, partsNote, partsTool, type LiveParts, type PartsAsk } from './trackParts.ts'
import { joinedNotes, passedOverNote, trackTargets, type ByChange, type LiveTrack, type TrackTool } from './trackTools.ts'

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
  /** Fetches and draws every track again: what autoscales a track. */
  updateViews(): Promise<void> | void
  /** One per locus in view, side by side. */
  referenceFrameList: Array<{ bpPerPixel: number }>
  /** Tells igv.js's listeners, the Viewer's among them, of a change. */
  fireEvent(event: string, args: unknown[]): void
  /** igv.js's own buttons, each lit while what it toggles is showing. */
  navbar: {
    cursorGuideButton: NavbarButton
    centerLineButton: NavbarButton
  }
  /** igv.js's buttons that show and hide the column of sample names and of sample info beside the tracks. */
  sampleNameControl?: SampleControl
  sampleInfoControl?: SampleControl
}

interface SampleControl {
  /** Shows the column, or hides it: what igv.js's "Show Genotypes" does with a variant track's. */
  performClickWithState(browser: GenomeBrowser, show: boolean): void
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
  /** igv.js's name for the Track type, before its aliases are folded in. */
  type?: string
  /** How a wig track is drawn, such as "heatmap". */
  graphType?: string
  /** How a wig track sums the values under one pixel, such as "mean". */
  windowFunction?: string
  /** True while a wig track is drawn upside down. */
  flipAxis?: boolean
  /** A wig heatmap's color scale, which igv.js makes when it first draws one. */
  _colorScale?: { toJson(): Partial<ColorScale> }
  /** Where a wig track's values come from: its file offers the window functions listed. */
  featureSource?: { windowFunctions?: readonly string[] }
  /** The igv.js browser the track is in. */
  browser?: unknown
  /** Drops the features igv.js holds for the track, so the next draw fetches them again. */
  clearCachedFeatures?(): void
  /** A CSS color, or a function igv.js calls for each feature. */
  color?: unknown
  /** The color of a wig track's negative values and an annotation track's minus-strand features. */
  altColor?: unknown
  /** What a variant track is colored by; igv.js ends it when the track is given a color. */
  colorBy?: string
  /** The colors the track was loaded with: what igv.js's "Unset track color" and "Unset alt color" give back. */
  _initialColor?: unknown
  _initialAltColor?: unknown
  /** The range a numeric track is drawn over: an alignment track's is its coverage's. Undefined until first autoscaled. */
  dataRange?: Partial<DataRange>
  /** True while igv.js sets the range from what is in view. */
  autoscale?: boolean
  /** The autoscale group a person made by hand, its tracks autoscaled together. */
  autoscaleGroup?: string
  /** Defined on the Track types that offer igv.js's "Log scale". */
  logScale?: boolean
  /** How an interact track draws its arcs: nested, proportional, inView or partialInView. */
  arcType?: string
  /** As igv.js's own "Set data range" dialog does: a fixed range, out of autoscale and any group. */
  setDataRange?(range: DataRange): void
  /** How an annotation, variant or seg track lays out its rows, as igv.js spells it: "EXPANDED", "SQUISHED" and so on. */
  displayMode?: string
  /** Lays out a seg track's group labels again: what igv.js's own display mode menu does after a change. */
  createGroupLabels?(): void
  /** An alignment track's reads, which have the display mode, color-by and grouping: the track itself is their coverage and reads together. */
  alignmentTrack?: AlignmentReads
  /** An alignment track's coverage and reads: each drawn while true. */
  showCoverage?: boolean
  showAlignments?: boolean
  /** The height of an alignment track's coverage. */
  coverageTrackHeight?: number
  /** A variant track's genotypes: drawn while not false. */
  showGenotypes?: boolean
  /** How many samples a variant track's file has: none until its header is read. */
  getSampleCount?(): number
  /** A variant track's file header: the INFO fields it declares, by name. */
  header?: { INFO?: { [field: string]: unknown } }
  /** The ways of coloring a variant track's menu lists, by key: igv.js's "Info field..." adds the field it is given. */
  _colorByItems?: Map<string, string>
  /** An alignment track's reads, one container per locus in view: an empty array where they are not yet loaded. */
  getCachedAlignmentContainers?(): Array<{ pack?(reads: object): void } | undefined>
  /** What the track was loaded with, much of which a Session saves. */
  config?: { [field: string]: unknown }
  getState?: () => object
  /** The track as it is drawn. */
  trackView: {
    /** `force` sets the height whatever the track's limits. */
    setTrackHeight(height: number, force?: boolean): void
    checkContentHeight(): void
    repaintViews(): void
    /** Fetches what is in view, if need be, and draws the track again. */
    updateViews(): Promise<void> | void
  }
}

/** An alignment track's reads, as igv.js's AlignmentTrack keeps them. */
interface AlignmentReads {
  /** As igv.js spells it: "EXPANDED", "SQUISHED" or "FULL". */
  displayMode?: string
  /** As igv.js keys it, a read tag as "tag:HP". Undefined until the reads are first drawn. */
  colorBy?: string
  /** As igv.js keys it, a read tag as "tag:RG". Undefined for none. */
  groupBy?: string
  /** How the reads are drawn, each as igv.js's own menu checks it. */
  viewAsPairs?: boolean
  showMismatches?: boolean
  showSoftClips?: boolean
  showInsertions?: boolean
  /** The height of the reads beneath the coverage. */
  height?: number
  /** False until reads that are paired have loaded. */
  hasPairs?: boolean
  /** The read tags igv.js's "Group by" menu lists. */
  _groupByTags?: string[]
  /** A copy of the track's config, which a Session saves beside it. */
  config?: { [field: string]: unknown }
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

/** set_track_height as a track tool. The sequence track's height is igv.js's to set: its own menu offers none. */
const HEIGHT_TOOL: TrackTool = {
  refuse: ({ type }) => (type === 'sequence' ? "The sequence track's height cannot be set." : undefined),
  none: "No track's height can be set: the sequence track keeps its own.",
}

function setTrackHeight(browser: GenomeBrowser, { height, ...selection }: { height: TrackHeight } & TrackSelection): CommandAnswer | void {
  // Before any track is looked at: a height that is an error is one whatever tracks it is for.
  checkHeight(height)
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const { targets } = trackTargets(summarized, selection, HEIGHT_TOOL)

  const tracks = summarizedTracks(browser, session)
  const changes: HeightChange[] = []
  for (const index of targets) {
    const track = tracks[index]
    // The height igv.js has, which the Session summary gives in whole pixels.
    const from = track.height ?? summarized[index].height
    const to = changedHeight(from, height)
    resize(track, to)
    changes.push({ name: summarized[index].name, from, to })
  }
  const note = heightNote(height, changes)
  if (note) return { note }
}

function renameTrack(browser: GenomeBrowser, { newName, ...address }: { newName: string } & TrackAddress): CommandAnswer | void {
  // Before any track is looked at: a name that is an error is one whatever track it is for.
  const name = newTrackName(newName)
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const index = addressTrack(summarized, address)
  checkRenamable(summarized[index])

  const track = summarizedTracks(browser, session)[index]
  const from = summarized[index].name
  // As igv.js's own "Set track name" does.
  track.name = name
  // Which sets no name a Session keeps for a track loaded without one: igv.js saves its config's name.
  if (track.config) track.config.name = name
  browser.fireEvent('tracknamechange', [track])
  const note = renameNote(from, name)
  if (note) return { note }
}

/** The color `option` of `track` that `color` asks for: UNSET is the one it was loaded with, as igv.js's own "Unset" gives it back. */
function colorFor(track: BrowserTrack, option: keyof TrackColors, color: string): unknown {
  if (color !== UNSET) return color
  const loadedWith = option === 'color' ? track._initialColor : track._initialAltColor
  return loadedWith || (track.constructor as { defaultColor?: string }).defaultColor
}

/** Gives `track` the colors, as igv.js's own color picker does. */
function recolor(track: BrowserTrack, name: string, colors: TrackColors): ColorChange {
  const given = (Object.entries(colors) as Array<[keyof TrackColors, string]>).map(([option, color]) => [option, colorFor(track, option, color)] as const)
  // A variant track's color takes it out of its color-by: igv.js's color setter ends it.
  const colorByEnded = colors.color !== undefined && track.type === 'variant' && track.colorBy && track.colorBy !== 'none' ? track.colorBy : undefined
  const unchanged = colorByEnded === undefined && given.every(([option, color]) => track[option] === color || (typeof color === 'string' && sameColor(track[option], color)))

  for (const [option, color] of given) track[option] = color
  // Or a Session would bring the color-by back.
  if (colorByEnded !== undefined && track.config) track.config.colorBy = undefined
  track.trackView.repaintViews()
  return { name, unchanged, ...(colorByEnded !== undefined ? { colorByEnded } : {}) }
}

function setTrackColor(browser: GenomeBrowser, { color, altColor, ...selection }: TrackColors & TrackSelection): CommandAnswer | void {
  // Before any track is looked at: a color that is an error is one whatever tracks it is for.
  const colors = colorsAsked({ color, altColor })
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const tracks = summarizedTracks(browser, session)
  const { targets, passedOver } = trackTargets(summarized, selection, colorTool(colors, (index) => tracks[index].graphType === 'heatmap'))

  const changes = targets.map((index) => recolor(tracks[index], summarized[index].name, colors))
  const note = joinedNotes(colorNote(changes), passedOverNote(passedOver))
  if (note) return { note }
}

/** The range `track` is drawn over, or none when igv.js has not set one yet. */
function currentRange({ dataRange }: BrowserTrack): DataRange | undefined {
  const { min, max } = dataRange ?? {}
  return typeof min === 'number' && typeof max === 'number' ? { min, max } : undefined
}

/**
 * Writes `fields` into the config of `track`, which igv.js's Session saves over the track's
 * own state where its getState does not update it: without this, a reload would bring back
 * the range, autoscale or group the track was loaded with. `undefined` leaves a field out.
 */
function keepInSession(track: BrowserTrack, fields: { [field: string]: unknown }): void {
  if (track.config) Object.assign(track.config, fields)
}

/** The bounds a track may be loaded with, a qtl track's under their own names. */
const NO_BOUNDS = { min: undefined, max: undefined, minLogP: undefined, maxLogP: undefined }

/**
 * Gives `track` what `asked` asks for, as igv.js's own menu items do, with `range` the fixed
 * range it is to have, if any. Says whether the track's autoscale is now to be worked out.
 */
function setRange(track: BrowserTrack, name: string, asked: DataRangeAsk, range: DataRange | undefined, group: DataRangeChange['group']): DataRangeChange & { autoscaled: boolean } {
  const { min, max } = track.dataRange ?? {}
  const unchanged =
    (range === undefined || (!track.autoscale && !track.autoscaleGroup && min === range.min && max === range.max)) &&
    // A track in a group is autoscaled with it.
    (asked.autoscale !== true || track.autoscale === true || Boolean(track.autoscaleGroup)) &&
    (asked.logScale === undefined || track.logScale === asked.logScale)

  let autoscaled = false
  if (range) {
    track.setDataRange!(range)
    keepInSession(track, { ...NO_BOUNDS, ...range, autoscale: false, autoscaleGroup: undefined })
  } else if (asked.autoscale === true && !track.autoscale && !track.autoscaleGroup) {
    track.autoscale = true
    keepInSession(track, { ...NO_BOUNDS, autoscale: true })
    autoscaled = true
  }
  if (asked.logScale !== undefined) track.logScale = asked.logScale
  track.trackView.repaintViews()
  return { name, unchanged, autoscaled, ...(group ? { group } : {}) }
}

async function setDataRange(browser: GenomeBrowser, { min, max, autoscale, logScale, ...selection }: DataRangeAsk & TrackSelection): Promise<CommandAnswer | void> {
  // Before any track is looked at: a range that is an error is one whatever tracks it is for.
  const asked = dataRangeAsked({ min, max, autoscale, logScale })
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const tracks = summarizedTracks(browser, session)
  const drawing = (index: number) => ({
    heatmap: tracks[index].graphType === 'heatmap',
    nestedArcs: summarized[index].type === 'interact' && nestedArcs(tracks[index].arcType),
  })
  const { targets, passedOver } = trackTargets(summarized, selection, dataRangeTool(asked, drawing))
  // Every track's range before any is given: a call is all or nothing.
  const ranges = targets.map((index) => fixedRange(asked, summarized[index].name, currentRange(tracks[index])))

  // A fixed range takes a track out of the autoscale group a person made, as igv.js's own does.
  const leaving = new Set(targets.filter((index, at) => ranges[at] !== undefined && tracks[index].autoscaleGroup))
  const stillIn = (id: string) => tracks.flatMap((track, index) => (track.autoscaleGroup === id && !leaving.has(index) ? [summarized[index].name] : []))
  const changes = targets.map((index, at) => {
    const id = tracks[index].autoscaleGroup
    const group = leaving.has(index) && id ? { id, stillIn: stillIn(id) } : undefined
    return setRange(tracks[index], summarized[index].name, asked, ranges[at], group)
  })
  if (changes.some(({ autoscaled }) => autoscaled)) await browser.updateViews()

  const note = joinedNotes(dataRangeNote(asked, changes), passedOverNote(passedOver))
  if (note) return { note }
}

/** The color scale `track` is drawn with, or, before igv.js has made one, the range it would make it over. */
function currentColorScale(track: BrowserTrack): Partial<ColorScale> | undefined {
  return track._colorScale?.toJson() ?? currentRange(track)
}

/**
 * igv.js's own color scale for `scale`, as a track loaded with it gets one. igv.js exports no
 * way to make one, so a wig track of the same class is made, never shown or loaded, to make it.
 */
function igvColorScale(track: BrowserTrack, scale: ColorScale): BrowserTrack['_colorScale'] {
  const WigTrack = track.constructor as new (config: object, browser: unknown) => BrowserTrack
  return new WigTrack({ colorScale: scale, featureSource: {} }, track.browser)._colorScale
}

/** Gives `track` what `asked` asks for, as igv.js's own menu items do, with `scale` the color scale it is to have, if any. */
async function restyle(track: BrowserTrack, name: string, { graphType, windowFunction, flipAxis }: SignalStyleAsk, scale: ColorScale | undefined): Promise<SignalStyleChange> {
  const unchanged =
    (graphType === undefined || (track.graphType ?? DEFAULT_GRAPH_TYPE) === graphType) &&
    (windowFunction === undefined || track.windowFunction === windowFunction) &&
    (flipAxis === undefined || Boolean(track.flipAxis) === flipAxis) &&
    (scale === undefined || sameColorScale(track._colorScale?.toJson(), scale))

  // dynseq draws the bases fetched with the features, which features fetched for another graph type lack.
  const refetch = (windowFunction !== undefined && track.windowFunction !== windowFunction) || (graphType === 'dynseq' && track.graphType !== 'dynseq')
  if (graphType !== undefined) track.graphType = graphType
  if (windowFunction !== undefined) track.windowFunction = windowFunction
  // igv.js loads a points track with no window function in its config with none, not the one it had.
  if (track.graphType === 'points') keepInSession(track, { windowFunction: track.windowFunction })
  if (flipAxis !== undefined) track.flipAxis = flipAxis
  if (scale !== undefined) track._colorScale = igvColorScale(track, scale)
  if (refetch) {
    track.clearCachedFeatures?.()
    await track.trackView.updateViews()
  } else {
    track.trackView.repaintViews()
  }
  return { name, unchanged }
}

async function setSignalStyle(browser: GenomeBrowser, { graphType, windowFunction, flipAxis, colorScale, ...selection }: SignalStyleAsk & TrackSelection): Promise<CommandAnswer | void> {
  // Before any track is looked at: a style that is an error is one whatever tracks it is for.
  const asked = signalStyleAsked({ graphType, windowFunction, flipAxis, colorScale })
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const tracks = summarizedTracks(browser, session)
  const live = (index: number) => ({ graphType: tracks[index].graphType, windowFunctions: tracks[index].featureSource?.windowFunctions })
  const { targets, passedOver } = trackTargets(summarized, selection, signalStyleTool(asked, live))
  // Every track's color scale before any is given: a call is all or nothing.
  const scales = targets.map((index) => (asked.colorScale ? colorScaleFor(asked.colorScale, summarized[index].name, currentColorScale(tracks[index])) : undefined))

  const changes: SignalStyleChange[] = []
  for (const [at, index] of targets.entries()) changes.push(await restyle(tracks[index], summarized[index].name, asked, scales[at]))

  const finest = Math.min(...browser.referenceFrameList.map(({ bpPerPixel }) => bpPerPixel))
  const note = joinedNotes(signalStyleNote(asked, changes, finest), passedOverNote(passedOver))
  if (note) return { note }
}

/** Gives `track` the display `mode`, as igv.js's own display mode menu does. */
function redisplay(track: BrowserTrack, name: string, mode: string): DisplayModeChange {
  const igvMode = mode.toUpperCase()
  const reads = track.alignmentTrack
  let unchanged: boolean
  if (reads) {
    // As igv.js's own setDisplayMode, but for reads not yet loaded, which it would fail on: those are packed as they load.
    unchanged = reads.displayMode === igvMode
    const repack = reads.displayMode === 'FULL' || igvMode === 'FULL'
    reads.displayMode = igvMode
    if (repack) for (const container of track.getCachedAlignmentContainers?.() ?? []) container?.pack?.(reads)
  } else {
    unchanged = track.displayMode?.toUpperCase() === igvMode
    track.displayMode = igvMode
    // As igv.js's annotation and seg menus do; its variant menu does not, but the Session saves the mode either way.
    keepInSession(track, { displayMode: igvMode })
    track.createGroupLabels?.()
  }
  track.trackView.checkContentHeight()
  track.trackView.repaintViews()
  return { name, unchanged }
}

function setDisplayMode(browser: GenomeBrowser, { mode, ...selection }: { mode: string } & TrackSelection): CommandAnswer | void {
  // Before any track is looked at: a mode no Track type offers is an error whatever tracks it is for.
  const checked = displayModeAsked(mode)
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const tracks = summarizedTracks(browser, session)
  const { targets, passedOver } = trackTargets(summarized, selection, displayModeTool(checked, (index) => tracks[index].type))

  const changes = targets.map((index) => redisplay(tracks[index], summarized[index].name, checked))
  const note = joinedNotes(displayModeNote(checked, changes), passedOverNote(passedOver))
  if (note) return { note }
}

/** What the live `track` knows that its Session summary does not. */
function liveTrack(track: BrowserTrack): LiveTrack {
  const reads = track.alignmentTrack
  // Reads loaded in any locus in view: until then igv.js has not seen whether they are paired.
  const loaded = (track.getCachedAlignmentContainers?.() ?? []).some(Boolean)
  return {
    igvType: track.type,
    ...(reads && loaded ? { pairs: reads.hasPairs === true } : {}),
    ...(track.header ? { infoFields: Object.keys(track.header.INFO ?? {}) } : {}),
  }
}

/**
 * Writes `fields` into the configs of an alignment track and of its reads: igv.js's Session
 * saves both, the reads' over the track's, each where getState does not update it.
 */
function keepInReadsSession(track: BrowserTrack, reads: AlignmentReads, fields: { [field: string]: unknown }): void {
  keepInSession(track, fields)
  if (reads.config) Object.assign(reads.config, fields)
}

/** Gives `track` the color-by, as igv.js's own "Color by" menus do. */
function recolorBy(track: BrowserTrack, name: string, { by, tag }: ColorByAsk): ByChange {
  const reads = track.alignmentTrack
  let unchanged: boolean
  if (reads) {
    const colorBy = by === 'tag' ? `tag:${tag}` : by
    unchanged = reads.colorBy === colorBy
    reads.colorBy = colorBy
    // A track loaded with colorBy "tag" and a colorByTag is saved with both: a reload would read "tag:HP:HP".
    keepInReadsSession(track, reads, { colorByTag: undefined })
  } else if (track.type === 'variant') {
    // As igv.js's own menu, but none is kept as "none", where the menu keeps nothing, so the Session summary can say so.
    const colorBy = by === 'info' ? tag! : 'none'
    unchanged = (track.colorBy ?? 'none') === colorBy
    track.colorBy = colorBy
    keepInSession(track, { colorBy })
    // As igv.js's "Info field...": the menu lists the field from now on, under its own label where it has one.
    if (by === 'info' && !track._colorByItems?.has(colorBy)) track._colorByItems?.set(colorBy, colorBy)
  } else {
    // An SNP track. igv.js colors one by function whenever it loads one, so no Session keeps this.
    unchanged = track.colorBy === by
    track.colorBy = by
  }
  track.trackView.repaintViews()
  return { name, unchanged }
}

function setColorBy(browser: GenomeBrowser, { by, tag, ...selection }: ColorByAsk & TrackSelection): CommandAnswer | void {
  // Before any track is looked at: a color-by that is an error is one whatever tracks it is for.
  const asked = colorByAsked({ by, tag })
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const tracks = summarizedTracks(browser, session)
  const { targets, passedOver } = trackTargets(summarized, selection, colorByTool(asked, (index) => liveTrack(tracks[index])))

  const changes = targets.map((index) => recolorBy(tracks[index], summarized[index].name, asked))
  const note = joinedNotes(colorByNote(asked, changes), passedOverNote(passedOver))
  if (note) return { note }
}

/** Groups the reads of `track`, an alignment track, as igv.js's own "Group by" menu does. */
function regroup(track: BrowserTrack, name: string, { by, tag }: GroupReadsAsk): ByChange {
  const reads = track.alignmentTrack!
  const groupBy = by === 'none' ? undefined : by === 'tag' ? `tag:${tag}` : by
  const unchanged = reads.groupBy === groupBy
  reads.groupBy = groupBy
  // As igv.js's "tag...": the menu lists the tag from now on.
  if (tag !== undefined && reads._groupByTags && !reads._groupByTags.includes(tag)) reads._groupByTags.push(tag)
  // Or a reload would bring back the grouping the track was loaded with: none is no grouping saved.
  keepInReadsSession(track, reads, { groupBy })
  // As igv.js's repackAlignments, but for reads not yet loaded, which it would fail on: those are packed as they load.
  for (const container of track.getCachedAlignmentContainers?.() ?? []) container?.pack?.(reads)
  track.trackView.checkContentHeight()
  track.trackView.repaintViews()
  return { name, unchanged }
}

function groupReads(browser: GenomeBrowser, { by, tag, ...selection }: GroupReadsAsk & TrackSelection): CommandAnswer | void {
  // Before any track is looked at: a grouping that is an error is one whatever tracks it is for.
  const asked = groupReadsAsked({ by, tag })
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const tracks = summarizedTracks(browser, session)
  const { targets, passedOver } = trackTargets(summarized, selection, groupReadsTool(asked, (index) => liveTrack(tracks[index])))

  const changes = targets.map((index) => regroup(tracks[index], summarized[index].name, asked))
  const note = joinedNotes(groupReadsNote(asked, changes), passedOverNote(passedOver))
  if (note) return { note }
}

/** What the live `track` knows of its parts that its Session summary may not give. */
function liveParts(track: BrowserTrack): LiveParts {
  const reads = track.alignmentTrack
  if (reads) {
    const { pairs } = liveTrack(track)
    return { ...(pairs !== undefined ? { pairs } : {}), groupBy: reads.groupBy, showCoverage: track.showCoverage, showAlignments: track.showAlignments }
  }
  // A variant track has its samples once its header is read.
  return track.header && track.getSampleCount ? { samples: track.getSampleCount() } : {}
}

/** The parts of an alignment track that are its reads': the track itself has its coverage and alignments. */
const READS_PARTS = ['viewAsPairs', 'showMismatches', 'showSoftClips', 'showInsertions'] as const

/** Shows and hides the parts of `track` as `asked`, as igv.js's own menu items do. */
function reshowParts(browser: GenomeBrowser, track: BrowserTrack, name: string, asked: PartsAsk): ByChange {
  const reads = track.alignmentTrack
  let unchanged = true
  if (reads) {
    for (const part of ['showCoverage', 'showAlignments'] as const) {
      const shown = asked[part]
      if (shown === undefined) continue
      unchanged &&= track[part] === shown
      track[part] = shown
      // The reads' config is saved over the track's, and carries what the track was loaded with.
      keepInReadsSession(track, reads, { [part]: shown })
    }
    for (const part of READS_PARTS) {
      const shown = asked[part]
      if (shown === undefined) continue
      unchanged &&= (reads[part] ?? false) === shown
      reads[part] = shown
    }
    // As igv.js's "Show Coverage" and "Show Alignments": the track keeps to what it draws, unless it fits what it holds.
    if ((asked.showCoverage !== undefined || asked.showAlignments !== undefined) && !track.autoHeight) {
      track.trackView.setTrackHeight((track.showCoverage ? (track.coverageTrackHeight ?? 0) : 0) + (track.showAlignments ? (reads.height ?? 0) : 0))
    }
    // As igv.js's "View as pairs" and "Show soft clips", but for reads not yet loaded: those are packed as they load.
    if (asked.viewAsPairs !== undefined || asked.showSoftClips !== undefined) {
      for (const container of track.getCachedAlignmentContainers?.() ?? []) container?.pack?.(reads)
    }
  } else {
    const shown = asked.showGenotypes!
    unchanged = (track.showGenotypes !== false) === shown
    track.showGenotypes = shown
    // As igv.js's "Show Genotypes": the sample names and info beside the tracks are shown or hidden with them.
    browser.sampleNameControl?.performClickWithState(browser, shown)
    browser.sampleInfoControl?.performClickWithState(browser, shown)
  }
  track.trackView.checkContentHeight()
  track.trackView.repaintViews()
  return { name, unchanged }
}

function showTrackParts(browser: GenomeBrowser, { names, positions, all, ...parts }: PartsAsk & TrackSelection): CommandAnswer | void {
  // Before any track is looked at: parts that are an error are one whatever tracks they are for.
  const asked = partsAsked(parts)
  const session = captureSession(browser)
  const summarized = trackSummaries(session)
  const tracks = summarizedTracks(browser, session)
  const selection = { names, positions, all }
  const { targets, passedOver } = trackTargets(summarized, selection, partsTool(asked, (index) => liveParts(tracks[index])))

  const changes = targets.map((index) => reshowParts(browser, tracks[index], summarized[index].name, asked))
  const note = joinedNotes(partsNote(asked, changes), passedOverNote(passedOver))
  if (note) return { note }
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
  rename_track: renameTrack,
  set_track_color: setTrackColor,
  set_data_range: setDataRange,
  set_signal_style: setSignalStyle,
  set_display_mode: setDisplayMode,
  set_color_by: setColorBy,
  group_reads: groupReads,
  show_track_parts: showTrackParts,
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
