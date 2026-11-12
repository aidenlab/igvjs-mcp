/**
 * The Session summary, built from an igv.js Session and the Viewer settings. The Sessions here are
 * shaped as igv.js 3.8 writes them (`browser.toJSON()`), cut down to a few
 * fields beyond the ones the summary reads.
 */
import { describe, it, expect } from 'vitest'
import { NO_VIEWER_SETTINGS } from '../src/protocol.ts'
import { sessionSummary, type Session } from '../src/session.ts'

const SEQUENCE = { type: 'sequence', order: -Number.MAX_SAFE_INTEGER, height: 25 }
const REFSEQ = {
  id: 'refseqAll',
  name: 'Refseq All',
  url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz',
  format: 'refgene',
  order: 100000,
  type: 'annotation',
  height: 70,
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    reference: { id: 'hg38', name: 'Human (GRCh38/hg38)' },
    locus: 'all',
    tracks: [SEQUENCE, REFSEQ],
    showCursorGuide: false,
    showCenterGuide: false,
    ...overrides,
  }
}

/** The Session summary of `session`, with the Controls hidden as a new Viewer has them. */
const summaryOf = (session: Session) => sessionSummary(session, NO_VIEWER_SETTINGS)

describe('sessionSummary', () => {
  it('gives the genome, loci, tracks and toggles of the default Viewer', () => {
    expect(summaryOf(session())).toEqual({
      genome: 'hg38',
      loci: ['all'],
      tracks: [
        { name: 'sequence', type: 'sequence', height: 25 },
        { name: 'Refseq All', type: 'annotation', url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz', height: 70 },
      ],
      crosshairs: false,
      centreLine: false,
      controls: false,
    })
  })

  it('lists tracks in display order, top to bottom, whatever their order in the Session', () => {
    const tracks = [
      { name: 'bottom', type: 'wig', url: 'https://example.org/c.bw', order: 300, height: 50 },
      SEQUENCE,
      { name: 'top', type: 'wig', url: 'https://example.org/a.bw', order: 1, height: 50 },
      { name: 'middle', type: 'annotation', url: 'https://example.org/b.bed', order: 2, height: 40 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.name)).toEqual(['sequence', 'top', 'middle', 'bottom'])
  })

  it('tracks with the same display position keep their Session order', () => {
    const tracks = [
      { name: 'first', type: 'wig', order: 5, height: 50 },
      { name: 'second', type: 'wig', order: 5, height: 50 },
      { name: 'above', type: 'wig', order: 4, height: 50 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.name)).toEqual(['above', 'first', 'second'])
  })

  it('carries each track\'s name, type, URL and height', () => {
    const tracks = [{ name: 'CTCF K562', type: 'wig', format: 'bigwig', url: 'https://example.org/ctcf.bigWig', order: 1, height: 120 }]

    expect(summaryOf(session({ tracks })).tracks).toEqual([
      { name: 'CTCF K562', type: 'wig', url: 'https://example.org/ctcf.bigWig', height: 120 },
    ])
  })

  it.each([
    ['genes', 'annotation'],
    ['feature', 'annotation'],
    ['snp', 'annotation'],
    ['fusionjuncspan', 'annotation'],
    ['interaction', 'interact'],
    ['maf', 'seg'],
    ['mut', 'seg'],
    ['eqtl', 'qtl'],
    ['junctions', 'junction'],
    ['splicejunctions', 'junction'],
  ])('gives a track of type %s the Track type igv.js folds it into: %s', (type, folded) => {
    const tracks = [{ name: 'a track', type, order: 1, height: 50 }]

    expect(summaryOf(session({ tracks })).tracks[0].type).toBe(folded)
  })

  it.each(['annotation', 'wig', 'alignment', 'variant', 'interact', 'seg', 'sequence'])('keeps the Track type %s as it is', (type) => {
    const tracks = [{ name: 'a track', type, order: 1, height: 50 }]

    expect(summaryOf(session({ tracks })).tracks[0].type).toBe(type)
  })

  it('leaves out the options of a track whose saved state records none that a track tool controls', () => {
    const tracks = [{ name: 'grouped', type: 'wig', url: 'https://example.org/a.bw', autoscaleGroup: '1', order: 1, height: 50 }]

    expect(summaryOf(session({ tracks })).tracks).toEqual([{ name: 'grouped', type: 'wig', url: 'https://example.org/a.bw', height: 50 }])
  })

  it("gives the track color and alt color a track's saved state records, as igv.js saves them", () => {
    const tracks = [
      { name: 'colored', type: 'wig', color: 'rgb(31, 119, 180)', altColor: 'rgb(255,0,0)', autoscaleGroup: '1', order: 1, height: 50 },
      { name: 'plain', type: 'annotation', order: 2, height: 70 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.options)).toEqual([{ color: 'rgb(31, 119, 180)', altColor: 'rgb(255,0,0)' }, undefined])
  })

  it("gives the data range, autoscale and log scale a track's saved state records, as igv.js saves them", () => {
    const tracks = [
      { name: 'fixed', type: 'wig', min: 0, max: 10, autoscale: false, logScale: true, order: 1, height: 50 },
      { name: 'autoscaled', type: 'alignment', autoscale: true, order: 2, height: 300 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.options)).toEqual([{ min: 0, max: 10, autoscale: false, logScale: true }, { autoscale: true }])
  })

  it("gives the graph type, window function, flipped axis and color scale a track's saved state records, as igv.js saves them", () => {
    const colorScale = { type: 'gradient', min: 0, max: 5, minColor: 'rgb(46,56,183)', maxColor: 'rgb(164,0,30)' }
    const tracks = [{ name: 'heatmap', type: 'wig', graphType: 'heatmap', windowFunction: 'max', flipAxis: true, colorScale, order: 1, height: 20 }]

    expect(summaryOf(session({ tracks })).tracks[0].options).toEqual({ graphType: 'heatmap', windowFunction: 'max', flipAxis: true, colorScale })
  })

  it("gives the display mode a track's saved state records in lower case, as set_display_mode takes it", () => {
    const tracks = [
      { name: 'genes', type: 'annotation', displayMode: 'SQUISHED', order: 1, height: 50 },
      { name: 'reads', type: 'alignment', displayMode: 'FULL', order: 2, height: 300 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.options)).toEqual([{ displayMode: 'squished' }, { displayMode: 'full' }])
  })

  it('gives color-by and grouping as set_color_by and group_reads take them, a tag as its own field', () => {
    const tracks = [
      // As igv.js saves an alignment track loaded with colorBy "tag" and colorByTag "HP": its config's colorByTag beside.
      { name: 'reads', type: 'alignment', colorBy: 'tag:HP', colorByTag: 'HP', groupBy: 'tag:RG', order: 1, height: 300 },
      { name: 'paired', type: 'alignment', colorBy: 'unexpectedPair', groupBy: 'base:chr8:127,736,231', order: 2, height: 300 },
      { name: 'calls', type: 'variant', colorBy: 'AF', order: 3, height: 50 },
      { name: 'plain calls', type: 'variant', colorBy: 'none', order: 4, height: 50 },
      { name: 'snps', type: 'snp', colorBy: 'class', order: 5, height: 30 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.options)).toEqual([
      { colorBy: 'tag', colorByTag: 'HP', groupBy: 'tag', groupByTag: 'RG' },
      // A grouping made by hand at a base keeps igv.js's own spelling: group_reads offers none.
      { colorBy: 'unexpectedPair', groupBy: 'base:chr8:127,736,231' },
      { colorBy: 'info', colorByTag: 'AF' },
      { colorBy: 'none' },
      { colorBy: 'class' },
    ])
  })

  it('gives no color-by or grouping a track tool does not set: a feature attribute, a seg track\'s sample grouping', () => {
    const tracks = [
      { name: 'peaks', type: 'annotation', colorBy: 'score', order: 1, height: 50 },
      { name: 'copy number', type: 'seg', groupBy: 'Subtype', order: 2, height: 50 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.options)).toEqual([undefined, undefined])
  })

  it('gives a height in whole pixels: "shorter" leaves a track a part of a pixel', () => {
    const tracks = [
      { name: 'two thirds of 50', type: 'wig', order: 1, height: 33.333333333333336 },
      { name: 'half as much again as 25', type: 'wig', order: 2, height: 37.5 },
    ]

    expect(summaryOf(session({ tracks })).tracks.map((track) => track.height)).toEqual([33, 38])
  })

  it('lists every locus of a split view, left to right', () => {
    const locus = ['chr8:127,735,434-127,742,951', 'chr17:43,044,295-43,125,364']

    expect(summaryOf(session({ locus })).loci).toEqual(locus)
  })

  it.each([
    [{ showCursorGuide: true }, { crosshairs: true, centreLine: false }],
    [{ showCenterGuide: true }, { crosshairs: false, centreLine: true }],
    [{ showCursorGuide: undefined, showCenterGuide: undefined }, { crosshairs: false, centreLine: false }],
  ])('a Session with %o reports %o', (toggles, expected) => {
    expect(summaryOf(session(toggles))).toMatchObject(expected)
  })

  it.each([true, false])('says the Controls are showing as the Viewer settings say: %s', (controls) => {
    expect(sessionSummary(session(), { controls }).controls).toBe(controls)
  })

  it('names a genome that has no id by its name', () => {
    expect(summaryOf(session({ reference: { name: 'My assembly' } })).genome).toBe('My assembly')
  })
})
