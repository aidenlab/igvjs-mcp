import { aTrack, either, listed, type ByChange, type TrackTool } from './trackTools.ts'

/** The Track types set_visibility_window sets the window of, as the Session summary names them. */
const WITH_VISIBILITY_WINDOW: readonly string[] = ['annotation', 'variant', 'alignment']

/**
 * The visibility window of a call, checked. Pure. Before any track is looked at: a window
 * that is an error is one whatever tracks it is for. 0 is no window, as igv.js's own
 * "Set visibility window" takes it: the whole chromosome for annotation and variant tracks.
 */
export function visibilityWindowAsked(window: number): number {
  if (!Number.isInteger(window) || window < 0) {
    throw new Error(`${window} is no visibility window: give a whole number of base pairs, or 0 for no window.`)
  }
  return window
}

/**
 * set_visibility_window as a track tool: annotation, variant and alignment tracks. igv.js's own
 * menu offers a window on a few more Track types, wig among them, where it matters little.
 */
export const VISIBILITY_WINDOW_TOOL: TrackTool = {
  refuse: ({ name, type }) => {
    if (type === 'sequence') return 'The sequence track has no visibility window.'
    if (WITH_VISIBILITY_WINDOW.includes(type)) return undefined
    return `"${name}" is ${aTrack(type)}: set_visibility_window sets the visibility window of ${either(WITH_VISIBILITY_WINDOW, 'and')} tracks only.`
  },
  none: `No track has a visibility window to set: only ${either(WITH_VISIBILITY_WINDOW, 'and')} tracks do.`,
}

/** "52,000 bp". */
function bp(length: number): string {
  return `${length.toLocaleString('en-US')} bp`
}

/**
 * The notes for a reply (ADR 0006): every track already had `window`, so nothing changed; or
 * the window is smaller than the view, `widest` bp being the widest locus in view (undefined in
 * the whole-genome view, where no window applies), so the tracks show nothing until it is
 * zoomed in. Pure. Undefined when there is nothing to say.
 */
export function visibilityWindowNote(window: number, changes: ByChange[], widest: number | undefined): string | undefined {
  if (changes.length === 0) return undefined
  const names = listed(changes.map(({ name }) => name))
  const notes: string[] = []
  if (changes.every(({ unchanged }) => unchanged)) {
    notes.push(`${names} already had visibility window ${window === 0 ? '0, no window' : bp(window)}, so nothing changed.`)
  }
  // As igv.js's own test: a track draws nothing where the view is wider than its window.
  if (window > 0 && widest !== undefined && widest > window) {
    const one = changes.length === 1
    notes.push(
      `${names} ${one ? 'shows its' : 'show their'} features only in a view of ${bp(window)} or less: the view is ${bp(Math.round(widest))} wide, so until it is zoomed in that far ${one ? 'it shows' : 'they show'} none.`,
    )
  }
  return notes.length > 0 ? notes.join(' ') : undefined
}
