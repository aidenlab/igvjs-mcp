import type { Browser } from 'igv'
import type { SessionSummary, SessionSummaryTrack } from './protocol.ts'

/** A track as an igv.js Session holds it. Only what this project reads is named. */
export interface SessionTrack {
  name?: string
  type?: string
  url?: string
  height?: number
  /** Display position: lower is higher up. */
  order?: number
  [key: string]: unknown
}

/**
 * The Session: what `browser.toJSON()` gives, plus what igv.js takes as
 * configuration but leaves out of its own Session: the two display toggles,
 * and track heights left at their default. Only what this project reads is
 * named.
 */
export interface Session {
  reference: { id?: string; name?: string; [key: string]: unknown }
  locus: string | string[]
  tracks: SessionTrack[]
  /** Crosshairs. */
  showCursorGuide?: boolean
  /** Centre line. */
  showCenterGuide?: boolean
  [key: string]: unknown
}

// igv.js keeps the toggles here; its type declarations do not name them.
type BrowserToggles = { doShowCursorGuide?: boolean; doShowCenterLine?: boolean }

type LiveTrack = { height?: unknown; config?: unknown; getState?: unknown }

/**
 * igv.js leaves a track's height out of its Session when it is the default for
 * that kind of track, and the defaults differ by kind. The heights are filled
 * in here from the tracks themselves, which `toJSON` walks in the same order,
 * skipping those with neither state nor config (the ruler, the ideogram).
 */
function withHeights(tracks: SessionTrack[], browser: Browser): SessionTrack[] {
  const live = (browser.findTracks(() => true) as LiveTrack[]).filter(
    (track) => typeof track.getState === 'function' || Boolean(track.config),
  )
  if (live.length !== tracks.length) return tracks // not the walk described above: state nothing rather than mismatch
  return tracks.map((track, index) => {
    const { height } = live[index]
    return track.height === undefined && typeof height === 'number' ? { ...track, height } : track
  })
}

/** The Session the Viewer is showing now. */
export function currentSession(browser: Browser): Session {
  const { doShowCursorGuide, doShowCenterLine } = browser as Browser & BrowserToggles
  const session = browser.toJSON() as unknown as Session
  return {
    ...session,
    tracks: withHeights(session.tracks, browser),
    showCursorGuide: doShowCursorGuide === true,
    showCenterGuide: doShowCenterLine === true,
  }
}

function fileName(url: string): string | undefined {
  return url.split(/[?#]/)[0].split('/').filter(Boolean).pop()
}

function summariseTrack({ name, type = 'unknown', url, height }: SessionTrack): SessionSummaryTrack {
  const file = typeof url === 'string' && url ? url : undefined
  const track: SessionSummaryTrack = { name: name || (file && fileName(file)) || type, type }
  if (file) track.url = file
  if (typeof height === 'number') track.height = height
  return track
}

/** The Session summary for `session`: a pure function of the igv.js Session. */
export function sessionSummary(session: Session): SessionSummary {
  // Stable, so tracks that share an order or have none stay as the Session lists them.
  const inDisplayOrder = [...session.tracks].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
  return {
    genome: session.reference.id || session.reference.name || 'unknown',
    loci: [session.locus].flat(),
    tracks: inDisplayOrder.map(summariseTrack),
    crosshairs: session.showCursorGuide === true,
    centreLine: session.showCenterGuide === true,
  }
}
