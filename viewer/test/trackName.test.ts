/** The name rename_track gives a track. */
import { describe, it, expect } from 'vitest'
import { checkRenamable, newTrackName, renameNote } from '../src/trackName.ts'

describe('a new name', () => {
  it('is the name asked for, without the spaces around it', () => {
    expect(newTrackName('  K562 CTCF ')).toBe('K562 CTCF')
  })

  it.each(['', '   '])('%j is no name', (asked) => {
    expect(() => newTrackName(asked)).toThrow("Give the track's new name as newName.")
  })
})

describe('the tracks that can be renamed', () => {
  it('every track but the sequence track, as igv.js offers "Set track name"', () => {
    expect(() => checkRenamable({ name: 'Copy number', type: 'seg', height: 50 })).not.toThrow()
    expect(() => checkRenamable({ name: 'sequence', type: 'sequence', height: 25 })).toThrow("The sequence track's name cannot be set.")
  })
})

describe('the note when a rename changed nothing', () => {
  it('a track already so named', () => {
    expect(renameNote('Conservation', 'Conservation')).toBe('The track was already named "Conservation", so nothing changed.')
  })

  it('none for a new name, or one that differs only in case', () => {
    expect(renameNote('Conservation', 'PhyloP')).toBeUndefined()
    expect(renameNote('conservation', 'Conservation')).toBeUndefined()
  })
})
