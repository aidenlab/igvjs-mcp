/** The part of an igv.js browser that announces changes. */
export interface ChangeSource {
  on(event: string, listener: () => void): void
}

/**
 * The igv.js events after which the Session may differ. igv.js fires
 * them whoever made the change: a person in the browser, or a command.
 */
const CHANGE_EVENTS = ['locuschange', 'trackremoved', 'trackorderchanged', 'trackheightchange', 'tracknamechange', 'genomechange']

/** How long igv.js must be quiet before a change is reported. A drag fires `locuschange` on every frame. */
export const QUIET_MS = 250

/**
 * Reports what `read` gives now, and again each time igv.js changes and then
 * stays quiet for `QUIET_MS`: a burst of changes is reported once, at its end.
 * Some changes igv.js does not announce, such as its crosshairs button: call
 * the function returned when one may have happened.
 */
export function watchChanges<T>(source: ChangeSource, read: () => T, report: (current: T) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const changed = () => {
    clearTimeout(timer)
    timer = setTimeout(() => report(read()), QUIET_MS)
  }
  for (const event of CHANGE_EVENTS) source.on(event, changed)
  report(read())
  return changed
}
