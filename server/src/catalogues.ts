/** The Catalogues the model searches: the tables of tracks igv-webapp offers from each provider. */
export type CatalogueName = 'ENCODE' | '4DN'

/** The filters of a search: each reads one kind of column, whatever a Catalogue's table calls it. */
const FILTERS = ['biosample', 'assay', 'target', 'outputType'] as const
type Filter = (typeof FILTERS)[number]

/** What a search asks for. Every part given must match; a part left out matches every row. */
export type CatalogueQuery = {
  /** Free text: every word must be somewhere in the row. */
  text?: string
} & { [filter in Filter]?: string }

/** One row of a Catalogue as the model is given it: a track igv.js can load from `url`, with the row's other columns. */
export interface CatalogueRow {
  catalogue: CatalogueName
  /** What to call the track. */
  name: string
  url: string
  accession: string
  [column: string]: string
}

/**
 * One table of a Catalogue. Its rows are kept as the lines of the file and
 * split into columns only when a search reads them: the ENCODE tables for one
 * genome hold some 190,000 rows, and a Worker has 128 MB.
 */
export interface CatalogueTable {
  catalogue: CatalogueName
  /** Column index by header name. */
  columns: Map<string, number>
  lines: string[]
}

/** The 4DN rows that are Hi-C contact matrices, which igv.js does not draw, by what their Type column says. */
const CONTACT_MATRIX = 'contact matrix'

/**
 * Reads a table as igv-data has it: tab-separated, a header row first. The
 * contact matrices of 4DN are left out here, so no search ever finds one.
 */
export function readCatalogueTable(catalogue: CatalogueName, text: string): CatalogueTable {
  const [header = '', ...lines] = text.split('\n')
  const columns = new Map(header.split('\t').map((name, index) => [name.trim(), index]))
  const type = columns.get('Type') ?? -1
  const shown = (line: string) => catalogue !== '4DN' || line.split('\t')[type]?.trim().toLowerCase() !== CONTACT_MATRIX
  return { catalogue, columns, lines: lines.filter((line) => line.trim() !== '' && shown(line)) }
}

/** Text as it is matched: lower case, without punctuation. */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]+/g, '')
}

