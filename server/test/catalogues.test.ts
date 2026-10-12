/**
 * Searching the ENCODE and 4DN Catalogues, against small tables shaped as
 * igv-data has them.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { catalogueSource, readCatalogueTable, searchCatalogues, type CatalogueQuery } from '../src/catalogues.ts'
import {
  DATA,
  ENCODE_CHIP,
  ENCODE_CHIP_URL,
  ENCODE_HIC_URL,
  ENCODE_OTHER,
  ENCODE_OTHER_URL,
  ENCODE_SIGNALS,
  ENCODE_SIGNALS_URL,
  FOUR_DN,
  FOUR_DN_URL,
  encodeRow,
  encodeTable,
  hg38Catalogues,
  notFound,
} from './catalogueTables.ts'
import { serve } from './genomeList.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const TABLES = [
  readCatalogueTable('ENCODE', ENCODE_CHIP),
  readCatalogueTable('ENCODE', ENCODE_SIGNALS),
  readCatalogueTable('ENCODE', ENCODE_OTHER),
  readCatalogueTable('4DN', FOUR_DN),
]

/** The accessions of the rows a search gives, in order. */
function found(query: CatalogueQuery): string[] {
  return searchCatalogues(TABLES, query).rows.map((row) => row.accession)
}

describe('free text', () => {
  it('finds the rows that carry every word, whichever column each word is in', () => {
    expect(found({ text: 'CTCF K562' })).toEqual(['ENCFF001AAA', 'ENCFF002AAA', 'ENCFF008AAA'])
  })

  it.each(['H3K27ac', 'h3k27ac', 'H3-K27ac'])('ignores case and punctuation: %s finds the same rows', (text) => {
    expect(found({ text })).toEqual(['ENCFF003AAA', 'ENCFF004AAA'])
  })

  it('ignores the punctuation of the table too', () => {
    expect(found({ text: 'chipseq gm12878' })).toEqual(['ENCFF003AAA', 'ENCFF005AAA'])
  })
})

describe('Hi-C', () => {
  it('a 4DN contact matrix is never found: igv-bot cannot show one', () => {
    expect(found({ text: '4DNFI001AAA' })).toEqual([])
    expect(found({ text: 'K562 MboI' })).toEqual(['4DNFI002AAA'])
  })
})

describe('a filter', () => {
  it.each<[CatalogueQuery, string[]]>([
    [{ biosample: 'k562' }, ['ENCFF001AAA', 'ENCFF002AAA', 'ENCFF004AAA', 'ENCFF006AAA', 'ENCFF008AAA', '4DNFI002AAA']],
    [{ assay: 'RNA-seq' }, ['ENCFF007AAA']],
    [{ target: 'ctcf' }, ['ENCFF001AAA', 'ENCFF002AAA', 'ENCFF008AAA']],
    [{ outputType: 'fold change' }, ['ENCFF001AAA', 'ENCFF003AAA']],
    [{ outputType: 'Compartments' }, ['4DNFI002AAA']],
  ])('%j finds the rows whose column of that name carries its words', (query, accessions) => {
    expect(found(query)).toEqual(accessions)
  })

  it('reads its own column only: a target is not found as a biosample', () => {
    expect(found({ biosample: 'CTCF' })).toEqual([])
  })

  it('ignores case and punctuation, as free text does', () => {
    expect(found({ assay: 'dnase seq' })).toEqual(['ENCFF006AAA'])
    expect(found({ target: 'H3-K27AC' })).toEqual(['ENCFF003AAA', 'ENCFF004AAA'])
  })

  it('for a target finds nothing in 4DN, whose table names none', () => {
    expect(found({ target: 'hesc' })).toEqual([])
  })

  it("for an assay reads the 4DN dataset as well, since that table's Assay column holds the enzyme", () => {
    expect(found({ assay: 'Hi-C' })).toEqual(['4DNFI002AAA', '4DNFI003AAA', '4DNFI004AAA'])
    expect(found({ assay: 'DpnII' })).toEqual(['4DNFI003AAA', '4DNFI004AAA'])
  })

  it('narrows free text and the other filters: every part given must match', () => {
    expect(found({ text: 'K562', target: 'H3K27ac', outputType: 'signal' })).toEqual(['ENCFF004AAA'])
  })
})

describe('a row found', () => {
  it('from ENCODE is the whole row, with the file address made absolute on encodeproject.org', () => {
    expect(searchCatalogues(TABLES, { text: 'ENCFF005AAA' }).rows).toEqual([
      {
        catalogue: 'ENCODE',
        name: 'Homo sapiens GM12878 GABPA',
        url: 'https://www.encodeproject.org/files/ENCFF005AAA/@@download/ENCFF005AAA.bigWig',
        biosample: 'Homo sapiens GM12878',
        assay: 'ChIP-seq',
        target: 'GABPA',
        outputType: 'signal p-value',
        format: 'bigWig',
        lab: 'Richard Myers, HAIB',
        accession: 'ENCFF005AAA',
        experiment: 'ENCSR000AAA',
        bioRep: '1',
        techRep: '1_1',
      },
    ])
  })

  it('from ENCODE is named by its assay when that is not ChIP-seq, and has no target when the table gives none', () => {
    const [row] = searchCatalogues(TABLES, { text: 'ENCFF006AAA' }).rows

    expect(row.name).toBe('Homo sapiens K562 DNase-seq')
    expect(row).not.toHaveProperty('target')
  })

  it("from 4DN is the whole row, with the table's own address, name and colours", () => {
    expect(searchCatalogues(TABLES, { text: '4DNFI003AAA' }).rows).toEqual([
      {
        catalogue: '4DN',
        name: 'boundaries for HUVEC cell in situ Hi-C DpnII',
        url: 'https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/4DNFI003AAA.bed.gz',
        biosample: 'HUVEC cell',
        assay: 'DpnII',
        outputType: 'boundaries',
        project: '4DN',
        replicate: 'merged replicates',
        dataset: 'Hi-C on HUVEC cell',
        lab: 'Job Dekker, UMMS',
        publications: 'Rao SS et al. (2014) PMID:25497547',
        accession: '4DNFI003AAA',
        experiment: 'DNES0000AAA',
        color: 'rgb(249,88,148)',
        altColor: 'rgb(213,144,182)',
      },
    ])
  })
})

