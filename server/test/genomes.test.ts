/**
 * The genome list the server reads: igv.org's, or igv.js's own backup of it
 * when igv.org will not answer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { genomeListSource, lookUpGenome } from '../src/genomes.ts'
import { GENOME_LIST, GENOME_LIST_URL, serve } from './genomeList.ts'

const BACKUP_URL = 'https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/genomes/web/genomes.json'
const HOUR = 60 * 60 * 1000

const forbidden = () => new Response('403 Forbidden', { status: 403 })
const NAMES = [
  { id: 'hs1', name: 'Human (T2T CHM13-v2.0/hs1)' },
  { id: 'hg38', name: 'Human (GRCh38/hg38)' },
  { id: 'mm10', name: 'Mouse (GRCm38/mm10)' },
  { id: 'rn7', name: 'Rat (rn7)' },
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the genome list', () => {
  it("is igv.org's, with each genome's id and name", async () => {
    serve({ [GENOME_LIST_URL]: () => Response.json(GENOME_LIST) })

    expect(await genomeListSource()()).toEqual(NAMES)
  })

  it("is igv.js's backup list when igv.org refuses", async () => {
    serve({ [GENOME_LIST_URL]: forbidden, [BACKUP_URL]: () => Response.json([{ id: 'mm39', name: 'Mouse (GRCm39/mm39)' }]) })

    expect(await genomeListSource()()).toEqual([{ id: 'mm39', name: 'Mouse (GRCm39/mm39)' }])
  })

  it('is fetched once and kept for an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const fetched = serve({ [GENOME_LIST_URL]: () => Response.json(GENOME_LIST) })
    const listGenomes = genomeListSource()

    await listGenomes()
    vi.setSystemTime(Date.now() + HOUR - 1)
    await listGenomes()
    expect(fetched).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 1)
    await listGenomes()
    expect(fetched).toHaveBeenCalledTimes(2)
  })

  it('from before is used when the hour is up and neither address answers', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    serve({ [GENOME_LIST_URL]: () => Response.json(GENOME_LIST) })
    const listGenomes = genomeListSource()
    await listGenomes()

    vi.setSystemTime(Date.now() + HOUR)
    serve({ [GENOME_LIST_URL]: forbidden, [BACKUP_URL]: forbidden })

    expect(await listGenomes()).toEqual(NAMES)
  })

  it('names a genome that has no name by its id', async () => {
    serve({ [GENOME_LIST_URL]: () => Response.json([{ id: 'ce11' }]) })

    expect(await genomeListSource()()).toEqual([{ id: 'ce11', name: 'ce11' }])
  })

  it('that neither address gives is an error, and the next call tries again', async () => {
    serve({ [GENOME_LIST_URL]: forbidden, [BACKUP_URL]: forbidden })
    const listGenomes = genomeListSource()
    await expect(listGenomes()).rejects.toThrow()

    serve({ [GENOME_LIST_URL]: () => Response.json(GENOME_LIST) })
    expect(await listGenomes()).toEqual(NAMES)
  })
})

describe('looking a genome up', () => {
  it('when the list cannot be read, says so instead of calling the genome unavailable', async () => {
    const lookup = await lookUpGenome('mm10', () => Promise.reject(new Error('offline')))

    expect(lookup).toEqual({
      unavailable: 'the igv.org genome list could not be read, so it is not known whether that genome is available. Try again.',
    })
  })
})
