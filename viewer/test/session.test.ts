/**
 * The Session summary, built from an igv.js Session. The Sessions here are
 * shaped as igv.js 3.8 writes them (`browser.toJSON()`), cut down to a few
 * fields beyond the ones the summary reads.
 */
import { describe, it, expect } from 'vitest'
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

describe('sessionSummary', () => {
  it('gives the genome, loci, tracks and toggles of the default Viewer', () => {
    expect(sessionSummary(session())).toEqual({
      genome: 'hg38',
      loci: ['all'],
      tracks: [
        { name: 'sequence', type: 'sequence', height: 25 },
        { name: 'Refseq All', type: 'annotation', url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz', height: 70 },
      ],
      crosshairs: false,
      centreLine: false,
    })
  })

  it('lists tracks in display order, top to bottom, whatever their order in the Session', () => {
    const tracks = [
      { name: 'bottom', type: 'wig', url: 'https://example.org/c.bw', order: 300, height: 50 },
      SEQUENCE,
      { name: 'top', type: 'wig', url: 'https://example.org/a.bw', order: 1, height: 50 },
      { name: 'middle', type: 'annotation', url: 'https://example.org/b.bed', order: 2, height: 40 },
    ]

    expect(sessionSummary(session({ tracks })).tracks.map((track) => track.name)).toEqual(['sequence', 'top', 'middle', 'bottom'])
  })

  it('tracks with the same display position keep their Session order', () => {
    const tracks = [
      { name: 'first', type: 'wig', order: 5, height: 50 },
      { name: 'second', type: 'wig', order: 5, height: 50 },
      { name: 'above', type: 'wig', order: 4, height: 50 },
    ]

    expect(sessionSummary(session({ tracks })).tracks.map((track) => track.name)).toEqual(['above', 'first', 'second'])
  })

  it('carries each track\'s name, type, URL and height', () => {
    const tracks = [{ name: 'CTCF K562', type: 'wig', format: 'bigwig', url: 'https://example.org/ctcf.bigWig', order: 1, height: 120 }]

    expect(sessionSummary(session({ tracks })).tracks).toEqual([
      { name: 'CTCF K562', type: 'wig', url: 'https://example.org/ctcf.bigWig', height: 120 },
    ])
  })

  it('lists every locus of a split view, left to right', () => {
    const locus = ['chr8:127,735,434-127,742,951', 'chr17:43,044,295-43,125,364']

    expect(sessionSummary(session({ locus })).loci).toEqual(locus)
  })

  it.each([
    [{ showCursorGuide: true }, { crosshairs: true, centreLine: false }],
    [{ showCenterGuide: true }, { crosshairs: false, centreLine: true }],
    [{ showCursorGuide: undefined, showCenterGuide: undefined }, { crosshairs: false, centreLine: false }],
  ])('a Session with %o reports %o', (toggles, expected) => {
    expect(sessionSummary(session(toggles))).toMatchObject(expected)
  })

  it('names a genome that has no id by its name', () => {
    expect(sessionSummary(session({ reference: { name: 'My assembly' } })).genome).toBe('My assembly')
  })
})
