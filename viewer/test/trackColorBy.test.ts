/**
 * The color-by set_color_by gives a track, and the tracks it gives one to, as igv.js's own
 * "Color by" menus do: an alignment track's, a variant track's and an SNP track's.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { colorByAsked, colorByNote, colorByTool } from '../src/trackColorBy.ts'
import type { LiveTrack } from '../src/trackTools.ts'

describe('the color-by of one call', () => {
  it('is a way of coloring, with a tag where it needs one', () => {
    expect(colorByAsked({ by: 'strand' })).toEqual({ by: 'strand' })
    expect(colorByAsked({ by: 'tag', tag: 'HP' })).toEqual({ by: 'tag', tag: 'HP' })
    expect(colorByAsked({ by: 'info', tag: 'AF' })).toEqual({ by: 'info', tag: 'AF' })
  })

  it('a way igv.js colors no track by is an error naming those it does', () => {
    expect(() => colorByAsked({ by: 'basemod' })).toThrow(
      '"basemod" is no color-by: give none, strand, firstOfPairStrand, pairOrientation, tlen, unexpectedPair, tag, info, function or class.',
    )
  })

  it('tag and info need a tag, and nothing else takes one', () => {
    expect(() => colorByAsked({ by: 'tag' })).toThrow('Color-by tag needs a tag: the read tag to color by, such as HP.')
    expect(() => colorByAsked({ by: 'info' })).toThrow('Color-by info needs a tag: the INFO field to color by, such as AF.')
    expect(() => colorByAsked({ by: 'strand', tag: 'HP' })).toThrow('A tag goes only with color-by tag or info, not strand.')
  })

  it('a read tag is two letters or digits, a letter first, as SAM spells them', () => {
    expect(() => colorByAsked({ by: 'tag', tag: 'HAP' })).toThrow('"HAP" is no read tag: a read tag is two characters, a letter then a letter or digit, such as HP.')
  })
})

describe('the tracks that offer a color-by', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })
  /** What the live track at every index knows. */
  const live = (facts: LiveTrack) => () => facts
  const refusal = (by: string, type: string, facts: LiveTrack = {}, tag?: string) => colorByTool(colorByAsked({ by, ...(tag ? { tag } : {}) }), live(facts)).refuse(track(type), 0)

  it("an alignment track offers those of igv.js's menu, the four of paired reads once its reads are seen to be paired", () => {
    for (const by of ['none', 'strand', 'firstOfPairStrand', 'pairOrientation', 'tlen', 'unexpectedPair']) expect(refusal(by, 'alignment', { pairs: true })).toBeUndefined()
    expect(refusal('tag', 'alignment', { pairs: false }, 'HP')).toBeUndefined()
  })

  it('a pair color-by on reads not yet loaded is taken: igv.js draws it once they are', () => {
    expect(refusal('pairOrientation', 'alignment')).toBeUndefined()
  })

  it('a pair color-by on reads loaded and unpaired is an error naming those they offer', () => {
    expect(refusal('tlen', 'alignment', { pairs: false })).toBe('"T" has no paired reads, so offers color-by none, strand and tag, not tlen.')
  })

  it('a variant track offers none, and info for an INFO field its file has', () => {
    expect(refusal('none', 'variant', { infoFields: ['AF'] })).toBeUndefined()
    expect(refusal('info', 'variant', { infoFields: ['AF', 'DP'] }, 'DP')).toBeUndefined()
    expect(refusal('info', 'variant', { infoFields: ['AF', 'DP'] }, 'SVTYPE')).toBe('"T" has no INFO field SVTYPE: its INFO fields are AF and DP.')
    expect(refusal('info', 'variant', { infoFields: [] }, 'AF')).toBe('"T" has no INFO fields to color by.')
  })

  it('an annotation track of SNPs offers function and class; another annotation track has no color-by', () => {
    expect(refusal('class', 'annotation', { igvType: 'snp' })).toBeUndefined()
    expect(refusal('function', 'annotation', { igvType: 'snp' })).toBeUndefined()
    expect(refusal('function', 'annotation', { igvType: 'annotation' })).toBe(
      '"T" is an annotation track, which has no color-by: only an SNP annotation track has one. Its color is set by set_track_color.',
    )
  })

  it('a way the Track type does not offer is an error naming those it does', () => {
    expect(refusal('tag', 'variant', {}, 'HP')).toBe('"T" is a variant track, which offers color-by none and info, not tag.')
    expect(refusal('info', 'alignment', {}, 'AF')).toBe(
      '"T" is an alignment track, which offers color-by none, strand, firstOfPairStrand, pairOrientation, tlen, unexpectedPair and tag, not info.',
    )
    expect(refusal('strand', 'annotation', { igvType: 'snp' })).toBe('"T" is an SNP annotation track, which offers color-by function and class, not strand.')
  })

  it.each([
    ['wig', '"T" is a wig track, which has no color-by: its color is set by set_track_color.'],
    ['interact', '"T" is an interact track, which has no color-by: only alignment, variant and SNP annotation tracks have one. Its color is set by set_track_color.'],
    ['seg', '"T" is a seg track, which has no color-by: only alignment, variant and SNP annotation tracks have one.'],
    ['sequence', 'The sequence track has no color-by.'],
  ])('a %s track has none', (type, error) => {
    expect(refusal('none', type)).toBe(error)
  })

  it('all with no track that offers it is an error', () => {
    expect(colorByTool(colorByAsked({ by: 'class' }), live({})).none).toBe('No track offers color-by class: only SNP annotation tracks do.')
    expect(colorByTool(colorByAsked({ by: 'none' }), live({})).none).toBe('No track offers color-by none: only alignment and variant tracks do.')
  })
})

describe('the note on a color-by', () => {
  it('is none when any track took it', () => {
    expect(colorByNote({ by: 'strand' }, [{ name: 'A', unchanged: false }, { name: 'B', unchanged: true }])).toBeUndefined()
  })

  it('says so when every track already had it, with its tag', () => {
    expect(colorByNote({ by: 'strand' }, [{ name: 'A', unchanged: true }])).toBe('"A" already had color-by strand, so nothing changed.')
    expect(colorByNote({ by: 'tag', tag: 'HP' }, [{ name: 'A', unchanged: true }, { name: 'B', unchanged: true }])).toBe(
      '"A" and "B" already had color-by tag HP, so nothing changed.',
    )
  })
})