function words(text: string | undefined): string[] {
  return fold(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
}

/** Where ENCODE's files are: its tables give each file's address relative to this. */
const ENCODE_ORIGIN = 'https://www.encodeproject.org'

/** How one Catalogue's table is read: which column each field of a row comes from, and how a row gets its address and name. */
interface Layout {
  /** Field of a `CatalogueRow` → the column it is read from. The fields a search filters on are named alike in every Catalogue. */
  fields: Record<string, string>
  /** The columns each filter reads. */
  filters: Record<Filter, string[]>
  url: (fields: Record<string, string>, cell: (column: string) => string) => string
  name: (fields: Record<string, string>, cell: (column: string) => string) => string
}

const LAYOUTS: Record<CatalogueName, Layout> = {
  ENCODE: {
    fields: {
      biosample: 'Biosample',
      assay: 'AssayType',
      target: 'Target',
      outputType: 'OutputType',
      format: 'Format',
      lab: 'Lab',
      accession: 'Accession',
      experiment: 'Experiment',
      bioRep: 'BioRep',
      techRep: 'TechRep',
    },
    filters: { biosample: ['Biosample'], assay: ['AssayType'], target: ['Target'], outputType: ['OutputType'] },
    url: (_, cell) => ENCODE_ORIGIN + cell('HREF'),
    // The name igv-webapp gives an ENCODE track.
    name: ({ biosample, assay, target }) => [biosample, target, assay.toLowerCase() === 'chip-seq' ? '' : assay].filter(Boolean).join(' '),
  },
  '4DN': {
    fields: {
      biosample: 'Biosource',
      assay: 'Assay',
      outputType: 'Type',
      project: 'Project',
      replicate: 'Replicate',
      dataset: 'Dataset',
      description: 'Description',
      lab: 'Lab',
      publications: 'Publications',
      accession: 'Accession',
      experiment: 'Experiment',
      color: 'color',
      altColor: 'altColor',
    },
    // Assay holds the restriction enzyme; that the assay is Hi-C is said in Dataset. The table names no targets.
    filters: { biosample: ['Biosource'], assay: ['Assay', 'Dataset'], target: [], outputType: ['Type'] },
    url: (_, cell) => cell('url'),
    name: ({ outputType, biosample }, cell) => cell('name') || `${outputType} for ${biosample}`,
  },
}

/** A line of a table as the row the model is given. A column the table leaves empty is left out. */
function rowOf(table: CatalogueTable, line: string): CatalogueRow {
  const cells = line.split('\t')
  const cell = (column: string) => (cells[table.columns.get(column) ?? -1] ?? '').trim()
  const layout = LAYOUTS[table.catalogue]
  const fields: Record<string, string> = {}
  for (const [field, column] of Object.entries(layout.fields)) fields[field] = cell(column)
  const row: CatalogueRow = { catalogue: table.catalogue, name: layout.name(fields, cell), url: layout.url(fields, cell), accession: fields.accession }
  for (const [field, value] of Object.entries(fields)) if (value) row[field] = value
  return row
}

/** How many rows a search gives in full. A model can load from these, and narrows the search when the count shows there are more. */
const MAX_ROWS = 20

/** What a search found: how many rows match, in all and in each Catalogue, and the first of them. */
export interface CatalogueMatches {
  total: number
  totals: Record<CatalogueName, number>
  /** At most `MAX_ROWS`: the rows that carry every word whole, then those that carry one inside a longer word, each in the order of the tables. */
  rows: CatalogueRow[]
}

/**
 * Searches `tables` for the rows that match every part of `query`. A word
 * matches wherever it appears, inside a longer word too, with case and
 * punctuation ignored on both sides: "h3k27ac" finds "H3K27ac" and "H3-K27ac".
 * The rows that carry every word whole are given first, so that "CTCF" is not
 * answered with twenty rows of CTCFL.
 */
export function searchCatalogues(tables: CatalogueTable[], query: CatalogueQuery): CatalogueMatches {
  const textWords = words(query.text)
  const filters = FILTERS.map((filter) => ({ filter, words: words(query[filter]) })).filter((filter) => filter.words.length > 0)
  // A filter's words are in its column, so they are in the line: most lines are passed over without being split.
  const everyWord = [...textWords, ...filters.flatMap((filter) => filter.words)]
  const totals: Record<CatalogueName, number> = { ENCODE: 0, '4DN': 0 }
  const whole: CatalogueRow[] = []
  const partial: CatalogueRow[] = []
  for (const table of tables) {
    const read = filters.map(({ filter, words }) => ({
      words,
      columns: LAYOUTS[table.catalogue].filters[filter].map((column) => table.columns.get(column) ?? -1),
    }))
    for (const line of table.lines) {
      const folded = fold(line)
      if (!everyWord.every((word) => folded.includes(word))) continue
      if (read.length > 0) {
        // Folding leaves the tabs between columns where they were.
        const cells = folded.split('\t')
        const inColumns = read.every(({ words, columns }) => {
          const text = columns.map((column) => cells[column] ?? '').join(' ')
          return words.every((word) => text.includes(word))
        })
        if (!inColumns) continue
      }
      totals[table.catalogue]++
      if (whole.length >= MAX_ROWS) continue
      const spaced = ` ${folded.replace(/\s+/g, ' ')} `
      if (everyWord.every((word) => spaced.includes(` ${word} `))) whole.push(rowOf(table, line))
      else if (partial.length < MAX_ROWS) partial.push(rowOf(table, line))
    }
  }
  return { total: totals.ENCODE + totals['4DN'], totals, rows: [...whole, ...partial].slice(0, MAX_ROWS) }
}

/** Where igv-data keeps the tables igv-webapp reads. */
const TABLES_URL = 'https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/data'

/** The genomes ENCODE and 4DN name differently from the igv.org genome list, by their id on that list. Any other genome goes by its id. */
const ENCODE_GENOMES: Record<string, string> = { hg38: 'GRCh38', hg38_1kg: 'GRCh38', mm39: 'GRCm39' }
const FOUR_DN_GENOMES: Record<string, string> = { hg38: 'GRCh38', hg38_1kg: 'GRCh38', mm10: 'GRCm38', danRer11: 'GRCz11' }

/**
 * The tables searched for `genome`, in the order their rows are given: ENCODE's
 * signals before its peaks and other files, then 4DN. ENCODE's Hi-C table,
 * `<genome>.hic.txt`, is not among them: igv.js does not draw contact matrices.
 */
function tableAddresses(genome: string): Array<{ catalogue: CatalogueName; url: string }> {
  const encode = ENCODE_GENOMES[genome] ?? genome
  const fourDn = FOUR_DN_GENOMES[genome] ?? genome
  return [
    { catalogue: 'ENCODE', url: `${TABLES_URL}/encode/${encode}.signals.chip.txt` },
    { catalogue: 'ENCODE', url: `${TABLES_URL}/encode/${encode}.signals.other.txt` },
    { catalogue: 'ENCODE', url: `${TABLES_URL}/encode/${encode}.other.txt` },
    { catalogue: '4DN', url: `${TABLES_URL}/4dn/4dn_${fourDn}_tracks.txt` },
  ]
}

/** How long a table is given to arrive. The largest is over 20 MB. */
const FETCH_TIMEOUT_MS = 20_000

/** How long fetched tables are used before they are fetched again. */
const TABLES_TTL_MS = 60 * 60 * 1000

/** A table igv-data does not have is an empty one: not every Catalogue has every kind of table for every genome. */
async function fetchTable({ catalogue, url }: { catalogue: CatalogueName; url: string }): Promise<CatalogueTable> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (response.status === 404) return readCatalogueTable(catalogue, '')
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return readCatalogueTable(catalogue, await response.text())
}

/**
 * Gives the Catalogue tables of a genome, fetched from igv-data and kept for
 * an hour. Only the genome last asked for is kept: one genome's tables are tens
 * of megabytes. Tables that cannot all be read are an error, and the next call
 * fetches again.
 */
export function catalogueSource(): (genome: string) => Promise<CatalogueTable[]> {
  let kept: { genome: string; tables: Promise<CatalogueTable[]>; fetchedAt: number } | undefined
  return (genome) => {
    if (kept && kept.genome === genome && Date.now() - kept.fetchedAt < TABLES_TTL_MS) return kept.tables
    const fetching = { genome, tables: Promise.all(tableAddresses(genome).map(fetchTable)), fetchedAt: Date.now() }
    kept = fetching
    fetching.tables.catch(() => {
      if (kept === fetching) kept = undefined
    })
    return fetching.tables
  }
}
