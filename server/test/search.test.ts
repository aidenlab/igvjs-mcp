/**
 * search_catalogues on the MCP face: the model's loose request becomes rows of
 * the ENCODE and 4DN Catalogues, for the genome igv-bot is showing.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { MessageType, type SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { DATA, ENCODE_CHIP, encodeRow, encodeTable, hg38Catalogues, notFound } from './catalogueTables.ts'
import { GENOME_LIST, GENOME_LIST_URL, serve } from './genomeList.ts'
import { callTool, type ToolResult } from './mcp.ts'
import { openViewer, join, closeViewers } from './viewers.ts'

const unreadable = () => new Response('503', { status: 503 })

/** The four tables of `genome`, each answered alike. Neither Catalogue names these genomes differently. */
function everyTable(genome: string, answer: () => Response): Record<string, () => Response> {
  return {
    [`${DATA}/encode/${genome}.signals.chip.txt`]: answer,
    [`${DATA}/encode/${genome}.signals.other.txt`]: answer,
    [`${DATA}/encode/${genome}.other.txt`]: answer,
    [`${DATA}/4dn/4dn_${genome}_tracks.txt`]: answer,
  }
}

/** More rows than a reply shows. */
const MANY = encodeTable(
  Array.from({ length: 25 }, (_, index) => encodeRow(`ENCFF1${String(index).padStart(2, '0')}AAA`, 'Drosophila melanogaster S2', 'ChIP-seq', 'POLR2A', 'signal p-value')),
)

// hg38 has every table; mm10 and dm6 one ENCODE table each; hs1 none; rn7's cannot be read.
beforeAll(() => {
  serve({
    [GENOME_LIST_URL]: () => Response.json([...GENOME_LIST, { id: 'dm6', name: 'D. melanogaster (dm6)' }]),
    ...everyTable('dm6', notFound),
    [`${DATA}/encode/dm6.signals.chip.txt`]: () => new Response(MANY),
    ...hg38Catalogues(),
    ...everyTable('mm10', notFound),
    [`${DATA}/4dn/4dn_GRCm38_tracks.txt`]: notFound,
    [`${DATA}/encode/mm10.signals.chip.txt`]: () => new Response(ENCODE_CHIP),
    ...everyTable('hs1', notFound),
    ...everyTable('rn7', unreadable),
  })
})
afterEach(closeViewers)

function summaryOn(genome: string): SessionSummary {
  return { genome, loci: ['all'], tracks: [], crosshairs: false, centreLine: false }
}

/** A Room whose Viewer has reported that it shows `genome`. */
async function roomShowing(room: string, genome: string) {
  const viewer = await openViewer(room)
  await join(viewer)
  viewer.send({ type: MessageType.SESSION, session: {}, summary: summaryOn(genome) })
  await join(viewer) // answered after the summary was taken in
}

const TRACKS = 'Tracks:\n'
const SUMMARY = '\n\nSession summary:\n'

/** The rows a reply carries. */
function tracksIn(result: ToolResult): Array<Record<string, string>> {
  const text = result.content[0].text!
  expect(text).toContain(TRACKS)
  const rows = text.slice(text.indexOf(TRACKS) + TRACKS.length).split(SUMMARY)[0]
  return JSON.parse(rows)
}

function accessionsIn(result: ToolResult): string[] {
  return tracksIn(result).map((row) => row.accession)
}

