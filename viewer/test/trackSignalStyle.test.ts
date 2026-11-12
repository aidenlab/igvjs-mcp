/**
 * The signal style set_signal_style gives a track, and the tracks it gives one to,
 * as igv.js's own "Graph type", "Windowing function", "Flip y-axis" and "Set color scale" do.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { colorScaleFor, sameColorScale, signalStyleAsked, signalStyleNote, signalStyleTool } from '../src/trackSignalStyle.ts'

describe('the signal style of one call', () => {
  it('is a graph type, a window function, a flipped axis, a color scale, or several of them', () => {
    expect(signalStyleAsked({ graphType: 'line' })).toEqual({ graphType: 'line' })
    expect(signalStyleAsked({ windowFunction: 'max', flipAxis: true })).toEqual({ windowFunction: 'max', flipAxis: true })
    expect(signalStyleAsked({ graphType: 'heatmap', colorScale: { min: 0, max: 5 } })).toEqual({ graphType: 'heatmap', colorScale: { min: 0, max: 5 } })
  })

  it('must be something', () => {
    expect(() => signalStyleAsked({})).toThrow('Give a graphType, windowFunction, flipAxis, colorScale, or several of them.')
  })

  it("a graph type igv.js does not draw is an error naming those it does", () => {
    expect(() => signalStyleAsked({ graphType: 'area' })).toThrow('"area" is no graph type: give bar, line, points, heatmap or dynseq.')
  })

  it('a window function igv.js does not know is an error naming those it does', () => {
    expect(() => signalStyleAsked({ windowFunction: 'median' })).toThrow('"median" is no window function: give mean, min, max or none.')
  })

  it('a color scale with a graph type that is not heatmap is an error: only a heatmap has one', () => {
    expect(() => signalStyleAsked({ graphType: 'bar', colorScale: { max: 5 } })).toThrow(
      'A colorScale is for tracks drawn as a heatmap: give graphType heatmap with it, or leave graphType out.',
    )
  })

  it('a color scale must be something, its bounds numbers and its colors colors', () => {
    expect(() => signalStyleAsked({ colorScale: {} })).toThrow('Give the colorScale a min, max, mid, minColor, midColor or maxColor.')
    expect(() => signalStyleAsked({ colorScale: { max: Number.NaN } })).toThrow('The colorScale max must be a number, not NaN.')
    expect(() => signalStyleAsked({ colorScale: { minColor: 'unset' } })).toThrow('"unset" is no color for a colorScale: give one as "#RRGGBB" or "rgb(R, G, B)".')
    expect(() => signalStyleAsked({ colorScale: { maxColor: 'red' } })).toThrow('"red" is not a color igv-bot takes.')
  })

  it('bounds given out of order are an error whatever tracks the call is for', () => {
    expect(() => signalStyleAsked({ colorScale: { min: 5, max: 1 } })).toThrow('The colorScale min must be below its max: 5 is not below 1.')
    expect(() => signalStyleAsked({ colorScale: { min: 0, mid: 9, max: 5 } })).toThrow('The colorScale mid must lie between its min and max: 9 is outside 0 to 5.')
    expect(() => signalStyleAsked({ colorScale: { mid: 0, max: 0 } })).toThrow('The colorScale mid must lie between its min and max: 0 is not below 0.')
  })

  it("spells a color scale's colors as igv.js's color picker does", () => {
    expect(signalStyleAsked({ colorScale: { minColor: '#fff', maxColor: 'rgb(255,0,0)' } })).toEqual({
      colorScale: { minColor: 'rgb(255, 255, 255)', maxColor: 'rgb(255, 0, 0)' },
    })
  })
})

describe('the tracks that have a signal style', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })
  const bars = () => ({ graphType: 'bar', windowFunctions: ['mean', 'min', 'max', 'none'] })

  it('a wig track has one', () => {
    expect(signalStyleTool({ graphType: 'line' }, bars).refuse(track('wig'), 0)).toBeUndefined()
  })

  it.each([
    ['annotation', '"T" is an annotation track, which has no signal style: only wig tracks have one.'],
    ['alignment', '"T" is an alignment track, which has no signal style: only wig tracks have one.'],
    ['sequence', 'The sequence track has no signal style.'],
  ])('a %s track does not', (type, error) => {
    expect(signalStyleTool({ flipAxis: true }, bars).refuse(track(type), 0)).toBe(error)
  })

  it('a color scale is only for a track drawn as a heatmap, or about to be', () => {
    const heatmap = (index: number) => ({ graphType: index === 1 ? 'heatmap' : 'line', windowFunctions: [] })

    expect(signalStyleTool({ colorScale: { max: 5 } }, heatmap).refuse(track('wig'), 1)).toBeUndefined()
    expect(signalStyleTool({ colorScale: { max: 5 } }, heatmap).refuse(track('wig'), 0)).toBe(
      '"T" is drawn as line, not as a heatmap, so it has no colorScale: give graphType heatmap with it to draw it as one.',
    )
    expect(signalStyleTool({ graphType: 'heatmap', colorScale: { max: 5 } }, heatmap).refuse(track('wig'), 0)).toBeUndefined()
  })

  it("a heatmap has no axis to flip, as igv.js's menu offers none, unless the call draws it another way", () => {
    const heatmap = () => ({ graphType: 'heatmap', windowFunctions: [] })

    expect(signalStyleTool({ flipAxis: true }, heatmap).refuse(track('wig'), 0)).toBe('"T" is drawn as a heatmap, which has no axis to flip: give another graphType with it to draw it with one.')
    expect(signalStyleTool({ flipAxis: true, graphType: 'line' }, heatmap).refuse(track('wig'), 0)).toBeUndefined()
    expect(() => signalStyleAsked({ graphType: 'heatmap', flipAxis: true })).toThrow('A heatmap has no axis to flip: leave flipAxis out, or give another graphType.')
  })

  it("a window function is one the track's file offers", () => {
    const tdf = () => ({ graphType: 'bar', windowFunctions: ['mean', 'none'] })
    const none = () => ({ graphType: 'bar', windowFunctions: [] })

    expect(signalStyleTool({ windowFunction: 'none' }, tdf).refuse(track('wig'), 0)).toBeUndefined()
    expect(signalStyleTool({ windowFunction: 'max' }, tdf).refuse(track('wig'), 0)).toBe('"T" offers no window function max: its file offers mean and none.')
    expect(signalStyleTool({ windowFunction: 'max' }, none).refuse(track('wig'), 0)).toBe('"T" offers no window function: its file gives one value for each place.')
  })

  it('all with no track that takes what is given is an error', () => {
    expect(signalStyleTool({ flipAxis: true }, bars).none).toBe('No track has a signal style: only wig tracks have one.')
    expect(signalStyleTool({ colorScale: { max: 5 } }, bars).none).toBe('No track is drawn as a heatmap: give graphType heatmap with the colorScale to draw tracks as one.')
    expect(signalStyleTool({ windowFunction: 'max' }, bars).none).toBe('No track offers window function max.')
  })
})

describe('the color scale a heatmap is given', () => {
  const gradient = { type: 'gradient', min: 0, max: 10, minColor: 'rgb(0, 0, 255)', maxColor: 'rgb(255, 0, 0)' }
  const diverging = { type: 'diverging', min: -1, mid: 0, max: 1, minColor: 'rgb(0, 0, 255)', midColor: 'white', maxColor: 'rgb(255, 0, 0)' }

  it('keeps what is not given as the track has it', () => {
    expect(colorScaleFor({ max: 5 }, 'T', gradient)).toEqual({ ...gradient, max: 5 })
    expect(colorScaleFor({ midColor: 'rgb(0, 0, 0)' }, 'T', diverging)).toEqual({ ...diverging, midColor: 'rgb(0, 0, 0)' })
  })

  it("takes igv.js's own colors when the track has no color scale yet", () => {
    expect(colorScaleFor({ min: 0, max: 5 }, 'T', undefined)).toEqual({ type: 'gradient', min: 0, max: 5, minColor: 'rgb(46,56,183)', maxColor: 'rgb(164,0,30)' })
  })

  it('a mid makes it diverging, with white at the mid as igv.js gives it', () => {
    expect(colorScaleFor({ mid: 5 }, 'T', gradient)).toEqual({ ...gradient, type: 'diverging', mid: 5, midColor: 'white' })
  })

  it('a gradient asked for drops the mid', () => {
    expect(colorScaleFor({ type: 'gradient' }, 'T', diverging)).toEqual({ type: 'gradient', min: -1, max: 1, minColor: 'rgb(0, 0, 255)', maxColor: 'rgb(255, 0, 0)' })
  })

  it('bounds it cannot work out, or out of order, are errors', () => {
    expect(() => colorScaleFor({ max: 5 }, 'T', undefined)).toThrow('"T" has no color scale yet: give the colorScale a min and max.')
    expect(() => colorScaleFor({ type: 'diverging' }, 'T', gradient)).toThrow('A diverging colorScale needs a mid: give one between its min and max.')
    expect(() => colorScaleFor({ min: 10 }, 'T', gradient)).toThrow('The colorScale min must be below its max: "T" would range from 10 to 10.')
    expect(() => colorScaleFor({ mid: 2 }, 'T', diverging)).toThrow('The colorScale mid must lie between its min and max: "T" would have a mid of 2, outside -1 to 1.')
  })
})

describe('the note on a signal style', () => {
  const changed = (name: string) => ({ name, unchanged: false })
  const unchanged = (name: string) => ({ name, unchanged: true })

  it('is none when every track took it as asked', () => {
    expect(signalStyleNote({ graphType: 'line' }, [changed('A'), unchanged('B')], 1)).toBeUndefined()
  })

  it('says so when every track already had it', () => {
    expect(signalStyleNote({ graphType: 'line', windowFunction: 'max' }, [unchanged('A'), unchanged('B')], 1)).toBe(
      '"A" and "B" already had graph type line and window function max, so nothing changed.',
    )
    expect(signalStyleNote({ flipAxis: false, colorScale: { max: 5 } }, [unchanged('A')], 1)).toBe('"A" already had its axis not flipped and that color scale, so nothing changed.')
  })

  it('says dynseq shows no bases until zoomed in below 2 bp per pixel', () => {
    expect(signalStyleNote({ graphType: 'dynseq' }, [changed('A')], 1.5)).toBeUndefined()
    expect(signalStyleNote({ graphType: 'dynseq' }, [changed('A'), changed('B')], 2)).toBe(
      '"A" and "B" are drawn as dynseq, which shows bases only below 2 bp per pixel: until the view is zoomed in that far they are drawn as bars.',
    )
    expect(signalStyleNote({ graphType: 'dynseq' }, [unchanged('A')], 40)).toBe(
      '"A" already had graph type dynseq, so nothing changed. "A" is drawn as dynseq, which shows bases only below 2 bp per pixel: until the view is zoomed in that far it is drawn as bars.',
    )
  })
})

describe('whether a track already has a color scale', () => {
  const scale = { type: 'gradient', min: 0, max: 5, minColor: 'rgb(46, 56, 183)', maxColor: 'rgb(164, 0, 30)' }

  it("is so when its bounds and colors are the same, however igv.js spells the colors", () => {
    expect(sameColorScale({ ...scale, minColor: 'rgb(46,56,183)', maxColor: '#a4001e' }, scale)).toBe(true)
    expect(sameColorScale({ ...scale, type: 'diverging', mid: 1, midColor: 'white' }, { ...scale, type: 'diverging', mid: 1, midColor: 'white' })).toBe(true)
  })

  it('is not so when any part differs, or the track has none', () => {
    expect(sameColorScale({ ...scale, max: 6 }, scale)).toBe(false)
    expect(sameColorScale({ ...scale, maxColor: 'rgb(0, 0, 0)' }, scale)).toBe(false)
    expect(sameColorScale({ ...scale, type: 'diverging' }, scale)).toBe(false)
    expect(sameColorScale(undefined, scale)).toBe(false)
  })
})
