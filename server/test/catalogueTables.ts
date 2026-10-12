/**
 * Small Catalogue tables shaped as igv-data has them: tab-separated, a header
 * row first, the columns and their order the real tables' own.
 */

export const DATA = 'https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/data'

/** The addresses of the hg38 tables. ENCODE and 4DN both call that genome GRCh38. */
export const ENCODE_CHIP_URL = `${DATA}/encode/GRCh38.signals.chip.txt`
export const ENCODE_SIGNALS_URL = `${DATA}/encode/GRCh38.signals.other.txt`
export const ENCODE_OTHER_URL = `${DATA}/encode/GRCh38.other.txt`
export const ENCODE_HIC_URL = `${DATA}/encode/GRCh38.hic.txt`
export const FOUR_DN_URL = `${DATA}/4dn/4dn_GRCh38_tracks.txt`

/** What igv-data answers for a table it does not have. */
export const notFound = () => new Response('404: Not Found', { status: 404 })

/** The answers to the Worker's fetches of the hg38 tables, for `serve`. The ENCODE Hi-C table is not among them: fetching it fails. */
export function hg38Catalogues(): Record<string, () => Response> {
  return {
    [ENCODE_CHIP_URL]: () => new Response(ENCODE_CHIP),
    [ENCODE_SIGNALS_URL]: () => new Response(ENCODE_SIGNALS),
    [ENCODE_OTHER_URL]: () => new Response(ENCODE_OTHER),
    [FOUR_DN_URL]: () => new Response(FOUR_DN),
  }
}

function table(header: string, rows: string[][]): string {
  return [header.replaceAll(' ', '\t'), ...rows.map((row) => row.join('\t'))].join('\n') + '\n'
}

const ENCODE_HEADER = 'ID Assembly Biosample AssayType Target BioRep TechRep OutputType Format Lab HREF Accession Experiment'

/** One ENCODE row. The file's address is relative, as the tables have it. */
export function encodeRow(accession: string, biosample: string, assay: string, target: string, outputType: string, format = 'bigWig'): string[] {
  return [
    '/experiments/ENCSR000AAA/',
    'GRCh38',
    biosample,
    assay,
    target,
    '1',
    '1_1',
    outputType,
    format,
    'Richard Myers, HAIB',
    `/files/${accession}/@@download/${accession}.${format}`,
    accession,
    'ENCSR000AAA',
  ]
}

export function encodeTable(rows: string[][]): string {
  return table(ENCODE_HEADER, rows)
}

/** More ENCODE rows than a search gives in full: 25, all with target POLR2A. */
export const MANY_ROWS = Array.from({ length: 25 }, (_, index) =>
  encodeRow(`ENCFF1${String(index).padStart(2, '0')}AAA`, 'Homo sapiens HepG2', 'ChIP-seq', 'POLR2A', 'signal p-value'),
)

export const ENCODE_CHIP = encodeTable([
  encodeRow('ENCFF001AAA', 'Homo sapiens K562', 'ChIP-seq', 'CTCF', 'fold change over control'),
  encodeRow('ENCFF002AAA', 'Homo sapiens K562', 'ChIP-seq', 'CTCF', 'signal p-value'),
  encodeRow('ENCFF003AAA', 'Homo sapiens GM12878', 'ChIP-seq', 'H3K27ac', 'fold change over control'),
  encodeRow('ENCFF004AAA', 'Homo sapiens K562', 'ChIP-seq', 'H3K27ac', 'signal p-value'),
  encodeRow('ENCFF005AAA', 'Homo sapiens GM12878', 'ChIP-seq', 'GABPA ', 'signal p-value'), // the stray space is the table's own
])

export const ENCODE_SIGNALS = encodeTable([
  encodeRow('ENCFF006AAA', 'Homo sapiens K562', 'DNase-seq', '', 'read-depth normalized signal'),
  encodeRow('ENCFF007AAA', 'Homo sapiens HepG2', 'RNA-seq', '', 'plus strand signal of all reads'),
])

export const ENCODE_OTHER = encodeTable([
  encodeRow('ENCFF008AAA', 'Homo sapiens K562', 'ChIP-seq', 'CTCF', 'IDR thresholded peaks', 'bigBed'),
  encodeRow('ENCFF009AAA', 'Homo sapiens K562', 'RNA-seq', '', 'gene quantifications', 'tsv'), // a table of numbers, not a track
])

const FOUR_DN_HEADER = 'url Project Assembly Type Biosource Assay Replicate Dataset Description Lab Publications Accession Experiment name color altColor'

function fourDnRow(accession: string, extension: string, type: string, biosource: string, enzyme: string, name: string): string[] {
  return [
    `https://4dn-open-data-public.s3.amazonaws.com/fourfront-webprod/wfoutput/${accession}.${extension}`,
    '4DN',
    'GRCh38',
    type,
    biosource,
    enzyme,
    'merged replicates',
    `Hi-C on ${biosource}`,
    '',
    'Job Dekker, UMMS',
    'Rao SS et al. (2014) PMID:25497547',
    accession,
    'DNES0000AAA',
    name,
    'rgb(249,88,148)',
    'rgb(213,144,182)',
  ]
}

export const FOUR_DN = table(FOUR_DN_HEADER, [
  fourDnRow('4DNFI001AAA', 'hic', 'contact matrix', 'K562 cell', 'MboI', ''),
  fourDnRow('4DNFI002AAA', 'bw', 'compartments', 'K562 cell', 'MboI', 'compartments for K562 cell in situ Hi-C MboI'),
  fourDnRow('4DNFI003AAA', 'bed.gz', 'boundaries', 'HUVEC cell', 'DpnII', 'boundaries for HUVEC cell in situ Hi-C DpnII'),
  fourDnRow('4DNFI004AAA', 'bw', 'insulation score-diamond', 'H1-hESC (Tier 1)', 'DpnII', 'insulation score-diamond for H1-hESC (Tier 1) in situ Hi-C DpnII'),
])
