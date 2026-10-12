/**
 * Addressing a track of the Session summary, by its name or by its position
 * in the list the model was given.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { addressTrack } from '../src/trackAddress.ts'

const TRACKS: TrackSummary[] = [
  { name: 'sequence', type: 'sequence', height: 25 },
  { name: 'Refseq All', type: 'annotation', url: 'https://example.org/ncbiRefSeq.txt.gz', height: 70 },
  { name: 'K562 CTCF', type: 'wig', url: 'https://example.org/ctcf.bigWig', height: 50 },
]

const LISTED = 'The tracks are: 1. sequence; 2. Refseq All; 3. K562 CTCF.'

describe('addressing a track by position', () => {
  it.each([
    [1, 0],
    [2, 1],
    [3, 2],
  ])('position %i is counted from 1 at the top', (position, index) => {
    expect(addressTrack(TRACKS, { position })).toBe(index)
  })

  it.each([0, 4, -1, 1.5])('position %d is no track: the error lists the tracks', (position) => {
    expect(() => addressTrack(TRACKS, { position })).toThrow(`No track is at position ${position}. ${LISTED}`)
  })
})

describe('addressing a track by name', () => {
  it('finds the track of that name', () => {
    expect(addressTrack(TRACKS, { name: 'K562 CTCF' })).toBe(2)
  })

  it('takes the name as a person might type it: any case, with spaces around it', () => {
    expect(addressTrack(TRACKS, { name: ' refseq all ' })).toBe(1)
  })

  it('a name no track has is an error listing the tracks', () => {
    expect(() => addressTrack(TRACKS, { name: 'H3K27ac' })).toThrow(`No track is named "H3K27ac". ${LISTED}`)
  })

  it('does not take part of a name for the name', () => {
    expect(() => addressTrack(TRACKS, { name: 'CTCF' })).toThrow('No track is named "CTCF".')
  })

  it('a name several tracks have is an error giving their positions', () => {
    const twins = [...TRACKS, { name: 'K562 CTCF', type: 'wig', url: 'https://example.org/ctcf-rep2.bigWig', height: 50 }]

    expect(() => addressTrack(twins, { name: 'K562 CTCF' })).toThrow(
      '2 tracks are named "K562 CTCF", at positions 3 and 4. Give the position of the one meant.',
    )
  })

  it('among names that differ only in case, the one spelled exactly is the one meant', () => {
    const cased = [...TRACKS, { name: 'k562 ctcf', type: 'wig', height: 50 }]

    expect(addressTrack(cased, { name: 'k562 ctcf' })).toBe(3)
  })
})

describe('an address that is not one track', () => {
  it('with neither a name nor a position is an error listing the tracks', () => {
    expect(() => addressTrack(TRACKS, {})).toThrow(`Give the track's name or its position. ${LISTED}`)
  })

  it('an empty name is a name left out', () => {
    expect(addressTrack(TRACKS, { name: '', position: 2 })).toBe(1)
  })

  it('with both a name and a position is an error, even when they agree', () => {
    expect(() => addressTrack(TRACKS, { name: 'Refseq All', position: 2 })).toThrow(
      "Give the track's name or its position, not both.",
    )
  })

  it('when there are no tracks, says so', () => {
    expect(() => addressTrack([], { position: 1 })).toThrow('No track is at position 1. There are no tracks.')
  })
})
