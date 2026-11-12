import { aTrack, listed, type TrackTool } from './trackTools.ts'

/** What igv.js's "Unset track color" and "Unset alt color" give a track: the color it was loaded with. */
export const UNSET = 'unset'

/** A color as igv.js's color picker gives a track one: `rgb(R, G, B)`. */
function spelled([red, green, blue]: number[]): string {
  return `rgb(${red}, ${green}, ${blue})`
}

/** The red, green and blue of a color written `#RRGGBB`, `#RGB`, `rgb(R, G, B)` or igv.js's own `R,G,B`, or undefined for any other. Pure. */
function channels(color: string): number[] | undefined {
  const written = color.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(written)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]
    return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16))
  }
  const rgb = /^(?:rgb\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(\s*\))?$/i.exec(written)
  // `rgb(` and `)` together or not at all.
  if (!rgb || written.toLowerCase().startsWith('rgb(') !== (rgb[4] !== undefined)) return undefined
  const values = rgb.slice(1, 4).map(Number)
  return values.every((value) => value <= 255) ? values : undefined
}

/**
 * The color to give a track for `asked`: igv.js's spelling of it, or UNSET.
 * Pure. One that is no color is an error whose message the model is given.
 */
export function trackColor(asked: string): string {
  if (asked.trim().toLowerCase() === UNSET) return UNSET
  const rgb = channels(asked)
  if (!rgb) {
    throw new Error(
      `"${asked}" is not a color igv-bot takes. Give one as "#RRGGBB", such as "#1f77b4", or as "rgb(R, G, B)" with each from 0 to 255, or "unset" for the color the track was loaded with.`,
    )
  }
  return spelled(rgb)
}

/** Whether a track's color `current`, as igv.js has it, is the color `color`. Pure. A color igv-bot cannot read, such as a CSS name, is no color it gives. */
export function sameColor(current: unknown, color: string): boolean {
  if (typeof current !== 'string') return false
  const rgb = channels(current)
  return rgb !== undefined && spelled(rgb) === color
}

/** The colors one set_track_color call gives: a track color, an alt color, or both. */
export interface TrackColors {
  color?: string
  altColor?: string
}

/**
 * The colors of a call, each as `trackColor` gives it. Pure. Before any track
 * is looked at: a color that is an error is one whatever tracks it is for.
 */
export function colorsAsked({ color, altColor }: TrackColors): TrackColors {
  if (color === undefined && altColor === undefined) throw new Error('Give a color, an altColor, or both.')
  return {
    ...(color !== undefined ? { color: trackColor(color) } : {}),
    ...(altColor !== undefined ? { altColor: trackColor(altColor) } : {}),
  }
}

/**
 * The Track types igv.js's menu offers "Set track color" on (`colorPickerTrackTypeSet`), as
 * canonical names. The others read a color, if at all, only from the config they are loaded with.
 */
const COLORED_TYPES: ReadonlySet<string> = new Set(['annotation', 'alignment', 'variant', 'wig', 'interact', 'shoebox'])

/** The Track types igv.js's menu offers "Set alt color" on: for a wig track's negative values, an annotation track's minus-strand features. */
const ALT_COLORED_TYPES: ReadonlySet<string> = new Set(['wig', 'annotation'])

const ONLY_ALT_COLORED = 'only wig and annotation tracks have one.'

/**
 * set_track_color as a track tool: the tracks that take every color of `colors`, as
 * igv.js's own color menu items offer them. Pure. `heatmap` says whether the track
 * at an index is a wig track drawn as a heatmap, which igv.js offers no color.
 */
export function colorTool(colors: TrackColors, heatmap: (index: number) => boolean): TrackTool {
  return {
    refuse: ({ name, type }, index) => {
      if (type === 'sequence') return "The sequence track's color cannot be set."
      if (!COLORED_TYPES.has(type)) return `"${name}" is ${aTrack(type)}, which igv.js gives no track color.`
      if (heatmap(index)) return `"${name}" is drawn as a heatmap, whose colors are set by set_signal_style's colorScale.`
      if (colors.altColor !== undefined && !ALT_COLORED_TYPES.has(type)) return `"${name}" is ${aTrack(type)}, which has no alt color: ${ONLY_ALT_COLORED}`
      return undefined
    },
    none: colors.altColor !== undefined ? `No track takes an alt color: ${ONLY_ALT_COLORED}` : 'No track takes a color.',
  }
}

/** What a color change did to one track, named as the Session summary names it. */
export interface ColorChange {
  name: string
  /** True when the track already had every color asked for. */
  unchanged: boolean
  /** The attribute a variant track was colored by until igv.js's color took it out of it. */
  colorByEnded?: string
}

/**
 * The note for a reply when colors were given other than as asked (ADR 0006): a
 * variant track's color-by ended, or every track already had the colors, so nothing
 * changed. Pure. Undefined when every track took the colors as asked.
 */
export function colorNote(changes: ColorChange[]): string | undefined {
  if (changes.length > 0 && changes.every(({ unchanged }) => unchanged)) {
    return `${listed(changes.map(({ name }) => name))} already had that color, so nothing changed.`
  }
  const ended = changes.flatMap(({ name, colorByEnded }) =>
    colorByEnded === undefined ? [] : [`"${name}" is no longer colored by ${colorByEnded}: it is drawn in the color asked for.`],
  )
  return ended.length > 0 ? ended.join(' ') : undefined
}
