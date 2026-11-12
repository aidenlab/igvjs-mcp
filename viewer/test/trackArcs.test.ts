/**
 * How set_arcs draws an interact track's arcs, and the tracks it draws them on, as igv.js's
 * own interact track menu does.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { arcsAsked, arcsNote, arcsTool, type LiveArcs } from '../src/trackArcs.ts'

describe('the arcs of one call', () => {
  it('are any of arcType, arcOrientation, thickness, alpha and useScore', () => {
    expect(arcsAsked({ arcType: 'proportional', arcOrientation: 'down', thickness: 2, alpha: 0.5, useScore: true })).toEqual({
      arcType: 'proportional',
      arcOrientation: 'down',
      thickness: 2,
      alpha: 0.5,
      useScore: true,
    })
    expect(arcsAsked({ alpha: 0 })).toEqual({ alpha: 0 })
    expect(arcsAsked({ useScore: false })).toEqual({ useScore: false })
  })

  it('none of them is an error', () => {
    expect(() => arcsAsked({})).toThrow('Give arcType, arcOrientation, thickness, alpha or useScore, or several of them.')
  })

  it.each([
    [{ arcType: 'chiapet' }, '"chiapet" is no arc type: give nested, proportional, inView or partialInView.'],
    [{ arcOrientation: 'left' }, '"left" is no arc orientation: give up or down.'],
    [{ thickness: 0 }, '0 is no thickness: give a number of pixels above 0.'],
    [{ thickness: Number.NaN }, 'NaN is no thickness: give a number of pixels above 0.'],
    [{ alpha: 1.5 }, '1.5 is no alpha: give a number from 0, clear, to 1, opaque.'],
    [{ alpha: -0.1 }, '-0.1 is no alpha: give a number from 0, clear, to 1, opaque.'],
  ])('%o is an error', (asked, error) => {
    expect(() => arcsAsked(asked)).toThrow(error)
  })
})

describe('the tracks with arcs', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 250 })
  const tool = (asked: object, live: LiveArcs = { hic: false }) => arcsTool(asked, () => live)

  it('an interact track takes every one', () => {
    expect(tool({ arcType: 'proportional', arcOrientation: 'down', thickness: 2, alpha: 0.5, useScore: true }).refuse(track('interact'), 0)).toBeUndefined()
  })

  it.each([
    ['wig', '"T" is a wig track, which has no arcs: only interact tracks have them.'],
    ['annotation', '"T" is an annotation track, which has no arcs: only interact tracks have them.'],
    ['sequence', 'The sequence track has no arcs.'],
  ])('a %s track is an error', (type, error) => {
    expect(tool({ thickness: 2 }).refuse(track(type), 0)).toBe(error)
  })

  it('an interact track read from a .hic file takes only arcOrientation and thickness, as igv.js\'s menu offers', () => {
    const hic: LiveArcs = { hic: true }
    expect(tool({ arcOrientation: 'down', thickness: 2 }, hic).refuse(track('interact'), 0)).toBeUndefined()
    expect(tool({ thickness: 2, alpha: 0.5 }, hic).refuse(track('interact'), 0)).toBe(
      '"T" is read from a .hic file, whose arcs igv.js shades by their scores itself: it takes only arcOrientation and thickness, not alpha.',
    )
    expect(tool({ arcType: 'proportional', useScore: false }, hic).refuse(track('interact'), 0)).toBe(
      '"T" is read from a .hic file, whose arcs igv.js shades by their scores itself: it takes only arcOrientation and thickness, not arcType or useScore.',
    )
  })

  it('an interact track whose features have no scores cannot draw its arcs proportional or by score', () => {
    const unscored: LiveArcs = { hic: false, scored: false }
    expect(tool({ arcType: 'nested', useScore: false, thickness: 2 }, unscored).refuse(track('interact'), 0)).toBeUndefined()
    expect(tool({ arcType: 'inView' }, unscored).refuse(track('interact'), 0)).toBe('"T" has no scores, which inView arcs are drawn to the height of: its arcs can only be nested.')
    expect(tool({ useScore: true }, unscored).refuse(track('interact'), 0)).toBe('"T" has no scores to shade its arcs by.')
  })

  it('an interact track whose features are not yet loaded takes them all', () => {
    expect(tool({ arcType: 'proportional', useScore: true }, { hic: false, scored: undefined }).refuse(track('interact'), 0)).toBeUndefined()
  })

  it('all with no interact track is an error', () => {
    expect(tool({ thickness: 2 }).none).toBe('No track has arcs: only interact tracks do.')
  })
})

describe('the note on arcs', () => {
  const changed = (name: string) => ({ name, unchanged: false })
  const unchanged = (name: string) => ({ name, unchanged: true })

  it('is none when any track changed', () => {
    expect(arcsNote({ thickness: 2 }, [changed('A'), unchanged('B')])).toBeUndefined()
  })

  it('says so when every track already had the arcs as asked', () => {
    expect(arcsNote({ arcType: 'proportional', thickness: 2 }, [unchanged('Loops')])).toBe('"Loops" already had arc type proportional and thickness 2, so nothing changed.')
    expect(arcsNote({ arcOrientation: 'down', alpha: 0.1, useScore: false }, [unchanged('A'), unchanged('B')])).toBe(
      '"A" and "B" already had arcs drawn down, alpha 0.1 and arcs not shaded by score, so nothing changed.',
    )
    expect(arcsNote({ useScore: true }, [unchanged('A')])).toBe('"A" already had arcs shaded by score, so nothing changed.')
  })
})
