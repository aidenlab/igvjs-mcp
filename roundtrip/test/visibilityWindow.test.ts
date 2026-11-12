/**
 * Setting visibility windows, round trip: the built Viewer runs igv.js in a headless browser,
 * and the windows in the Session summary are the ones igv.js has, and keeps in the Session.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { TrackSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'
/** A low-coverage 1000 Genomes CRAM on hg38: igv.js finds its .crai beside it. */
const CRAM_URL = 'https://s3.amazonaws.com/1000genomes/data/HG00103/alignment/HG00103.alt_bwamem_GRCh38DH.20150718.GBR.low_coverage.cram'

/** A new Room with a Viewer in it showing the sequence track, Conservation, the tracks given, and Refseq All. */
async function roomWithViewer(tracks: Array<{ url: string; name: string }> = []): Promise<{ room: string; page: Page }> {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,736,000-127,736,600' })
  await callTool(room, 'load_tracks', { tracks: [{ url: PHYLOP_URL, name: 'Conservation' }, ...tracks] })
  return { room, page }
}

afterAll(() => Promise.all(browsers.map((browser) => browser.close())))

/** Long enough for the Viewer to see that igv.js has gone quiet and save its Session in the Room. */
const SAVED_MS = 1500

/** The options of the tracks of a reply's Session summary, top to bottom. */
function optionsIn(reply: { summary: { tracks: TrackSummary[] } }) {
  return reply.summary.tracks.map((track) => track.options)
}

/** Reloads the Viewer, which restores the Session saved in its Room. */
async function reload(page: Page): Promise<void> {
  await page.waitForTimeout(SAVED_MS)
  await page.reload()
  await page.locator('.viewer__status--joined').waitFor()
}

describe('setting visibility windows, round trip', () => {
  it('set_visibility_window gives the annotation track named a window, the Session summary gives it as options, and a reload keeps it', async () => {
    const { room, page } = await roomWithViewer()

    const reply = await callTool(room, 'set_visibility_window', { window: 100000, names: ['refseq all'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(optionsIn(reply)[2]).toEqual({ visibilityWindow: 100000 })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toEqual({ visibilityWindow: 100000 })

    const again = await callTool(room, 'set_visibility_window', { window: 100000, positions: [3] })
    expect(again.text).toMatch(/^Note: "Refseq All" already had visibility window 100,000 bp, so nothing changed\.\n/)
  })

  it('a window smaller than the view is set, with a note that the track shows nothing until zoomed in', async () => {
    const { room } = await roomWithViewer()

    const reply = await callTool(room, 'set_visibility_window', { window: 100, names: ['Refseq All'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: "Refseq All" shows its features only in a view of 100 bp or less: the view is [\d,]+ bp wide, so until it is zoomed in that far it shows none\.\n/)
    expect(optionsIn(reply)[2]).toEqual({ visibilityWindow: 100 })
  })

  it('a wig track, or a window that is no whole number, is an error that changes nothing', async () => {
    const { room } = await roomWithViewer()

    const wig = await callTool(room, 'set_visibility_window', { window: 100000, positions: [2, 3] })
    expect(wig.isError).toBe(true)
    expect(wig.text).toMatch(/^Error: "Conservation" is a wig track: set_visibility_window sets the visibility window of annotation, variant and alignment tracks only\.\n/)

    const negative = await callTool(room, 'set_visibility_window', { window: -1, positions: [3] })
    expect(negative.isError).toBe(true)
    expect(negative.text).toMatch(/^Error: -1 is no visibility window: give a whole number of base pairs, or 0 for no window\.\n/)
    expect(optionsIn(negative)[2]).toBeUndefined()
  })

  it("all sets an alignment track's window, kept on a reload, and passes over the wig track with a note", async () => {
    const { room, page } = await roomWithViewer([{ url: CRAM_URL, name: 'HG00103' }])

    const reply = await callTool(room, 'set_visibility_window', { window: 50000, all: true })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: Passed over by all: "Conservation" is a wig track: set_visibility_window sets the visibility window of annotation, variant and alignment tracks only\.\n/)
    expect(optionsIn(reply)[2]).toMatchObject({ visibilityWindow: 50000 })
    expect(optionsIn(reply)[3]).toEqual({ visibilityWindow: 50000 })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toMatchObject({ visibilityWindow: 50000 })
  })
})
