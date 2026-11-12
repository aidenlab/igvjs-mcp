/**
 * The data range set_data_range gives a track, and the tracks it gives one to,
 * as igv.js's own "Set data range", "Log scale" and "Autoscale" do.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { dataRangeAsked, dataRangeNote, dataRangeTool, fixedRange } from '../src/trackDataRange.ts'

describe('the data range of one call', () => {
  it('is a fixed min and max, autoscale, log scale, or several of them', () => {
    expect(dataRangeAsked({ min: 0, max: 10 })).toEqual({ min: 0, max: 10 })
    expect(dataRangeAsked({ max: 10, logScale: true })).toEqual({ max: 10, logScale: true })
    expect(dataRangeAsked({ autoscale: true, logScale: false })).toEqual({ autoscale: true, logScale: false })
    expect(dataRangeAsked({ min: -2, max: 2, autoscale: false })).toEqual({ min: -2, max: 2, autoscale: false })
  })

  it('must be something', () => {
    expect(() => dataRangeAsked({})).toThrow('Give min and max, autoscale, logScale, or several of them.')
  })

  it('a min not below the max is an error', () => {
    expect(() => dataRangeAsked({ min: 10, max: 10 })).toThrow('min must be below max: 10 is not below 10.')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('%s is no bound', (bound) => {
    expect(() => dataRangeAsked({ max: bound })).toThrow(`max must be a number, not ${bound}.`)
  })

  it('autoscale with a fixed range is an error: autoscale sets the range itself', () => {
    expect(() => dataRangeAsked({ max: 10, autoscale: true })).toThrow('Give a fixed min and max or autoscale: true, not both: autoscale sets the range itself.')
  })
})

describe('the tracks that have a data range', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })
  const asLines = () => ({ heatmap: false, nestedArcs: false })

  it.each(['wig', 'alignment', 'qtl', 'gwas', 'gcnv', 'interact'])('a %s track has one, as igv.js offers in its menu', (type) => {
    expect(dataRangeTool({ max: 10 }, asLines).refuse(track(type), 0)).toBeUndefined()
  })

  it.each([
    ['annotation', '"T" is an annotation track, which has no data range.'],
    ['seg', '"T" is a seg track, which has no data range.'],
    ['shoebox', '"T" is a shoebox track, which has no data range igv-bot sets.'],
    ['sequence', 'The sequence track has no data range.'],
  ])('a %s track does not', (type, error) => {
    expect(dataRangeTool({ max: 10 }, asLines).refuse(track(type), 0)).toBe(error)
  })

  it.each(['wig', 'interact'])('a %s track has a log scale', (type) => {
    expect(dataRangeTool({ logScale: true }, asLines).refuse(track(type), 0)).toBeUndefined()
  })

  it.each([
    ['alignment', '"T" is an alignment track, whose coverage has no log scale: only wig and interact tracks have one.'],
    ['gwas', '"T" is a gwas track, which has no log scale: only wig and interact tracks have one.'],
  ])('a %s track does not', (type, error) => {
    expect(dataRangeTool({ autoscale: true, logScale: true }, asLines).refuse(track(type), 0)).toBe(error)
  })

  it("a wig track drawn as a heatmap has none: its range is set_signal_style's colorScale", () => {
    const heatmap = (index: number) => ({ heatmap: index === 3, nestedArcs: false })

    expect(dataRangeTool({ max: 10 }, heatmap).refuse(track('wig'), 3)).toBe('"T" is drawn as a heatmap, whose range is set by set_signal_style\'s colorScale.')
    expect(dataRangeTool({ max: 10 }, heatmap).refuse(track('wig'), 2)).toBeUndefined()
  })

  it('an interact track drawn with nested arcs has none: set_arcs draws them proportional', () => {
    const nested = () => ({ heatmap: false, nestedArcs: true })

    expect(dataRangeTool({ max: 10 }, nested).refuse(track('interact'), 0)).toBe('"T" draws its arcs nested, which have no data range: set_arcs can draw them proportional.')
  })

  it('all with no track that has a data range is an error', () => {
    expect(dataRangeTool({ max: 10 }, asLines).none).toBe('No track has a data range.')
    expect(dataRangeTool({ logScale: true }, asLines).none).toBe('No track has a log scale: only wig and interact tracks have one.')
  })
})

describe("a track's fixed range", () => {
  it('is the min and max asked for', () => {
    expect(fixedRange({ min: 0, max: 10 }, 'T', { min: -5, max: 5 })).toEqual({ min: 0, max: 10 })
  })

  it("takes a bound not given from the range the track has, as igv.js's dialog fills it in", () => {
    expect(fixedRange({ max: 10 }, 'T', { min: 2, max: 5 })).toEqual({ min: 2, max: 10 })
    expect(fixedRange({ min: 1 }, 'T', { min: 0, max: 5 })).toEqual({ min: 1, max: 5 })
  })

  it('autoscale turned off keeps the range the track has', () => {
    expect(fixedRange({ autoscale: false }, 'T', { min: 0, max: 7.5 })).toEqual({ min: 0, max: 7.5 })
  })

  it('none when no range is asked for', () => {
    expect(fixedRange({ autoscale: true }, 'T', { min: 0, max: 5 })).toBeUndefined()
    expect(fixedRange({ logScale: true }, 'T', { min: 0, max: 5 })).toBeUndefined()
  })

  it('a bound that, with the one the track has, leaves min not below max is an error', () => {
    expect(() => fixedRange({ max: 1 }, 'T', { min: 2, max: 5 })).toThrow('min must be below max: "T" would range from 2 to 1.')
  })

  it('a track with no range yet needs both bounds', () => {
    expect(() => fixedRange({ max: 10 }, 'T', undefined)).toThrow('"T" has no data range yet: give both min and max.')
    expect(fixedRange({ min: 0, max: 10 }, 'T', undefined)).toEqual({ min: 0, max: 10 })
  })
})

describe('the note when a data range was set other than as asked', () => {
  it('none when every track took it as asked', () => {
    expect(dataRangeNote({ max: 10 }, [{ name: 'Conservation', unchanged: false }, { name: 'H3K27ac', unchanged: true }])).toBeUndefined()
  })

  it('every track already had what was asked, so nothing changed', () => {
    expect(dataRangeNote({ min: 0, max: 10 }, [{ name: 'Conservation', unchanged: true }])).toBe('"Conservation" already had a data range of 0 to 10, so nothing changed.')
    expect(dataRangeNote({ max: 10, logScale: true }, [{ name: 'A', unchanged: true }, { name: 'B', unchanged: true }])).toBe(
      '"A" and "B" already had a max of 10 and log scale on, so nothing changed.',
    )
    expect(dataRangeNote({ autoscale: true, logScale: false }, [{ name: 'A', unchanged: true }])).toBe('"A" already had autoscale on and log scale off, so nothing changed.')
    expect(dataRangeNote({ min: 1, autoscale: false }, [{ name: 'A', unchanged: true }])).toBe('"A" already had a min of 1 and autoscale off, so nothing changed.')
  })

  it('a track taken out of the autoscale group a person made, naming the tracks still in it', () => {
    expect(dataRangeNote({ max: 10 }, [{ name: 'A', unchanged: false, group: { id: 'g', stillIn: ['B', 'C'] } }])).toBe(
      '"A" was taken out of its autoscale group; "B" and "C" are still in it.',
    )
  })

  it('several taken out of one group are named together; a group left empty is not said to have tracks in it', () => {
    const changes = [
      { name: 'A', unchanged: false, group: { id: 'g', stillIn: ['C'] } },
      { name: 'B', unchanged: false, group: { id: 'g', stillIn: ['C'] } },
      { name: 'D', unchanged: false, group: { id: 'h', stillIn: [] } },
    ]

    expect(dataRangeNote({ autoscale: false }, changes)).toBe('"A" and "B" were taken out of their autoscale group; "C" is still in it. "D" was taken out of its autoscale group.')
  })
})
