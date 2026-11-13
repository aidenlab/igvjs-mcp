/**
 * Setting arcs, round trip: the built Viewer runs igv.js in a headless browser, and the arcs in
 * the Session summary are the ones igv.js draws, and keeps in the Session.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { TrackSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'
/** GTEx's eQTL–gene links on hg38, as UCSC's bigInteract, each with a score. */
const LINKS_URL = 'https://hgdownload.soe.ucsc.edu/gbdb/hg38/gtex/eQtl/gtexEqtlsCaviarHighConf.interact.bb'

/** A new Room with a Viewer in it showing the sequence track, Conservation, Links and Refseq All. */
async function roomWithViewer(): Promise<{ room: string; page: Page }> {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,700,000-127,800,000' })
  await callTool(room, 'load_tracks', { tracks: [{ url: PHYLOP_URL, name: 'Conservation' }, { url: LINKS_URL, name: 'Links' }] })
  return { room, page }
}

afterAll(() => Promise.all(browsers.map((browser) => browser.close())))

/** Long enough for the Viewer to see that igv.js has gone quiet and save its Session in the Room. */
const SAVED_MS = 1500

/** The tracks of a reply's Session summary, top to bottom. */
function tracksIn(reply: { summary: { tracks: TrackSummary[] } }): TrackSummary[] {
  return reply.summary.tracks
}

/** Reloads the Viewer, which restores the Session saved in its Room. */
async function reload(page: Page): Promise<void> {
  await page.waitForTimeout(SAVED_MS)
  await page.reload()
  await page.locator('.viewer__status--joined').waitFor()
}

describe('setting arcs, round trip', () => {
  it('set_arcs draws the interact track named as asked, the Session summary gives the arcs as options, and a reload keeps them', async () => {
    const { room, page } = await roomWithViewer()
    const arcs = { arcType: 'proportional', arcOrientation: 'down', thickness: 2, alpha: 0.1, useScore: true }

    const reply = await callTool(room, 'set_arcs', { ...arcs, names: ['links'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(tracksIn(reply)[2]).toMatchObject({ name: 'Links', type: 'interact', options: arcs })

    await reload(page)
    expect(tracksIn(await callTool(room, 'read_session_summary'))[2].options).toEqual(arcs)

    const again = await callTool(room, 'set_arcs', { arcType: 'proportional', thickness: 2, positions: [3] })
    expect(again.text).toMatch(/^Note: "Links" already had arc type proportional and thickness 2, so nothing changed\.\n/)
  })

  it('proportional arcs take a data range, which nested arcs do not', async () => {
    const { room } = await roomWithViewer()

    const nested = await callTool(room, 'set_data_range', { min: 0, max: 500, names: ['Links'] })
    expect(nested.isError).toBe(true)
    expect(nested.text).toMatch(/^Error: "Links" draws its arcs nested, which have no data range: set_arcs can draw them proportional\.\n/)

    await callTool(room, 'set_arcs', { arcType: 'inView', names: ['Links'] })
    const proportional = await callTool(room, 'set_data_range', { min: 0, max: 500, names: ['Links'] })
    expect(proportional.isError).toBe(false)
    expect(tracksIn(proportional)[2].options).toMatchObject({ arcType: 'inView', min: 0, max: 500 })
  })

  it('a wig track, or an alpha above 1, is an error that changes nothing', async () => {
    const { room } = await roomWithViewer()

    const wig = await callTool(room, 'set_arcs', { thickness: 2, positions: [2, 3] })
    expect(wig.isError).toBe(true)
    expect(wig.text).toMatch(/^Error: "Conservation" is a wig track, which has no arcs: only interact tracks have them\.\n/)
    expect(tracksIn(wig)[2].options).toBeUndefined()

    const alpha = await callTool(room, 'set_arcs', { alpha: 2, positions: [3] })
    expect(alpha.isError).toBe(true)
    expect(alpha.text).toMatch(/^Error: 2 is no alpha: give a number from 0, clear, to 1, opaque\.\n/)
  })

  it('all draws every interact track as asked and passes over the wig track with a note', async () => {
    const { room } = await roomWithViewer()

    const reply = await callTool(room, 'set_arcs', { arcOrientation: 'down', all: true })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: Passed over by all: "Conservation" is a wig track, which has no arcs: only interact tracks have them\. "Refseq All" is an annotation track, which has no arcs: only interact tracks have them\.\n/)
    expect(tracksIn(reply)[2].options).toEqual({ arcOrientation: 'down' })
  })
})
