/**
 * The display mode set_display_mode gives a track, and the tracks it gives one to,
 * as igv.js's own "Collapse", "Squish", "Expand", "full" and "Fill" do.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { displayModeAsked, displayModeNote, displayModeTool } from '../src/trackDisplayMode.ts'

describe('the display mode of one call', () => {
  it('is one igv.js offers on some Track type', () => {
    expect(displayModeAsked('squished')).toBe('squished')
    expect(displayModeAsked('full')).toBe('full')
  })

  it('a mode igv.js offers on no Track type is an error naming those it does', () => {
    expect(() => displayModeAsked('dense')).toThrow('"dense" is no display mode: give collapsed, squished, expanded, full or fill.')
  })
})

describe('the tracks that offer a display mode', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })
  /** igv.js's own name for the Track type of every track: a seg track's may be mut. */
  const igvType = (type: string) => () => type

  it.each([
    ['annotation', ['collapsed', 'squished', 'expanded']],
    ['variant', ['collapsed', 'squished', 'expanded']],
    ['alignment', ['expanded', 'squished', 'full']],
    ['seg', ['squished', 'expanded', 'fill']],
  ])("a %s track offers those of igv.js's menu", (type, modes) => {
    for (const mode of modes) expect(displayModeTool(mode, igvType(type)).refuse(track(type), 0)).toBeUndefined()
  })

  it('a mode the Track type does not offer is an error naming those it does', () => {
    expect(displayModeTool('full', igvType('annotation')).refuse(track('annotation'), 0)).toBe(
      '"T" is an annotation track, which offers display modes collapsed, squished and expanded, not full.',
    )
    expect(displayModeTool('collapsed', igvType('alignment')).refuse(track('alignment'), 0)).toBe(
      '"T" is an alignment track, which offers display modes expanded, squished and full, not collapsed.',
    )
  })

  it('fill is for seg proper, not a seg track of mutations', () => {
    expect(displayModeTool('fill', igvType('mut')).refuse(track('seg'), 0)).toBe(
      '"T" is a seg track of mutations, which offers display modes squished and expanded, not fill.',
    )
    expect(displayModeTool('squished', igvType('mut')).refuse(track('seg'), 0)).toBeUndefined()
  })

  it("a wig track has none: how it is drawn is set_signal_style's graphType", () => {
    expect(displayModeTool('expanded', igvType('wig')).refuse(track('wig'), 0)).toBe(
      '"T" is a wig track, which has no display mode: how it is drawn is set by set_signal_style\'s graphType.',
    )
  })

  it.each([
    ['interact', '"T" is an interact track, which has no display mode: only annotation, variant, alignment and seg tracks have one.'],
    ['sequence', 'The sequence track has no display mode.'],
  ])('a %s track has none', (type, error) => {
    expect(displayModeTool('expanded', igvType(type)).refuse(track(type), 0)).toBe(error)
  })

  it('all with no track that offers the mode is an error', () => {
    expect(displayModeTool('full', igvType('annotation')).none).toBe('No track offers display mode full: only alignment tracks do.')
    expect(displayModeTool('squished', igvType('wig')).none).toBe('No track offers display mode squished: only annotation, variant, alignment and seg tracks do.')
  })
})

describe('the note on a display mode', () => {
  it('is none when any track took it', () => {
    expect(displayModeNote('squished', [{ name: 'A', unchanged: false }, { name: 'B', unchanged: true }])).toBeUndefined()
  })

  it('says so when every track already had it', () => {
    expect(displayModeNote('squished', [{ name: 'A', unchanged: true }, { name: 'B', unchanged: true }])).toBe(
      '"A" and "B" already had display mode squished, so nothing changed.',
    )
  })
})
