import type { SessionSummary, TrackOptions, TrackSummary, ViewerSettings } from './protocol.ts'

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
const TOOL_TRACK_OPTIONS: readonly string[] = []

/** The Track options of `track` that a track tool controls, or none when it records none. */
function trackOptions(track: SessionTrack): TrackOptions | undefined {
  const recorded = TOOL_TRACK_OPTIONS.filter((option) => track[option] !== undefined)
  return recorded.length > 0 ? Object.fromEntries(recorded.map((option) => [option, track[option]])) : undefined
}

/** The tracks of the Session summary for `session`, in display order. */
export function trackSummaries(session: Session): TrackSummary[] {
  return displayOrder(session.tracks).map((index): TrackSummary => {
    const track = session.tracks[index]
    const type = track.type ? trackType(track.type) : 'unknown'
    const options = trackOptions(track)
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
