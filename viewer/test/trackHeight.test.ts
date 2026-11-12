/**
 * The height a track is given: an absolute number of pixels, or taller or
 * shorter than it is.
 */
import { describe, it, expect } from 'vitest'
import { changedHeight, checkHeight, heightNote } from '../src/trackHeight.ts'

describe('an absolute height', () => {
  it.each([
    [50, 120, 120],
    [120, 50, 50],
    [50, 1, 1],
    [50, 1000, 1000],
    [50, 37.5, 37.5],
  ])('a track %d pixels high set to %d is %d pixels high', (current, height, expected) => {
    expect(changedHeight(current, height)).toBe(expected)
  })

  it.each([0, -10, 1001, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('%d is no height: the error gives the limits', (height) => {
    const error = `A track cannot be ${height} pixels high. Give a height from 1 to 1000 pixels, or "taller" or "shorter".`

    expect(() => changedHeight(50, height)).toThrow(error)
    // The same error with no track to give the height to.
    expect(() => checkHeight(height)).toThrow(error)
  })

  it.each([1, 120, 1000, 'taller', 'shorter'] as const)('%s is a height a track can be given', (height) => {
    expect(() => checkHeight(height)).not.toThrow()
  })
})

describe('"taller" and "shorter"', () => {
  it.each([
    [50, 75],
    [70, 105],
    [100, 150],
    [25, 37.5],
  ])('taller makes a track of %d pixels %d: half as high again', (current, expected) => {
    expect(changedHeight(current, 'taller')).toBe(expected)
  })

  it.each([
    [75, 50],
    [105, 70],
    [150, 100],
    [300, 200],
  ])('shorter makes a track of %d pixels %d: two thirds as high', (current, expected) => {
    expect(changedHeight(current, 'shorter')).toBe(expected)
  })

  it('shorter leaves a part of a pixel when two thirds is not a whole number', () => {
    expect(changedHeight(50, 'shorter')).toBeCloseTo(33.333, 3)
  })

  it.each([25, 40, 50, 70, 100, 115, 333, 500])('taller then shorter gives a track of %d pixels its height back, exactly', (height) => {
    expect(changedHeight(changedHeight(height, 'taller'), 'shorter')).toBe(height)
  })

  it.each([25, 40, 50, 70, 100, 115, 333, 500])('shorter then taller gives a track of %d pixels its height back, exactly', (height) => {
    expect(changedHeight(changedHeight(height, 'shorter'), 'taller')).toBe(height)
  })

  it('five times shorter then five times taller is back where it began', () => {
    let height = 70
    for (let i = 0; i < 5; i++) height = changedHeight(height, 'shorter')
    for (let i = 0; i < 5; i++) height = changedHeight(height, 'taller')

    expect(height).toBe(70)
  })

  it('taller stops at 1000 pixels', () => {
    expect(changedHeight(800, 'taller')).toBe(1000)
    expect(changedHeight(1000, 'taller')).toBe(1000)
  })

  it('shorter stops at 1 pixel', () => {
    expect(changedHeight(1.2, 'shorter')).toBe(1)
    expect(changedHeight(1, 'shorter')).toBe(1)
  })

  it('a track already beyond a limit, as igv.js lets a person set one, is not brought back to it by a change the other way', () => {
    expect(changedHeight(2000, 'taller')).toBe(2000)
    expect(changedHeight(3000, 'shorter')).toBe(2000)
  })

  it('a change that is neither is an error', () => {
    expect(() => changedHeight(50, 'huge' as 'taller')).toThrow('A track cannot be huge pixels high. Give a height from 1 to 1000 pixels, or "taller" or "shorter".')
  })
})

describe('the note a height change gives', () => {
  it('none when every track got the height asked for', () => {
    expect(heightNote(120, [{ name: 'Conservation', from: 50, to: 120 }])).toBeUndefined()
    expect(heightNote('taller', [{ name: 'Conservation', from: 50, to: 75 }])).toBeUndefined()
  })

  it('"taller" stopped at the limit says which track stopped there', () => {
    expect(heightNote('taller', [{ name: 'Conservation', from: 800, to: 1000 }, { name: 'Refseq All', from: 70, to: 105 }])).toBe(
      '"Conservation" stopped at 1000 pixels: no track is made taller than that.',
    )
  })

  it('"shorter" stopped at the limit, on several tracks, names them all', () => {
    expect(heightNote('shorter', [{ name: 'A', from: 1.2, to: 1 }, { name: 'B', from: 1.4, to: 1 }])).toBe(
      '"A" and "B" stopped at 1 pixel: no track is made shorter than that.',
    )
  })

  it('a track already at the limit did not move, and is said to be left there', () => {
    expect(heightNote('taller', [{ name: 'Conservation', from: 1000, to: 1000 }])).toBe('"Conservation" was left at 1000 pixels: no track is made taller than 1000.')
  })

  it('a track a person set beyond the limit is left as it was', () => {
    expect(heightNote('taller', [{ name: 'Wide', from: 2000, to: 2000 }])).toBe('"Wide" was left at 2000 pixels: no track is made taller than 1000.')
  })

  it('a height every track already had changes nothing, and says so', () => {
    expect(heightNote(120, [{ name: 'Conservation', from: 120, to: 120 }])).toBe('"Conservation" was already 120 pixels high, so nothing changed.')
    expect(heightNote(40, [{ name: 'A', from: 40, to: 40 }, { name: 'B', from: 40, to: 40 }])).toBe(
      '"A" and "B" were already 40 pixels high, so nothing changed.',
    )
  })

  it('a height some tracks already had is no note: the others changed as asked', () => {
    expect(heightNote(40, [{ name: 'A', from: 40, to: 40 }, { name: 'B', from: 70, to: 40 }])).toBeUndefined()
  })
})
