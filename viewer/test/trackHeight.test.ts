/**
 * The height a track is given: an absolute number of pixels, or taller or
 * shorter than it is.
 */
import { describe, it, expect } from 'vitest'
import { changedHeight } from '../src/trackHeight.ts'

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
    expect(() => changedHeight(50, height)).toThrow(`A track cannot be ${height} pixels high. Give a height from 1 to 1000 pixels, or "taller" or "shorter".`)
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
