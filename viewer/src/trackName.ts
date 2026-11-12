import type { TrackSummary } from './protocol.ts'

/** The name to give a track for `asked`. Pure. igv.js's own dialog names a track left blank "untitled"; asked through a model, a blank is a mistake. */
export function newTrackName(asked: string): string {
  const name = asked.trim()
  if (name === '') throw new Error("Give the track's new name as newName.")
  return name
}

/** Whether `track` can be renamed: igv.js offers "Set track name" on every track but the sequence track. Pure. */
export function checkRenamable(track: TrackSummary): void {
  if (track.type === 'sequence') throw new Error("The sequence track's name cannot be set.")
}

/** The note for a reply when a track already had the name asked for, so nothing changed (ADR 0006). Pure. */
export function renameNote(from: string, to: string): string | undefined {
  return from === to ? `The track was already named "${to}", so nothing changed.` : undefined
}
