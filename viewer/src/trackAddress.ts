import type { TrackAddress, TrackSelection, TrackSummary } from './protocol.ts'

function listed(tracks: TrackSummary[]): string {
  if (tracks.length === 0) return 'There are no tracks.'
  return `The tracks are: ${tracks.map((track, index) => `${index + 1}. ${track.name}`).join('; ')}.`
}

function folded(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * The track of the Session summary that `address` means, as its index in
 * `tracks`. Pure. An address that is not exactly one track is an error whose
 * message the model is given: it lists the tracks, so the model can try again.
 */
export function addressTrack(tracks: TrackSummary[], { name, position }: TrackAddress): number {
  // An empty string is an argument left out.
  const named = name !== undefined && name.trim() !== ''
  if (named && position !== undefined) throw new Error("Give the track's name or its position, not both.")

  if (position !== undefined) {
    if (!Number.isInteger(position) || position < 1 || position > tracks.length) {
      throw new Error(`No track is at position ${position}. ${listed(tracks)}`)
    }
    return position - 1
  }

  if (!named) throw new Error(`Give the track's name or its position. ${listed(tracks)}`)

  const indexesWhere = (matches: (track: TrackSummary) => boolean) => tracks.flatMap((track, index) => (matches(track) ? [index] : []))
  // The name as it is spelled, and failing that as a person might type it.
  let found = indexesWhere((track) => track.name === name)
  if (found.length === 0) found = indexesWhere((track) => folded(track.name) === folded(name))

  if (found.length === 0) throw new Error(`No track is named "${name}". ${listed(tracks)}`)
  if (found.length > 1) {
    const positions = found.map((index) => index + 1)
    throw new Error(
      `${found.length} tracks are named "${name}", at positions ${positions.slice(0, -1).join(', ')} and ${positions.at(-1)}. Give the position of the one meant.`,
    )
  }
  return found[0]
}

/**
 * The tracks of the Session summary that `selection` means, as their indexes
 * in `tracks`, top to bottom. Pure. Every name and position must be one track:
 * the first that is not is the error, as `addressTrack` gives it.
 */
export function addressTracks(tracks: TrackSummary[], { names = [], positions = [], all = false }: TrackSelection): number[] {
  const some = names.length > 0 || positions.length > 0
  if (all && some) throw new Error("Give all, or the tracks' names or positions, not both.")
  if (all) return tracks.map((_, index) => index)
  if (!some) throw new Error(`Give the tracks' names or positions, or all for every track. ${listed(tracks)}`)

  const found = [...names.map((name) => addressTrack(tracks, { name })), ...positions.map((position) => addressTrack(tracks, { position }))]
  return [...new Set(found)].sort((a, b) => a - b)
}
