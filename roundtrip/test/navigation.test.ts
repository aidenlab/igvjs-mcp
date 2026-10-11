/**
 * Navigation, end to end: each test opens the built Viewer in a headless
 * browser on a Room of its own, calls a tool as the model would, and asserts
 * on the reply.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { callTool, closeViewers, newRoom, openViewer, summaryOf, textOf } from './stack.ts'

afterEach(closeViewers)

/** The width in base pairs of a locus such as "chr8:127,735,231-127,743,951". */
function width(locus: string): number {
  const [, start, end] = locus.replaceAll(',', '').match(/:(\d+)-(\d+)$/)!
  return Number(end) - Number(start) + 1
}

describe('with the Viewer open in the Room', () => {
  it('go_to_locus moves the Viewer and replies with the resulting Session summary', async () => {
    const room = await newRoom()
    await openViewer(room)

    const result = await callTool(room, 'go_to_locus', { locus: 'chr1:1,000,001-1,002,000' })

    expect(result.isError).toBeFalsy()
    expect(textOf(result)).toMatch(/^Went to locus chr1:1,000,001-1,002,000\.\nSession summary: \{/)
    expect(summaryOf(result)).toEqual({
      genome: 'hg38',
      loci: ['chr1:1,000,001-1,002,000'],
      tracks: [
        { name: 'sequence', type: 'sequence', height: 25 }, // a height igv.js leaves out of its Session, read from the track
        { name: 'Refseq All', type: 'annotation', url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz', height: 70 },
      ],
      crosshairs: false,
      centreLine: false,
    })
  })

  it('go_to_gene moves the Viewer to the gene', async () => {
    const room = await newRoom()
    await openViewer(room)

    const result = await callTool(room, 'go_to_gene', { gene: 'MYC' })

    expect(result.isError).toBeFalsy()
    expect(summaryOf(result).loci).toEqual([expect.stringMatching(/^chr8:127,7\d\d,\d{3}-127,7\d\d,\d{3}$/)]) // MYC is at chr8:127.7 Mb in hg38
  })

  it('zoom_in halves the width in view and zoom_out doubles it', async () => {
    const room = await newRoom()
    await openViewer(room)
    await callTool(room, 'go_to_locus', { locus: 'chr1:1,000,001-1,002,000' })

    const zoomedIn = summaryOf(await callTool(room, 'zoom_in'))
    const zoomedOut = summaryOf(await callTool(room, 'zoom_out'))
    const zoomedOutAgain = summaryOf(await callTool(room, 'zoom_out'))

    expect(zoomedIn.loci.map(width)).toEqual([1000])
    expect(zoomedOut.loci.map(width)).toEqual([2000])
    expect(zoomedOutAgain.loci.map(width)).toEqual([4000])
  })

  it.each([
    ['go_to_gene', { gene: 'NOTAGENE123' }, 'Error: Unrecognized locus: NOTAGENE123'],
    ['go_to_locus', { locus: 'chrZZ:1-100' }, 'Error: Unrecognized locus: chrZZ:1-100'],
  ])("%s with a name igv.js does not know replies with igv.js's own error, and the Viewer stays where it was", async (tool, args, error) => {
    const room = await newRoom()
    await openViewer(room)
    await callTool(room, 'go_to_locus', { locus: 'chr1:1,000,001-1,002,000' })

    const result = await callTool(room, tool, args)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(error)
    expect(summaryOf(await callTool(room, 'zoom_in')).loci).toEqual(['chr1:1,000,501-1,001,500'])
  })
})

describe('with no Viewer in the Room', () => {
  it('a command tool replies that one must be opened first', async () => {
    const result = await callTool(await newRoom(), 'zoom_in')

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Error: no Viewer is in this Room. Use open_viewer to open igv-bot first, then try again.')
  })
})
