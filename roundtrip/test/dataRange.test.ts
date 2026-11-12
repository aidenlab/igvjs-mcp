/**
 * Setting data ranges, round trip: the built Viewer runs igv.js in a headless
 * browser, and the ranges in the Session summary are the ones igv.js has, and
 * keeps in the Session.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { TrackSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer, showControls } from '../model.ts'

const browsers: Browser[] = []

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'
const PHASTCONS_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phastCons100way/hg38.phastCons100way.bw'

/** A new Room with a Viewer in it showing the sequence track, the wig tracks named, and Refseq All. */
async function roomWithViewer(wigs: Array<{ url: string; name: string }> = [{ url: PHYLOP_URL, name: 'Conservation' }]): Promise<{ room: string; page: Page }> {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })
  await callTool(room, 'load_tracks', { tracks: wigs })
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

/**
 * Groups the wig tracks for autoscale by hand, as a person does in igv.js: Select Tracks, then
 * Group autoscale. The Viewer hides igv.js's Select Tracks button, so it is clicked unseen.
 */
async function groupByHand(page: Page): Promise<void> {
  await showControls(page)
  await page.getByTitle('Select Tracks').dispatchEvent('click')
  // The wig tracks' boxes: Refseq All's, last, is left unchecked, as Group autoscale is for tracks of one type.
  const boxes = page.locator('input[name=track-select]:visible')
  for (let box = 0; box < (await boxes.count()) - 1; box++) await boxes.nth(box).check()
  // The first wig track's gear, below those of the ideogram, the ruler and the sequence track.
  await page.locator('.igv-gear-menu-column > div').nth(3).locator('div').first().click()
  await page.getByText('Group autoscale', { exact: true }).click()
}

describe('setting data ranges, round trip', () => {
  it('set_data_range gives the track named a fixed range, the Session summary gives it as options, and a reload keeps it', async () => {
    const { room, page } = await roomWithViewer()

    const reply = await callTool(room, 'set_data_range', { min: 0, max: 5, names: ['conservation'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(optionsIn(reply)[1]).toEqual({ min: 0, max: 5, autoscale: false })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[1]).toEqual({ min: 0, max: 5, autoscale: false })
  })

  it('autoscale turned back on, and log scale, are kept on a reload too', async () => {
    const { room, page } = await roomWithViewer()
    await callTool(room, 'set_data_range', { max: 5, positions: [2] })

    const reply = await callTool(room, 'set_data_range', { autoscale: true, logScale: true, positions: [2] })

    expect(reply.isError).toBe(false)
    expect(optionsIn(reply)[1]).toEqual({ autoscale: true, logScale: true })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[1]).toEqual({ autoscale: true, logScale: true })
  })

  it('all is every track with a data range: it passes over the genes with a note, and the sequence track without a word', async () => {
    const { room } = await roomWithViewer()

    const reply = await callTool(room, 'set_data_range', { min: -1, max: 1, all: true })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: Passed over by all: "Refseq All" is an annotation track, which has no data range\.\n\nSession summary:\n/)
    expect(optionsIn(reply)).toEqual([undefined, { min: -1, max: 1, autoscale: false }, undefined])
  })

  it('a range a track already has replies with a note; a track with no data range, and a min not below the max, are errors that change nothing', async () => {
    const { room } = await roomWithViewer()

    await callTool(room, 'set_data_range', { min: 0, max: 5, positions: [2] })
    const again = await callTool(room, 'set_data_range', { max: 5, positions: [2] })
    expect(again.isError).toBe(false)
    expect(again.text).toMatch(/^Note: "Conservation" already had a max of 5, so nothing changed\.\n/)

    const genes = await callTool(room, 'set_data_range', { autoscale: true, positions: [2, 3] })
    expect(genes.isError).toBe(true)
    expect(genes.text).toMatch(/^Error: "Refseq All" is an annotation track, which has no data range\.\n/)

    const upsideDown = await callTool(room, 'set_data_range', { min: 6, positions: [2] })
    expect(upsideDown.isError).toBe(true)
    expect(upsideDown.text).toMatch(/^Error: min must be below max: "Conservation" would range from 6 to 5\.\n/)
    expect(optionsIn(upsideDown)[1]).toEqual({ min: 0, max: 5, autoscale: false })
  })

  it('a fixed range takes a track out of the autoscale group a person made, with a note naming the tracks still in it', async () => {
    const { room, page } = await roomWithViewer([
      { url: PHYLOP_URL, name: 'Conservation' },
      { url: PHASTCONS_URL, name: 'PhastCons' },
      { url: PHYLOP_URL, name: 'PhyloP' },
    ])
    await groupByHand(page)

    const reply = await callTool(room, 'set_data_range', { min: 0, max: 5, names: ['Conservation'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: "Conservation" was taken out of its autoscale group; "PhastCons" and "PhyloP" are still in it\.\n/)

    // On a reload too: the group is igv.js's, and so is what it keeps.
    await reload(page)
    const again = await callTool(room, 'set_data_range', { autoscale: false, names: ['PhastCons'] })
    expect(again.text).toMatch(/^Note: "PhastCons" was taken out of its autoscale group; "PhyloP" is still in it\.\n/)
  })
})
