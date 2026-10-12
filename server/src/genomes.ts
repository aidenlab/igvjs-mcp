/** The igv.org genome list: the genomes igv.js knows by id, and so the ones igv-bot can show. */
const GENOME_LIST_URL = 'https://igv.org/genomes/genomes3.json'

/**
 * igv.js's own backup of the list, which it reads when igv.org does not
 * answer. igv.org refuses requests that do not come from a browser, a Worker's
 * among them, so this is the one the deployed server ends up reading.
 */
const BACKUP_GENOME_LIST_URL = 'https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/genomes/web/genomes.json'

/** How long a fetched list is used before it is fetched again. */
const LIST_TTL_MS = 60 * 60 * 1000

/** One genome of the list: the fields the server reads. The list carries many more, which igv.js reads for itself. */
export interface Genome {
  id: string
  name: string
}

async function fetchList(url: string): Promise<Genome[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return (await response.json<Genome[]>()).map(({ id, name }) => ({ id, name: name.trim() }))
}

/**
 * Gives the genome list, fetched from igv.org or else from the backup, and
 * kept for an hour. A list that neither address gives is an error, and the
 * next call fetches again.
 */
export function genomeListSource(): () => Promise<Genome[]> {
  let kept: { genomes: Genome[]; fetchedAt: number } | undefined
  return async () => {
    if (kept && Date.now() - kept.fetchedAt < LIST_TTL_MS) return kept.genomes
    const genomes = await fetchList(GENOME_LIST_URL).catch(() => fetchList(BACKUP_GENOME_LIST_URL))
    kept = { genomes, fetchedAt: Date.now() }
    return genomes
  }
}

/** What became of a genome a model asked for: the id as the list spells it, or why it cannot be shown. */
export type GenomeLookup = { id: string } | { unavailable: string }

/**
 * Looks `asked` up on the genome list by id, as a model or person may give it:
 * in any case, with spaces around it.
 */
export async function lookUpGenome(asked: string, listGenomes: () => Promise<Genome[]>): Promise<GenomeLookup> {
  let genomes: Genome[]
  try {
    genomes = await listGenomes()
  } catch (error) {
    console.error('[genomes] the genome list could not be read:', error)
    return { unavailable: 'the igv.org genome list could not be read, so it is not known whether that genome is available. Try again.' }
  }
  const wanted = asked.trim().toLowerCase()
  const genome = genomes.find(({ id }) => id.toLowerCase() === wanted)
  if (genome) return { id: genome.id }
  const available = genomes.map(({ id, name }) => `${id} (${name})`).join('; ')
  return { unavailable: `the genome "${asked}" is not available: it is not on the igv.org genome list. The genomes available are: ${available}.` }
}