describe('search_catalogues given a genome', () => {
  it('replies with the matching rows, each with an address igv.js can load, and the count of all matches', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: 'hg38', text: 'CTCF K562' })

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toMatch(/^3 tracks match in the Catalogues for hg38 \(ENCODE 3, 4DN 0\)\.\n\nTracks:\n/)
    expect(tracksIn(result).map(({ name, url }) => ({ name, url }))).toEqual([
      { name: 'Homo sapiens K562 CTCF', url: 'https://www.encodeproject.org/files/ENCFF001AAA/@@download/ENCFF001AAA.bigWig' },
      { name: 'Homo sapiens K562 CTCF', url: 'https://www.encodeproject.org/files/ENCFF002AAA/@@download/ENCFF002AAA.bigWig' },
      { name: 'Homo sapiens K562 CTCF', url: 'https://www.encodeproject.org/files/ENCFF008AAA/@@download/ENCFF008AAA.bigBed' },
    ])
  })

  it('narrows by biosample, assay, target and output type', async () => {
    const args = { genome: 'hg38', biosample: 'K562', assay: 'ChIP-seq', target: 'H3-K27ac', outputType: 'signal p-value' }

    expect(accessionsIn(await callTool('search_catalogues', undefined, args))).toEqual(['ENCFF004AAA'])
  })

  it('searches 4DN in the same request, and never offers a contact matrix', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: 'hg38', biosample: 'K562', text: 'MboI' })

    expect(accessionsIn(result)).toEqual(['4DNFI002AAA'])
  })

  it('takes the genome in any case, as the igv.org genome list is read', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: ' HG38 ', target: 'GABPA' })

    expect(accessionsIn(result)).toEqual(['ENCFF005AAA'])
  })

  it('that is not on the igv.org genome list, replies that it is unavailable', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: 'hg99', text: 'CTCF' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/^Error: the genome "hg99" is not available: .* Nothing was searched\.$/)
  })

  it('that neither Catalogue has tables for, says so', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: 'hs1', text: 'CTCF' })

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toBe('Neither ENCODE nor 4DN has a Catalogue for hs1, so there is nothing to search.')
  })

  it('whose tables cannot be read, replies with an error that says so', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: 'rn7', text: 'CTCF' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: the Catalogues for rn7 could not be read. Try again.')
  })

  it('and words nothing carries, says that nothing matches and how matching works', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: 'hg38', text: 'K562 tracks' })

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toBe(
      'No track matches in the Catalogues for hg38. Every word of text and of each filter must be in a row: search again with fewer words.',
    )
  })
})

describe('search_catalogues given no genome', () => {
  it("searches for the genome in the Room's Session summary", async () => {
    await roomShowing('SEARCH0001', 'mm10')

    const result = await callTool('search_catalogues', undefined, { room: 'SEARCH0001', target: 'CTCF' })

    expect(result.content[0].text).toMatch(/^2 tracks match in the Catalogues for mm10 \(ENCODE 2, 4DN 0\)\./)
    expect(accessionsIn(result)).toEqual(['ENCFF001AAA', 'ENCFF002AAA'])
  })

  it.each(['', '  '])('given as %j, does the same', async (genome) => {
    await roomShowing('SEARCH0002', 'mm10')

    const result = await callTool('search_catalogues', { 'mcp-session-id': 'SEARCH0002' }, { genome, target: 'CTCF' })

    expect(accessionsIn(result)).toEqual(['ENCFF001AAA', 'ENCFF002AAA'])
  })

  it('in a Room no Viewer has reported from, replies with an error asking for a genome or an open igv-bot', async () => {
    const result = await callTool('search_catalogues', undefined, { room: 'SEARCH0003', text: 'CTCF' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: it is not known which genome igv-bot is showing in Room SEARCH0003: no Viewer has reported from it. Pass genome, or open igv-bot with open_viewer and search again.',
    )
  })

  it('and no Room, replies with an error asking for a genome', async () => {
    const result = await callTool('search_catalogues', undefined, { text: 'CTCF' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: no genome was given and there is no Room to read one from. Pass genome, or pass room.')
  })
})

describe('the reply of search_catalogues', () => {
  it("carries the Room's Session summary", async () => {
    await roomShowing('SEARCH0004', 'hg38')

    const result = await callTool('search_catalogues', undefined, { room: 'SEARCH0004', text: 'GABPA' })

    const text = result.content[0].text!
    expect(JSON.parse(text.slice(text.indexOf(SUMMARY) + SUMMARY.length))).toEqual(summaryOn('hg38'))
  })

  it('for a genome other than the one igv-bot is showing, says that these tracks are not for what is shown', async () => {
    await roomShowing('SEARCH0005', 'mm10')

    const result = await callTool('search_catalogues', undefined, { room: 'SEARCH0005', genome: 'hg38', text: 'GABPA' })

    expect(result.content[0].text).toContain(
      '\n\nigv-bot is showing mm10, not hg38: these tracks will not line up with it until the genome is changed.\n\n',
    )
    expect(accessionsIn(result)).toEqual(['ENCFF005AAA'])
  })

  it('given a room that is not a Room id, is an error', async () => {
    const result = await callTool('search_catalogues', undefined, { room: 'nope', genome: 'hg38', text: 'CTCF' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/^Error: "nope" is not a Room id\./)
  })

  it('for a search that matches more rows than it shows, says how many are shown', async () => {
    const result = await callTool('search_catalogues', undefined, { genome: 'dm6', text: 'POLR2A' })

    expect(result.content[0].text).toMatch(
      /^25 tracks match in the Catalogues for dm6 \(ENCODE 25, 4DN 0\)\. The first 20 are below: narrow the search to see others\.\n/,
    )
    expect(tracksIn(result)).toHaveLength(20)
  })
})
