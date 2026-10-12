/**
 * Loading and removing tracks, round trip: the built Viewer runs igv.js in a
 * headless browser, and igv.js fetches the tracks' files from UCSC.
 * ENCODE is not used: it refuses a headless browser.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser } from 'playwright'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

/** A new Room with a Viewer in it, at a locus small enough for igv.js to draw quickly. */
async function roomWithViewer() {
  const room = await newSession()
  const { browser } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })
  return room
}

afterAll(() => Promise.all(browsers.map((browser) => browser.close())))

const SEQUENCE = { name: 'sequence', type: 'sequence', height: 25 }
const REFSEQ = { name: 'Refseq All', type: 'annotation', url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz', height: 70 }

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'
const PHASTCONS_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phastCons100way/hg38.phastCons100way.bw'
const PHYLOP = { name: 'Conservation', type: 'wig', url: PHYLOP_URL, height: 50 }
// Loaded without a name: igv.js names a track by its file.
const PHASTCONS = { name: 'hg38.phastCons100way.bw', type: 'wig', url: PHASTCONS_URL, height: 50 }

describe('loading tracks, round trip', () => {
  it('load_tracks with one track replies with a Session summary listing it where igv.js shows it, above the gene annotation track', async () => {
    const room = await roomWithViewer()

    const reply = await callTool(room, 'load_tracks', { tracks: [{ url: PHYLOP_URL, name: 'Conservation' }] })

    expect(reply.isError).toBe(false)
    expect(reply.summary.tracks).toEqual([SEQUENCE, PHYLOP, REFSEQ])
  })

  it('load_tracks with several tracks lists them in the order given, a track without a name under the name of its file', async () => {
    const room = await roomWithViewer()

    const reply = await callTool(room, 'load_tracks', { tracks: [{ url: PHASTCONS_URL }, { url: PHYLOP_URL, name: 'Conservation' }] })

    expect(reply.isError).toBe(false)
    expect(reply.summary.tracks).toEqual([SEQUENCE, PHASTCONS, PHYLOP, REFSEQ])
    // The tracks are part of the Session from then on.
    expect((await callTool(room, 'read_session_summary')).summary.tracks).toEqual([SEQUENCE, PHASTCONS, PHYLOP, REFSEQ])
  })

  it("a file that does not exist replies with igv.js's own error, and no track is added", async () => {
    const room = await roomWithViewer()
    const missing = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/no-such-track.bw'

    const reply = await callTool(room, 'load_tracks', { tracks: [{ url: missing }] })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: Error accessing resource: /)
    expect(reply.text).toContain(missing)
    expect(reply.summary.tracks).toEqual([SEQUENCE, REFSEQ])
  })

  it("a host that does not permit cross-origin requests replies with igv.js's own error, and the other tracks of the call are loaded", async () => {
    const room = await roomWithViewer()
    const forbidden = 'https://example.com/track.bigWig'

    const reply = await callTool(room, 'load_tracks', { tracks: [{ url: forbidden }, { url: PHYLOP_URL, name: 'Conservation' }] })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: 1 of the 2 tracks did not load:\nError accessing resource: /)
    expect(reply.text).toContain(forbidden)
    expect(reply.summary.tracks).toEqual([SEQUENCE, PHYLOP, REFSEQ])
  })
})

describe('removing a track, round trip', () => {
  it('remove_track takes a track away by its name, and by its position in the Session summary', async () => {
    const room = await roomWithViewer()
    await callTool(room, 'load_tracks', { tracks: [{ url: PHASTCONS_URL }, { url: PHYLOP_URL, name: 'Conservation' }] })

    const byName = await callTool(room, 'remove_track', { name: 'conservation' })
    expect(byName.isError).toBe(false)
    expect(byName.summary.tracks).toEqual([SEQUENCE, PHASTCONS, REFSEQ])

    // The third track shown, though igv.js keeps it second in the Session.
    const byPosition = await callTool(room, 'remove_track', { position: 3 })
    expect(byPosition.isError).toBe(false)
    expect(byPosition.summary.tracks).toEqual([SEQUENCE, PHASTCONS])
  })

  it('a name or position that matches nothing replies with an error listing the tracks, and removes nothing', async () => {
    const room = await roomWithViewer()

    const byName = await callTool(room, 'remove_track', { name: 'H3K27ac' })
    expect(byName.isError).toBe(true)
    expect(byName.text).toMatch(/^Error: No track is named "H3K27ac"\. The tracks are: 1\. sequence; 2\. Refseq All\.\n/)

    const byPosition = await callTool(room, 'remove_track', { position: 3 })
    expect(byPosition.isError).toBe(true)
    expect(byPosition.text).toMatch(/^Error: No track is at position 3\. The tracks are: 1\. sequence; 2\. Refseq All\.\n/)
    expect(byPosition.summary.tracks).toEqual([SEQUENCE, REFSEQ])
  })

  it('the sequence track stays: igv.js does not let it be removed', async () => {
    const room = await roomWithViewer()

    const reply = await callTool(room, 'remove_track', { position: 1 })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: The sequence track cannot be removed\.\n/)
    expect(reply.summary.tracks).toEqual([SEQUENCE, REFSEQ])
  })
})
