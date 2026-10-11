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
 * The Session: what `browser.toJSON()` gives, plus the two display toggles,
 * which igv.js takes as configuration but leaves out of its own Session. Only
 * what this project reads is named.
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

/** The Session the Viewer is showing now. */
export function currentSession(browser: Browser): Session {
  const { doShowCursorGuide, doShowCenterLine } = browser as Browser & BrowserToggles
  return {
    ...(browser.toJSON() as unknown as Session),
    showCursorGuide: doShowCursorGuide === true,
    showCenterGuide: doShowCenterLine === true,
  }
}

/** The height igv.js gives a track whose Session entry states none. */
const DEFAULT_TRACK_HEIGHT = 50

function fileName(url: string): string | undefined {
  return url.split(/[?#]/)[0].split('/').filter(Boolean).pop()
}

function summariseTrack({ name, type = 'unknown', url, height }: SessionTrack): SessionSummaryTrack {
  const track: SessionSummaryTrack = { name: name || (url && fileName(url)) || type, type }
  if (url) track.url = url
  // igv.js sizes the reference sequence itself and does not say how tall.
  if (type !== 'sequence') track.height = height ?? DEFAULT_TRACK_HEIGHT
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
