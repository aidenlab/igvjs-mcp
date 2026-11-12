/**
 * The visibility window set_visibility_window gives a track, and the tracks it gives one to,
 * as igv.js's own "Set visibility window" does.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { VISIBILITY_WINDOW_TOOL, visibilityWindowAsked, visibilityWindowNote } from '../src/trackVisibilityWindow.ts'

describe('the visibility window of one call', () => {
  it('is a whole number of base pairs, or 0 for the whole chromosome', () => {
    expect(visibilityWindowAsked(100000)).toBe(100000)
    expect(visibilityWindowAsked(0)).toBe(0)
  })

  it.each([-1, 2.5, Number.NaN])('%s is an error', (window) => {
    expect(() => visibilityWindowAsked(window)).toThrow(`${window} is no visibility window: give a whole number of base pairs, or 0 for the whole chromosome.`)
  })
})

describe('the tracks with a visibility window', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })

  it.each(['annotation', 'variant', 'alignment'])('a %s track has one', (type) => {
    expect(VISIBILITY_WINDOW_TOOL.refuse(track(type), 0)).toBeUndefined()
  })

  it.each([
    ['wig', '"T" is a wig track: set_visibility_window sets the visibility window of annotation, variant and alignment tracks only.'],
    ['seg', '"T" is a seg track: set_visibility_window sets the visibility window of annotation, variant and alignment tracks only.'],
    ['sequence', 'The sequence track has no visibility window.'],
  ])('a %s track is an error', (type, error) => {
    expect(VISIBILITY_WINDOW_TOOL.refuse(track(type), 0)).toBe(error)
  })

  it('all with no such track is an error', () => {
    expect(VISIBILITY_WINDOW_TOOL.none).toBe('No track has a visibility window to set: only annotation, variant and alignment tracks do.')
  })
})

describe('the note on a visibility window', () => {
  const changed = (name: string) => ({ name, unchanged: false })
  const unchanged = (name: string) => ({ name, unchanged: true })

  it('is none when any track took it and the view is no wider', () => {
    expect(visibilityWindowNote(100000, [changed('A'), unchanged('B')], 50000)).toBeUndefined()
    expect(visibilityWindowNote(50000, [changed('A')], 50000)).toBeUndefined()
  })

  it('says so when every track already had it', () => {
    expect(visibilityWindowNote(100000, [unchanged('A'), unchanged('B')], 600)).toBe('"A" and "B" already had visibility window 100,000 bp, so nothing changed.')
    expect(visibilityWindowNote(0, [unchanged('A')], 600)).toBe('"A" already had visibility window 0, the whole chromosome, so nothing changed.')
  })

  it('says the track will not show until zoomed in when the window is smaller than the view', () => {
    expect(visibilityWindowNote(10000, [changed('A')], 52000)).toBe(
      '"A" shows its features only in a view of 10,000 bp or less: the view is 52,000 bp wide, so until it is zoomed in that far it shows none.',
    )
    expect(visibilityWindowNote(10000, [changed('A'), changed('B')], 52000)).toBe(
      '"A" and "B" show their features only in a view of 10,000 bp or less: the view is 52,000 bp wide, so until it is zoomed in that far they show none.',
    )
  })

  it('a whole chromosome is no smaller than any view, nor is any window smaller than the whole-genome view', () => {
    expect(visibilityWindowNote(0, [changed('A')], 52000)).toBeUndefined()
    expect(visibilityWindowNote(10000, [changed('A')], undefined)).toBeUndefined()
  })
})
