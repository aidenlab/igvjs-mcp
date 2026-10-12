import type { SessionSummary, TrackSummary } from './protocol.ts'

/** One track of a Session: the fields the Session summary reads. igv.js writes many more. */
export interface SessionTrack {
  name?: string
  type?: string
  url?: string
  height?: number
  /** Display position: lower is higher up. */
  order?: number
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

/** The Session summary for `session`. Pure: the same Session always gives the same summary. */
export function sessionSummary(session: Session): SessionSummary {
  const tracks = displayOrder(session.tracks).map((index): TrackSummary => {
    const track = session.tracks[index]
    const type = track.type ?? 'unknown'
    return { name: track.name || type, type, ...(track.url ? { url: track.url } : {}), height: track.height ?? 0 }
  })

  return {
    genome: session.reference.id ?? session.reference.name ?? 'unknown',
    loci: [session.locus].flat(),
    tracks,
    crosshairs: session.showCursorGuide === true,
    centreLine: session.showCenterGuide === true,
  }
}
