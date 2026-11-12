/**
 * Setting display modes, round trip: the built Viewer runs igv.js in a headless
 * browser, and the modes in the Session summary are the ones igv.js has, and
 * keeps in the Session.
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

describe('setting display modes, round trip', () => {
  it('set_display_mode gives the annotation track named a mode, the Session summary gives it as options, and a reload keeps it', async () => {
    const { room, page } = await roomWithViewer()

    const reply = await callTool(room, 'set_display_mode', { mode: 'squished', names: ['refseq all'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(optionsIn(reply)[2]).toEqual({ displayMode: 'squished' })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toEqual({ displayMode: 'squished' })

    const again = await callTool(room, 'set_display_mode', { mode: 'squished', positions: [3] })
    expect(again.text).toMatch(/^Note: "Refseq All" already had display mode squished, so nothing changed\.\n/)
  })

  it('a mode the Track type does not offer, or a wig track, is an error that changes nothing', async () => {
    const { room } = await roomWithViewer()

    const full = await callTool(room, 'set_display_mode', { mode: 'full', positions: [2, 3] })
    expect(full.isError).toBe(true)
    expect(full.text).toMatch(/^Error: "Conservation" is a wig track, which has no display mode: how it is drawn is set by set_signal_style's graphType\.\n/)

    const notOffered = await callTool(room, 'set_display_mode', { mode: 'full', positions: [3] })
    expect(notOffered.isError).toBe(true)
    expect(notOffered.text).toMatch(/^Error: "Refseq All" is an annotation track, which offers display modes collapsed, squished and expanded, not full\.\n/)
    expect(optionsIn(notOffered)[2]).toBeUndefined()
  })

  it('an alignment track is drawn full, kept on a reload; all passes over the wig track with a note', async () => {
    const { room, page } = await roomWithViewer([{ url: CRAM_URL, name: 'HG00103' }])

    const reply = await callTool(room, 'set_display_mode', { mode: 'full', all: true })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: Passed over by all: "Conservation" is a wig track, which has no display mode: how it is drawn is set by set_signal_style's graphType\. "Refseq All" is an annotation track, which offers display modes collapsed, squished and expanded, not full\.\n/)
    expect(optionsIn(reply)[2]).toMatchObject({ displayMode: 'full' })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toMatchObject({ displayMode: 'full' })
  })
})
