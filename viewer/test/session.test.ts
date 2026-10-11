/**
 * The Session summary, built from an igv.js Session as plain data.
 */
import { describe, it, expect } from 'vitest'
import { sessionSummary, type Session } from '../src/session.ts'

/** A Session shaped like the one igv.js 3.8.9 gives for hg38 at MYC, fields the summary does not read included. */
function session(overrides: Partial<Session> = {}): Session {
  return {
    version: '3.8.9',
    showSampleNames: false,
    reference: { id: 'hg38', name: 'Human (GRCh38/hg38)', twoBitURL: 'https://example.org/hg38.2bit', wholeGenomeView: true },
    locus: 'chr8:127,735,434-127,742,951',
    roi: [],
    tracks: [
      { type: 'sequence', order: -9007199254740991 },
      { id: 'refseqAll', name: 'Refseq All', type: 'annotation', format: 'refgene', url: 'https://example.org/ncbiRefSeq.txt.gz', height: 70, order: 100000 },
    ],
    ...overrides,
  } as Session
}

describe('sessionSummary', () => {
  it('gives the genome, the loci, the tracks and both display toggles', () => {
    expect(sessionSummary(session())).toEqual({
      genome: 'hg38',
      loci: ['chr8:127,735,434-127,742,951'],
      tracks: [
        { name: 'sequence', type: 'sequence' }, // no name of its own, so its type; no height stated, so none given
        { name: 'Refseq All', type: 'annotation', url: 'https://example.org/ncbiRefSeq.txt.gz', height: 70 },
      ],
      crosshairs: false,
      centreLine: false,
    })
  })

  it('lists tracks in display order, top to bottom, whatever order the Session holds them in', () => {
    const summary = sessionSummary(
      session({
        tracks: [
          { name: 'bottom', type: 'wig', url: 'https://example.org/c.bw', height: 50, order: 30 },
          { name: 'top', type: 'wig', url: 'https://example.org/a.bw', height: 50, order: 10 },
          { name: 'middle', type: 'wig', url: 'https://example.org/b.bw', height: 50, order: 20 },
        ],
      }),
    )

    expect(summary.tracks.map((track) => track.name)).toEqual(['top', 'middle', 'bottom'])
  })

  it('keeps the Session order among tracks that share an order or have none', () => {
    const summary = sessionSummary(
      session({
        tracks: [
          { name: 'first', type: 'wig', order: 5 },
          { name: 'second', type: 'wig', order: 5 },
          { name: 'unordered', type: 'wig' },
          { name: 'above', type: 'wig', order: 1 },
        ],
      }),
    )

    expect(summary.tracks.map((track) => track.name)).toEqual(['above', 'first', 'second', 'unordered'])
  })

  it('gives one locus per panel of a multi-locus view', () => {
    expect(sessionSummary(session({ locus: ['chr1:1-100', 'chr2:1-100'] })).loci).toEqual(['chr1:1-100', 'chr2:1-100'])
  })

  it('reports the crosshairs and the centre line when they are showing', () => {
    const summary = sessionSummary(session({ showCursorGuide: true, showCenterGuide: true }))

    expect([summary.crosshairs, summary.centreLine]).toEqual([true, true])
  })

  it('names a genome that has no id by its name', () => {
    expect(sessionSummary(session({ reference: { name: 'My assembly' } })).genome).toBe('My assembly')
  })

  it('names a track that has no name after its file', () => {
    const [track] = sessionSummary(session({ tracks: [{ type: 'wig', url: 'https://example.org/data/signal.bw?download=1', height: 50 }] })).tracks

    expect(track).toEqual({ name: 'signal.bw', type: 'wig', url: 'https://example.org/data/signal.bw?download=1', height: 50 })
  })

  it('gives no height for a track whose Session entry states none, rather than guess one', () => {
    const [track] = sessionSummary(session({ tracks: [{ name: 'reads', type: 'alignment', url: 'https://example.org/reads.bam' }] })).tracks

    expect(track).toEqual({ name: 'reads', type: 'alignment', url: 'https://example.org/reads.bam' })
  })
})
