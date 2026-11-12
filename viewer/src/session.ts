import { ALIGNMENT_PARTS, TRACK_PARTS, VARIANT_PARTS, type SessionSummary, type TrackOptions, type TrackSummary, type ViewerSettings } from './protocol.ts'

/** One track of a Session: the fields the Session summary reads. igv.js writes many more. */
export interface SessionTrack {
  name?: string
  type?: string
  url?: string
  height?: number
  /** Display position: lower is higher up. */
  order?: number
  /** Track options and the rest of the track's saved state. */
  [field: string]: unknown
}

/**
 * The Session as igv.js writes it (`browser.toJSON()`): the fields the Session
 * summary reads. See `captureSession` for what the Viewer adds.
 */
export interface Session {
  reference: { id?: string; name?: string }
  /** One locus, or several when the view is split. */
  locus: string | string[]
  tracks: SessionTrack[]
  /** Crosshairs. */
  showCursorGuide?: boolean
  /** Centre line. */
  showCenterGuide?: boolean
}

/** The tracks of a Session in display order, top to bottom, each as its index in `tracks`. */
export function displayOrder(tracks: SessionTrack[]): number[] {
  return tracks
    .map((track, index) => ({ order: track.order ?? 0, index }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ index }) => index)
}

/**
 * igv.js's aliases for its Track types, each with the canonical name it is folded into. The aliases
 * are read from igv.js's track factory (`getTrack` and `trackFunctions`). For feature tracks the
 * name is `annotation`, the type igv.js infers from a file, though the factory keys them `feature`.
 * igv.js's own menus treat the aliases inconsistently (ADR 0005).
 */
const TRACK_TYPE_ALIASES: Readonly<Record<string, string>> = {
  feature: 'annotation',
  genes: 'annotation',
  snp: 'annotation',
  fusionjuncspan: 'annotation',
  interaction: 'interact',
  maf: 'seg',
  mut: 'seg',
  eqtl: 'qtl',
  junctions: 'junction',
  splicejunctions: 'junction',
}

/** The Track type of `type` as igv.js names a track: its canonical name, with aliases folded in. */
function trackType(type: string): string {
  return Object.hasOwn(TRACK_TYPE_ALIASES, type) ? TRACK_TYPE_ALIASES[type] : type
}

/**
 * The Track options a track tool controls, by igv.js's name for each. A track's saved state
 * (`getState()`) records its config plus the options that differ from their defaults, so a
 * track carries only the ones set on it. Grows as each track tool lands; height is not here,
 * as every track summary gives it.
 */
const TOOL_TRACK_OPTIONS: readonly string[] = ['color', 'altColor', 'min', 'max', 'autoscale', 'logScale', 'graphType', 'windowFunction', 'flipAxis', 'colorScale', 'displayMode', 'colorBy', 'groupBy', ...TRACK_PARTS]

/**
 * A color-by or grouping as set_color_by and group_reads take it, `option` naming it: igv.js
 * saves "tag:HP" for a read tag, and a variant track's INFO field bare. Any other value, such
 * as a grouping made by hand at a base, is given as igv.js saves it.
 */
function byOption(option: 'colorBy' | 'groupBy', value: string, type: string): TrackOptions {
  if (value.startsWith('tag:')) return { [option]: 'tag', [`${option}Tag`]: value.slice(4) }
  if (option === 'colorBy' && type === 'variant' && value !== 'none') return { colorBy: 'info', colorByTag: value }
  return { [option]: value }
}

/**
 * A Track option as the Session summary gives it, as an object of one or two fields: a display
 * mode in lower case, as set_display_mode takes it, not as igv.js saves it; a color-by or grouping
 * as `byOption` gives it.
 */
function optionFields(option: string, value: unknown, type: string): TrackOptions {
  if (typeof value !== 'string') return { [option]: value }
  if (option === 'displayMode') return { displayMode: value.toLowerCase() }
  if (option === 'colorBy' || option === 'groupBy') return byOption(option, value, type)
  return { [option]: value }
}

/**
 * The igv.js Track types, before aliases are folded, whose colorBy and groupBy are set_color_by's
 * and group_reads': a plain annotation track's colorBy names a feature attribute, a seg track's
 * groupBy a sample attribute, and no tool sets those. The parts show_track_parts shows or hides
 * are those of alignment and variant tracks only, whatever else a track was loaded with.
 */
const SET_BY_TOOL: Readonly<Record<string, readonly string[]>> = {
  colorBy: ['alignment', 'variant', 'snp'],
  groupBy: ['alignment'],
  ...Object.fromEntries(ALIGNMENT_PARTS.map((part) => [part, ['alignment']])),
  ...Object.fromEntries(VARIANT_PARTS.map((part) => [part, ['variant']])),
}

/** Whether `option` of a track of igv.js's Track type `igvType` is one a track tool sets. */
function toolSets(option: string, igvType: string | undefined): boolean {
  return !Object.hasOwn(SET_BY_TOOL, option) || (igvType !== undefined && SET_BY_TOOL[option].includes(igvType))
}

/** The Track options of `track`, of Track type `type`, that a track tool controls, or none when it records none. */
function trackOptions(track: SessionTrack, type: string): TrackOptions | undefined {
  const recorded = TOOL_TRACK_OPTIONS.filter((option) => track[option] !== undefined && toolSets(option, track.type))
  return recorded.length > 0 ? Object.assign({}, ...recorded.map((option) => optionFields(option, track[option], type))) : undefined
}

/** The tracks of the Session summary for `session`, in display order. */
export function trackSummaries(session: Session): TrackSummary[] {
  return displayOrder(session.tracks).map((index): TrackSummary => {
    const track = session.tracks[index]
    const type = track.type ? trackType(track.type) : 'unknown'
    const options = trackOptions(track, type)
    return {
      name: track.name || type,
      type,
      ...(track.url ? { url: track.url } : {}),
      height: Math.round(track.height ?? 0),
      ...(options ? { options } : {}),
    }
  })
}

/** The loci of `session`: one, or several when the view is split. */
export function sessionLoci(session: Session): string[] {
  return [session.locus].flat()
}

/** The Session summary for `session` and `viewerSettings`. Pure: the same two always give the same summary. */
export function sessionSummary(session: Session, viewerSettings: ViewerSettings): SessionSummary {
  return {
    genome: session.reference.id ?? session.reference.name ?? 'unknown',
    loci: sessionLoci(session),
    tracks: trackSummaries(session),
    crosshairs: session.showCursorGuide === true,
    centreLine: session.showCenterGuide === true,
    controls: viewerSettings.controls,
  }
}
