/**
 * Changing genome, round trip: the built Viewer runs igv.js in a headless
 * browser, and the local Worker reads the real igv.org genome list.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser } from 'playwright'
import { callTool, newSession, openViewer, toolReply } from '../model.ts'

const browsers: Browser[] = []

async function viewerIn(room: string) {
  const { browser } = await openViewer(room)
  browsers.push(browser)
}

afterAll(() => Promise.all(browsers.map((browser) => browser.close())))

// mm10's default track as the igv.org genome list gives it; igv.js adds the sequence track.
const MM10_TRACKS = [
  { name: 'sequence', type: 'sequence', height: 25 },
  { name: 'RefSeq All', type: 'annotation', url: 'https://hgdownload.soe.ucsc.edu/goldenPath/mm10/database/ncbiRefSeq.txt.gz', height: 70 },
]

describe('changing genome, round trip', () => {
  it('change_genome replies with a Session summary naming the new genome and its default tracks', async () => {
    const room = await newSession()
    await viewerIn(room)
    await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })

    const reply = await callTool(room, 'change_genome', { genome: 'mm10' })

    expect(reply.isError).toBe(false)
    expect(reply.summary).toEqual({ genome: 'mm10', loci: ['all'], tracks: MM10_TRACKS, crosshairs: false, centreLine: false })
    // The Viewer goes on taking commands in the new genome.
    const moved = await callTool(room, 'go_to_locus', { locus: 'chr11:101,442,001-101,444,000' })
    expect(moved.summary).toMatchObject({ genome: 'mm10', loci: ['chr11:101,442,001-101,444,000'] })
  })

  it('change_genome for a genome that is not on the igv.org list says so and leaves the Viewer as it was', async () => {
    const room = await newSession()
    await viewerIn(room)
    const before = await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })

    const reply = await toolReply(room, 'change_genome', { genome: 'hg99' })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: the genome "hg99" is not available: it is not on the igv\.org genome list\./)
    expect(reply.text).toContain('mm10 (Mouse (GRCm38/mm10))')
    expect((await callTool(room, 'read_session_summary')).summary).toEqual(before.summary)
  })

  it('open_viewer given a genome and locus opens the Viewer there', async () => {
    const opened = await toolReply(await newSession(), 'open_viewer', { genome: 'mm10', locus: 'chr11:101,442,001-101,444,000' })
    const room = opened.structuredContent!.room!
    await viewerIn(room)

    const reply = await callTool(room, 'read_session_summary')

    expect(reply.summary).toEqual({
      genome: 'mm10',
      loci: ['chr11:101,442,001-101,444,000'],
      tracks: MM10_TRACKS,
      crosshairs: false,
      centreLine: false,
    })
  })
})
