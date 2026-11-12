/**
 * The colors set_track_color gives a track, and the tracks it gives them to,
 * as igv.js's own color menu items do.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { colorNote, colorsAsked, colorTool, trackColor } from '../src/trackColor.ts'

describe('a color asked for', () => {
  it.each([
    ['#1f77b4', 'rgb(31, 119, 180)'],
    ['#1F77B4', 'rgb(31, 119, 180)'],
    ['#f06', 'rgb(255, 0, 102)'],
    ['rgb(31,119,180)', 'rgb(31, 119, 180)'],
    [' rgb( 0, 0, 150 ) ', 'rgb(0, 0, 150)'],
    ['31,119,180', 'rgb(31, 119, 180)'],
  ])('%s is given to a track as igv.js spells a color its picker gives: %s', (asked, expected) => {
    expect(trackColor(asked)).toBe(expected)
  })

  it('"unset" is igv.js\'s Unset track color', () => {
    expect(trackColor('unset')).toBe('unset')
  })

  it.each(['red', '#12345', 'rgb(256, 0, 0)', 'rgb(1.5, 0, 0)', 'rgba(0, 0, 0, 0.5)', 'hsl(0, 100%, 50%)', ''])('%s is no color: the error gives the forms one takes', (asked) => {
    expect(() => trackColor(asked)).toThrow(
      `"${asked}" is not a color igv-bot takes. Give one as "#RRGGBB", such as "#1f77b4", or as "rgb(R, G, B)" with each from 0 to 255, or "unset" for the color the track was loaded with.`,
    )
  })
})

describe('the colors of one call', () => {
  it('are each given as igv.js spells it', () => {
    expect(colorsAsked({ color: '#f06', altColor: 'unset' })).toEqual({ color: 'rgb(255, 0, 102)', altColor: 'unset' })
    expect(colorsAsked({ altColor: 'rgb(0,0,255)' })).toEqual({ altColor: 'rgb(0, 0, 255)' })
  })

  it('must be one at least', () => {
    expect(() => colorsAsked({})).toThrow('Give a color, an altColor, or both.')
  })

  it('a color that is no color is the error, whichever it is', () => {
    expect(() => colorsAsked({ color: '#f06', altColor: 'blue' })).toThrow(/^"blue" is not a color igv-bot takes\./)
  })
})

describe('the tracks that take a color', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })
  const drawnAsLines = () => false

  it.each(['annotation', 'alignment', 'variant', 'wig', 'interact', 'shoebox'])('a %s track takes a color, as igv.js offers in its menu', (type) => {
    expect(colorTool({ color: 'rgb(0, 0, 0)' }, drawnAsLines).refuse(track(type), 0)).toBeUndefined()
  })

  it.each([
    ['seg', '"T" is a seg track, which igv.js gives no track color.'],
    ['junction', '"T" is a junction track, which igv.js gives no track color.'],
    ['gwas', '"T" is a gwas track, which igv.js gives no track color.'],
    ['sequence', "The sequence track's color cannot be set."],
  ])('a %s track does not', (type, error) => {
    expect(colorTool({ color: 'rgb(0, 0, 0)' }, drawnAsLines).refuse(track(type), 0)).toBe(error)
  })

  it.each(['wig', 'annotation'])('a %s track takes an alt color', (type) => {
    expect(colorTool({ altColor: 'rgb(0, 0, 0)' }, drawnAsLines).refuse(track(type), 0)).toBeUndefined()
  })

  it.each([
    ['alignment', '"T" is an alignment track, which has no alt color: only wig and annotation tracks have one.'],
    ['variant', '"T" is a variant track, which has no alt color: only wig and annotation tracks have one.'],
  ])('a %s track does not', (type, error) => {
    expect(colorTool({ color: 'rgb(0, 0, 0)', altColor: 'rgb(0, 0, 0)' }, drawnAsLines).refuse(track(type), 0)).toBe(error)
  })

  it("a wig track drawn as a heatmap takes neither: its colors are set_signal_style's colorScale", () => {
    const heatmap = (index: number) => index === 3
    const error = '"T" is drawn as a heatmap, whose colors are set by set_signal_style\'s colorScale.'

    expect(colorTool({ color: 'rgb(0, 0, 0)' }, heatmap).refuse(track('wig'), 3)).toBe(error)
    expect(colorTool({ altColor: 'rgb(0, 0, 0)' }, heatmap).refuse(track('wig'), 3)).toBe(error)
    expect(colorTool({ color: 'rgb(0, 0, 0)' }, heatmap).refuse(track('wig'), 2)).toBeUndefined()
  })

  it('all with no track that takes the colors is an error', () => {
    expect(colorTool({ color: 'rgb(0, 0, 0)' }, drawnAsLines).none).toBe('No track takes a color.')
    expect(colorTool({ altColor: 'rgb(0, 0, 0)' }, drawnAsLines).none).toBe('No track takes an alt color: only wig and annotation tracks have one.')
  })
})

describe('the note when colors were given other than as asked', () => {
  it('none when a track took a color it did not have', () => {
    expect(colorNote([{ name: 'Conservation', unchanged: false }, { name: 'Refseq All', unchanged: true }])).toBeUndefined()
  })

  it('every track already had the colors, so nothing changed', () => {
    expect(colorNote([{ name: 'Conservation', unchanged: true }])).toBe('"Conservation" already had that color, so nothing changed.')
    expect(colorNote([{ name: 'Conservation', unchanged: true }, { name: 'Refseq All', unchanged: true }])).toBe(
      '"Conservation" and "Refseq All" already had that color, so nothing changed.',
    )
  })

  it("a variant track colored by an attribute is no longer: igv.js's color takes the track out of it", () => {
    expect(colorNote([{ name: 'Variants', unchanged: false, colorByEnded: 'AF' }, { name: 'Conservation', unchanged: false }])).toBe(
      '"Variants" is no longer colored by AF: it is drawn in the color asked for.',
    )
  })
})
