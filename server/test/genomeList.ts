/**
 * The igv.org genome list as the Worker under test sees it: a few rows shaped
 * as `genomes3.json` has them, cut down to the fields the server reads.
 */
import { vi } from 'vitest'

export const GENOME_LIST_URL = 'https://igv.org/genomes/genomes3.json'

export const GENOME_LIST = [
  { id: 'hs1', name: 'Human (T2T CHM13-v2.0/hs1)' },
  { id: 'hg38', name: 'Human (GRCh38/hg38)' },
  { id: 'mm10', name: 'Mouse (GRCm38/mm10)' },
  { id: 'rn7', name: 'Rat (rn7) ' }, // the stray space is the list's own
]

/** Answers fetches from `answers`, by address; any other fetch fails. Returns the mock, which counts them. */
export function serve(answers: Record<string, () => Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!(url in answers)) throw new Error(`unexpected fetch of ${url}`)
    return answers[url]()
  })
}

/** Answers the Worker's fetch of the genome list with `GENOME_LIST`. For beforeAll. */
export function serveGenomeList() {
  serve({ [GENOME_LIST_URL]: () => Response.json(GENOME_LIST) })
}