describe('a search that matches many rows', () => {
  const many = Array.from({ length: 25 }, (_, index) => encodeRow(`ENCFF1${String(index).padStart(2, '0')}AAA`, 'Homo sapiens HepG2', 'ChIP-seq', 'POLR2A', 'signal p-value'))
  const tables = [readCatalogueTable('ENCODE', encodeTable(many)), readCatalogueTable('4DN', FOUR_DN)]

  it('gives the first 20 rows and the count of them all', () => {
    const matches = searchCatalogues(tables, { target: 'POLR2A' })

    expect(matches.rows.map((row) => row.accession)).toEqual(many.slice(0, 20).map((row) => row[11]))
    expect(matches.total).toBe(25)
  })

  it('gives the rows that carry the words whole before those that carry them inside a longer word: CTCF before CTCFL', () => {
    const ctcfl = Array.from({ length: 19 }, (_, index) => encodeRow(`ENCFF2${String(index).padStart(2, '0')}AAA`, 'Homo sapiens K562', 'ChIP-seq', 'CTCFL', 'signal p-value'))
    const ctcf = [
      encodeRow('ENCFF300AAA', 'Homo sapiens K562', 'ChIP-seq', 'CTCF', 'signal p-value'),
      encodeRow('ENCFF301AAA', 'Homo sapiens K562', 'ChIP-seq', 'CTCF', 'fold change over control'),
    ]

    const matches = searchCatalogues([readCatalogueTable('ENCODE', encodeTable([...ctcfl, ...ctcf]))], { text: 'k562', target: 'ctcf' })

    expect(matches.total).toBe(21)
    expect(matches.rows.map((row) => row.accession)).toEqual(['ENCFF300AAA', 'ENCFF301AAA', ...ctcfl.slice(0, 18).map((row) => row[11])])
  })

  it('counts the matches of each Catalogue, so that one crowded out of the rows is still known of', () => {
    expect(searchCatalogues(tables, {})).toMatchObject({ total: 28, totals: { ENCODE: 25, '4DN': 3 } })
    expect(searchCatalogues(tables, { text: 'boundaries' })).toMatchObject({ total: 1, totals: { ENCODE: 0, '4DN': 1 } })
  })
})

describe('the tables of a genome', () => {
  const HOUR = 60 * 60 * 1000

  /** The addresses fetched so far, in order. */
  function addresses(fetched: ReturnType<typeof serve>): string[] {
    return fetched.mock.calls.map(([input]) => String(input))
  }

  it('are the three ENCODE tables and the 4DN table igv-webapp reads, and never the ENCODE Hi-C table', async () => {
    const fetched = serve({ ...hg38Catalogues(), [ENCODE_HIC_URL]: notFound })

    const tables = await catalogueSource()('hg38')

    expect(addresses(fetched)).toEqual([ENCODE_CHIP_URL, ENCODE_SIGNALS_URL, ENCODE_OTHER_URL, FOUR_DN_URL])
    expect(searchCatalogues(tables, {}).totals).toEqual({ ENCODE: 8, '4DN': 3 })
  })

  it('are asked for under the name each Catalogue gives the genome', async () => {
    const fetched = serve({
      [`${DATA}/encode/mm10.signals.chip.txt`]: () => new Response(ENCODE_CHIP),
      [`${DATA}/encode/mm10.signals.other.txt`]: notFound,
      [`${DATA}/encode/mm10.other.txt`]: notFound,
      [`${DATA}/4dn/4dn_GRCm38_tracks.txt`]: () => new Response(FOUR_DN),
    })

    await catalogueSource()('mm10')

    expect(fetched).toHaveBeenCalledTimes(4)
  })

  it('leave out a table igv-data does not have: its Catalogue has that much less for the genome', async () => {
    serve({ ...hg38Catalogues(), [ENCODE_SIGNALS_URL]: notFound, [FOUR_DN_URL]: notFound })

    const tables = await catalogueSource()('hg38')

    expect(searchCatalogues(tables, {}).totals).toEqual({ ENCODE: 6, '4DN': 0 })
  })

  it('are fetched once and kept for an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const fetched = serve(hg38Catalogues())
    const listTables = catalogueSource()

    await listTables('hg38')
    vi.setSystemTime(Date.now() + HOUR - 1)
    await listTables('hg38')
    expect(fetched).toHaveBeenCalledTimes(4)

    vi.setSystemTime(Date.now() + 1)
    await listTables('hg38')
    expect(fetched).toHaveBeenCalledTimes(8)
  })

  it('are fetched once for searches that arrive together', async () => {
    const fetched = serve(hg38Catalogues())
    const listTables = catalogueSource()

    await Promise.all([listTables('hg38'), listTables('hg38')])

    expect(fetched).toHaveBeenCalledTimes(4)
  })

  it('that cannot all be read are an error, and the next search fetches again', async () => {
    serve({ ...hg38Catalogues(), [ENCODE_OTHER_URL]: () => new Response('503', { status: 503 }) })
    const listTables = catalogueSource()
    await expect(listTables('hg38')).rejects.toThrow()

    serve(hg38Catalogues())
    expect(searchCatalogues(await listTables('hg38'), {}).total).toBe(11)
  })
})
