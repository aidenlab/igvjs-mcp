/**
 * The pattern every track tool shares (ADR 0005): the tracks a call is for,
 * all or nothing, and the note when all passed over some.
 */
import { describe, it, expect } from 'vitest'
import type { TrackSummary } from '../src/protocol.ts'
import { passedOverNote, trackTargets } from '../src/trackTools.ts'

const TRACKS: TrackSummary[] = [
  { name: 'sequence', type: 'sequence', height: 25 },
  { name: 'Conservation', type: 'wig', height: 50 },
  { name: 'Copy number', type: 'seg', height: 100 },
  { name: 'Refseq All', type: 'annotation', height: 70 },
]

/** A tool for wig and annotation tracks only, as altColor is. */
const ALT_COLOR = {
  refuse: (track: TrackSummary) =>
    track.type === 'wig' || track.type === 'annotation' ? undefined : `"${track.name}" is a ${track.type} track, which has no alt color.`,
  none: 'No track has an alt color.',
}

describe('the tracks a track tool is for', () => {
  it('names and positions are the tracks they address, top to bottom, when the tool applies to each', () => {
    expect(trackTargets(TRACKS, { names: ['refseq all'], positions: [2] }, ALT_COLOR)).toEqual({ targets: [1, 3], passedOver: [] })
  })

  it('one track addressed that the tool does not apply to is the error, and the call is for none', () => {
    expect(() => trackTargets(TRACKS, { positions: [2, 3] }, ALT_COLOR)).toThrow('"Copy number" is a seg track, which has no alt color.')
  })

  it('all is every track the tool applies to; the others are passed over, each with why', () => {
    expect(trackTargets(TRACKS, { all: true }, ALT_COLOR)).toEqual({
      targets: [1, 3],
      passedOver: ['"Copy number" is a seg track, which has no alt color.'],
    })
  })

  it('all passes over the sequence track without a word: no track tool applies to it', () => {
    const colored = { refuse: (track: TrackSummary) => (track.type === 'sequence' ? "The sequence track's color cannot be set." : undefined), none: 'No track has a color.' }

    expect(trackTargets(TRACKS, { all: true }, colored)).toEqual({ targets: [1, 2, 3], passedOver: [] })
  })

  it('all with no track the tool applies to is an error', () => {
    expect(() => trackTargets(TRACKS.slice(0, 1), { all: true }, ALT_COLOR)).toThrow('No track has an alt color.')
  })

  it('an address that matches no track is the error of addressing it', () => {
    expect(() => trackTargets(TRACKS, { names: ['H3K27ac'] }, ALT_COLOR)).toThrow(/^No track is named "H3K27ac"\./)
  })
})

describe('the note when all passed over tracks', () => {
  it('none passed over is no note', () => {
    expect(passedOverNote([])).toBeUndefined()
  })

  it('gives why the one was passed over', () => {
    expect(passedOverNote(['"Copy number" is a seg track, which has no alt color.'])).toBe('all passed over 1 track: "Copy number" is a seg track, which has no alt color.')
  })

  it('gives why each was passed over', () => {
    expect(passedOverNote(['"Copy number" is a seg track, which has no alt color.', '"Variants" is a variant track, which has no alt color.'])).toBe(
      'all passed over 2 tracks: "Copy number" is a seg track, which has no alt color. "Variants" is a variant track, which has no alt color.',
    )
  })
})
