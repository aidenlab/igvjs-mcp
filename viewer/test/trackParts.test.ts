/**
 * How show_track_parts shows and hides the parts of a track, and the tracks it does so on, as
 * igv.js's own menus do: an alignment track's coverage, alignments and the ways its reads are
 * drawn; a variant track's genotypes.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { partsAsked, partsNote, partsTool, type LiveParts, type PartsAsk } from '../src/trackParts.ts'

describe('the parts of one call', () => {
  it('are the parts given, each shown or hidden', () => {
    expect(partsAsked({ showCoverage: false, viewAsPairs: true })).toEqual({ showCoverage: false, viewAsPairs: true })
    expect(partsAsked({ showGenotypes: false })).toEqual({ showGenotypes: false })
  })

  it('no part is an error naming them', () => {
    expect(() => partsAsked({})).toThrow(
      'Give showCoverage, showAlignments, viewAsPairs, showMismatches, showSoftClips, showInsertions or showGenotypes, or several of them.',
    )
  })

  it("parts of an alignment track and a variant track's genotypes are no one track's: an error", () => {
    expect(() => partsAsked({ showCoverage: true, showGenotypes: false })).toThrow(
      'showGenotypes is a part of variant tracks, showCoverage of alignment tracks: no track has both. Show or hide them in two calls.',
    )
  })

  it('hiding both the coverage and the alignments leaves nothing to draw: an error', () => {
    expect(() => partsAsked({ showCoverage: false, showAlignments: false })).toThrow(
      'Hiding both the coverage and the alignments leaves the track nothing to draw: to take it away, use remove_track.',
    )
  })
})

describe('the tracks whose parts can be shown or hidden', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })
  const refusal = (asked: PartsAsk, type: string, facts: LiveParts = {}) => partsTool(partsAsked(asked), () => facts).refuse(track(type), 0)

  it("an alignment track has its coverage, alignments and the ways its reads are drawn, as igv.js's menu", () => {
    expect(refusal({ showCoverage: false, showMismatches: false, showSoftClips: true, showInsertions: false }, 'alignment')).toBeUndefined()
    expect(refusal({ showAlignments: false, viewAsPairs: true }, 'alignment', { pairs: true })).toBeUndefined()
    // Until its reads load, igv.js has not seen whether they are paired.
    expect(refusal({ viewAsPairs: true }, 'alignment')).toBeUndefined()
  })

  it('a variant track has its genotypes, where its file has samples', () => {
    expect(refusal({ showGenotypes: false }, 'variant', { samples: 3 })).toBeUndefined()
    expect(refusal({ showGenotypes: false }, 'variant')).toBeUndefined()
    expect(refusal({ showGenotypes: true }, 'variant', { samples: 0 })).toBe('"T" has no genotypes to show or hide: its file has no samples.')
  })

  it("a part of the other kind of track is an error naming the track's own", () => {
    expect(refusal({ showGenotypes: false }, 'alignment')).toBe(
      '"T" is an alignment track, which has no showGenotypes: its parts are showCoverage, showAlignments, viewAsPairs, showMismatches, showSoftClips and showInsertions.',
    )
    expect(refusal({ showCoverage: false }, 'variant')).toBe('"T" is a variant track, which has no showCoverage: its one part is showGenotypes.')
  })

  it('viewing reads loaded unpaired as pairs is an error', () => {
    expect(refusal({ viewAsPairs: true }, 'alignment', { pairs: false })).toBe('"T" has no paired reads to view as pairs.')
    expect(refusal({ viewAsPairs: false }, 'alignment', { pairs: false })).toBeUndefined()
  })

  it('viewing reads as pairs is an error while they are grouped other than by firstOfPairStrand, as in igv.js', () => {
    expect(refusal({ viewAsPairs: true }, 'alignment', { pairs: true, groupBy: 'tag:RG' })).toBe(
      '"T" has its reads grouped by tag RG, which igv.js cannot view as pairs: only reads grouped by firstOfPairStrand, or not grouped, can be. Ungroup them with group_reads first.',
    )
    expect(refusal({ viewAsPairs: true }, 'alignment', { pairs: true, groupBy: 'firstOfPairStrand' })).toBeUndefined()
  })

  it('hiding the one of coverage and alignments still shown is an error', () => {
    expect(refusal({ showCoverage: false }, 'alignment', { showAlignments: false })).toBe(
      '"T" has its alignments hidden, so hiding its coverage too would leave it nothing to draw: give showAlignments true with it.',
    )
    expect(refusal({ showAlignments: false }, 'alignment', { showCoverage: false })).toBe(
      '"T" has its coverage hidden, so hiding its alignments too would leave it nothing to draw: give showCoverage true with it.',
    )
    expect(refusal({ showCoverage: false, showAlignments: true }, 'alignment', { showAlignments: false })).toBeUndefined()
  })

  it.each([
    ['wig', '"T" is a wig track, which has no parts to show or hide: only alignment and variant tracks have them.'],
    ['annotation', '"T" is an annotation track, which has no parts to show or hide: only alignment and variant tracks have them.'],
    ['sequence', 'The sequence track has no parts to show or hide.'],
  ])('a %s track has no parts', (type, error) => {
    expect(refusal({ showCoverage: false }, type)).toBe(error)
  })

  it('all with no track to take the parts is an error naming the tracks that have them', () => {
    expect(partsTool({ showCoverage: false, viewAsPairs: true }, () => ({})).none).toBe('No track can show or hide showCoverage and viewAsPairs: only alignment tracks have them.')
    expect(partsTool({ showGenotypes: false }, () => ({})).none).toBe('No track can show or hide showGenotypes: only variant tracks with samples have it.')
  })
})

describe('the note on parts shown or hidden', () => {
  it('says so, part by part, when every track already had them', () => {
    expect(partsNote({ showCoverage: false, viewAsPairs: true }, [{ name: 'A', unchanged: true }])).toBe(
      '"A" already had its coverage hidden and its reads viewed as pairs, so nothing changed.',
    )
    expect(partsNote({ showGenotypes: true }, [{ name: 'A', unchanged: true }, { name: 'B', unchanged: true }])).toBe(
      '"A" and "B" already had their genotypes shown, so nothing changed.',
    )
    expect(partsNote({ showMismatches: true, showSoftClips: false, viewAsPairs: false }, [{ name: 'A', unchanged: true }])).toBe(
      '"A" already had its reads not viewed as pairs, its mismatches shown and its soft clips hidden, so nothing changed.',
    )
    expect(partsNote({ showCoverage: true }, [{ name: 'A', unchanged: false }])).toBeUndefined()
  })
})
