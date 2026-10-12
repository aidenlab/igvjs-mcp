/**
 * Navigation, round trip: the built Viewer runs igv.js in a headless browser
 * and joins a Room on the local Worker; the test calls tools on /mcp as the
 * model would and asserts on the replies.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Browser } from 'playwright'
import { callTool, newSession, openViewer, span } from '../model.ts'

/** The width in base pairs of a locus such as "chr8:127,735,434-127,742,951". */
function width(locus: string): number {
  const [start, end] = span(locus)
  return end - start + 1
}

let browser: Browser
let room: string

beforeAll(async () => {
  room = await newSession()
  ;({ browser } = await openViewer(room))
})

afterAll(() => browser?.close())

describe('navigation, round trip', () => {
  it('go_to_locus shows the locus and replies with the Session summary of the default Viewer there', async () => {
    const reply = await callTool(room, 'go_to_locus', { locus: 'chr1:1,000,001-1,002,000' })

    expect(reply.isError).toBe(false)
    expect(reply.summary).toEqual({
      genome: 'hg38',
      loci: ['chr1:1,000,001-1,002,000'],
      tracks: [
        { name: 'sequence', type: 'sequence', height: 25 },
        { name: 'Refseq All', type: 'annotation', url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz', height: 70 },
      ],
      crosshairs: false,
      centreLine: false,
    })
  })

  it('go_to_gene shows the gene', async () => {
    const reply = await callTool(room, 'go_to_gene', { gene: 'MYC' })

    expect(reply.isError).toBe(false)
    expect(reply.summary.loci).toHaveLength(1)
    expect(reply.summary.loci[0]).toMatch(/^chr8:127,7\d\d,\d{3}-127,7\d\d,\d{3}$/) // MYC, with igv.js's margin around it
  })

  it('zoom_in halves the width of the view and zoom_out doubles it', async () => {
    await callTool(room, 'go_to_locus', { locus: 'chr1:1,000,001-1,002,000' })

    const zoomedIn = await callTool(room, 'zoom_in')
    expect(zoomedIn.isError).toBe(false)
    expect(width(zoomedIn.summary.loci[0])).toBe(1000)

    const zoomedOut = await callTool(room, 'zoom_out')
    expect(zoomedOut.isError).toBe(false)
    expect(width(zoomedOut.summary.loci[0])).toBe(2000)
  })

  it('a command from another MCP session reaches the Viewer when it carries the Room id', async () => {
    const otherRoom = await newSession()
    expect(otherRoom).not.toBe(room)

    const reply = await callTool(otherRoom, 'go_to_locus', { locus: 'chr2:5,000,001-5,002,000', room })

    expect(reply.isError).toBe(false)
    expect(reply.summary.loci).toEqual(['chr2:5,000,001-5,002,000'])
  })

  it.each([
    ['go_to_gene', { gene: 'NOTAGENE123' }, 'NOTAGENE123'],
    ['go_to_locus', { locus: 'chrZZ:1-100' }, 'chrZZ:1-100'],
  ])("%s with an unknown name replies with igv.js's error and leaves the view where it was", async (tool, args, name) => {
    await callTool(room, 'go_to_locus', { locus: 'chr1:1,000,001-1,002,000' })

    const reply = await callTool(room, tool, args)

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(new RegExp(`^Error: Unrecognized locus: ${name}\\n`))
    expect(reply.summary.loci).toEqual(['chr1:1,000,001-1,002,000'])
  })
})
