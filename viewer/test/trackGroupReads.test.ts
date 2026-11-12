/**
 * How group_reads groups an alignment track's reads, and the tracks it groups, as igv.js's
 * own "Group by" menu does.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import type { LiveTrack } from '../src/trackTools.ts'
import { groupReadsAsked, groupReadsNote, groupReadsTool } from '../src/trackGroupReads.ts'

describe('the grouping of one call', () => {
  it('is a way of grouping, with a read tag for tag', () => {
    expect(groupReadsAsked({ by: 'chimeric' })).toEqual({ by: 'chimeric' })
    expect(groupReadsAsked({ by: 'tag', tag: 'RG' })).toEqual({ by: 'tag', tag: 'RG' })
  })

  it('a way igv.js does not group by is an error naming those it does', () => {
    expect(() => groupReadsAsked({ by: 'phase' })).toThrow(
      '"phase" is no grouping: give none, strand, firstOfPairStrand, pairOrientation, mateChr, chimeric, supplementary, readOrder or tag.',
    )
  })

  it('tag needs a read tag, and nothing else takes one', () => {
    expect(() => groupReadsAsked({ by: 'tag' })).toThrow('Grouping by tag needs a tag: the read tag to group by, such as RG.')
    expect(() => groupReadsAsked({ by: 'tag', tag: 'R' })).toThrow('"R" is no read tag: a read tag is two characters, a letter then a letter or digit, such as HP.')
    expect(() => groupReadsAsked({ by: 'strand', tag: 'RG' })).toThrow('A tag goes only with grouping by tag, not strand.')
  })
})

describe('the tracks whose reads can be grouped', () => {
  const track = (type: string): TrackSummary => ({ name: 'T', type, height: 50 })
  const refusal = (by: string, type: string, facts: LiveTrack = {}) => groupReadsTool(groupReadsAsked({ by, ...(by === 'tag' ? { tag: 'RG' } : {}) }), () => facts).refuse(track(type), 0)

  it("an alignment track offers those of igv.js's menu, the three of paired reads once its reads are seen to be paired", () => {
    for (const by of ['none', 'strand', 'firstOfPairStrand', 'pairOrientation', 'mateChr', 'chimeric', 'supplementary', 'readOrder', 'tag']) {
      expect(refusal(by, 'alignment', { pairs: true })).toBeUndefined()
    }
    expect(refusal('mateChr', 'alignment')).toBeUndefined()
  })

  it('a pair grouping on reads loaded and unpaired is an error naming those they offer', () => {
    expect(refusal('mateChr', 'alignment', { pairs: false })).toBe(
      '"T" has no paired reads, so its reads group by none, strand, chimeric, supplementary, readOrder and tag, not mateChr.',
    )
  })

  it.each([
    ['annotation', '"T" is an annotation track, which has no reads to group: only alignment tracks have them.'],
    ['sequence', 'The sequence track has no reads to group.'],
  ])('a %s track has no reads', (type, error) => {
    expect(refusal('strand', type)).toBe(error)
  })

  it('all with no alignment track is an error', () => {
    expect(groupReadsTool({ by: 'strand' }, () => ({})).none).toBe('No track has reads to group: only alignment tracks have them.')
  })
})

describe('the note on a grouping', () => {
  it('says so when every track already had it', () => {
    expect(groupReadsNote({ by: 'tag', tag: 'RG' }, [{ name: 'A', unchanged: true }])).toBe('"A" already had its reads grouped by tag RG, so nothing changed.')
    expect(groupReadsNote({ by: 'none' }, [{ name: 'A', unchanged: true }])).toBe('"A" already had its reads ungrouped, so nothing changed.')
    expect(groupReadsNote({ by: 'strand' }, [{ name: 'A', unchanged: true }, { name: 'B', unchanged: true }])).toBe(
      '"A" and "B" already had their reads grouped by strand, so nothing changed.',
    )
    expect(groupReadsNote({ by: 'strand' }, [{ name: 'A', unchanged: false }])).toBeUndefined()
  })
})
