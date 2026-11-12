/**
 * Setting signal styles, round trip: the built Viewer runs igv.js in a headless
 * browser, and the styles in the Session summary are the ones igv.js has, and
 * keeps in the Session.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { TrackSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'

/** A new Room with a Viewer in it showing the sequence track, Conservation, and Refseq All. */
async function roomWithViewer(): Promise<{ room: string; page: Page }> {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })
  await callTool(room, 'load_tracks', { tracks: [{ url: PHYLOP_URL, name: 'Conservation' }] })
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

describe('setting signal styles, round trip', () => {
  it('set_signal_style gives the track named a graph type, window function and flipped axis, the Session summary gives them as options, and a reload keeps them', async () => {
    const { room, page } = await roomWithViewer()

    const reply = await callTool(room, 'set_signal_style', { graphType: 'line', windowFunction: 'max', flipAxis: true, names: ['conservation'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(optionsIn(reply)[1]).toMatchObject({ graphType: 'line', windowFunction: 'max', flipAxis: true })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[1]).toMatchObject({ graphType: 'line', windowFunction: 'max', flipAxis: true })
  })

  it("a heatmap takes a color scale, kept on a reload; its color and data range are errors pointing to set_signal_style's colorScale", async () => {
    const { room, page } = await roomWithViewer()

    const reply = await callTool(room, 'set_signal_style', { graphType: 'heatmap', colorScale: { min: 0, max: 5, minColor: '#ffffff', maxColor: '#000000' }, positions: [2] })

    expect(reply.isError).toBe(false)
    const colorScale = { type: 'gradient', min: 0, max: 5, minColor: 'rgb(255, 255, 255)', maxColor: 'rgb(0, 0, 0)' }
    expect(optionsIn(reply)[1]).toMatchObject({ graphType: 'heatmap', colorScale })

    const color = await callTool(room, 'set_track_color', { color: '#ff0000', positions: [2] })
    expect(color.isError).toBe(true)
    expect(color.text).toMatch(/^Error: "Conservation" is drawn as a heatmap, whose colors are set by set_signal_style's colorScale\.\n/)
    const range = await callTool(room, 'set_data_range', { max: 10, positions: [2] })
    expect(range.isError).toBe(true)
    expect(range.text).toMatch(/^Error: "Conservation" is drawn as a heatmap, whose range is set by set_signal_style's colorScale\.\n/)

    // Only what changes: a mid makes the scale diverging, white at the mid.
    const diverging = await callTool(room, 'set_signal_style', { colorScale: { mid: 1 }, positions: [2] })
    expect(optionsIn(diverging)[1]).toMatchObject({ colorScale: { ...colorScale, type: 'diverging', mid: 1, midColor: 'white' } })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[1]).toMatchObject({ graphType: 'heatmap', colorScale: { type: 'diverging', mid: 1 } })
  })

  it('a color scale for a track not drawn as a heatmap is an error that changes nothing', async () => {
    const { room } = await roomWithViewer()

    const reply = await callTool(room, 'set_signal_style', { flipAxis: true, colorScale: { max: 5 }, positions: [2] })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: "Conservation" is drawn as bar, not as a heatmap, so it has no colorScale: give graphType heatmap with it to draw it as one\.\n/)
    expect(optionsIn(reply)[1]).toBeUndefined()
  })

  it('all is every wig track, and a points track keeps its window function: all passes over the genes with a note, and the sequence track without a word', async () => {
    const { room } = await roomWithViewer()

    const reply = await callTool(room, 'set_signal_style', { graphType: 'points', all: true })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: Passed over by all: "Refseq All" is an annotation track, which has no signal style: only wig tracks have one\.\n/)
    // The window function is kept: igv.js would load a points track without one in its config with none.
    expect(optionsIn(reply)).toEqual([undefined, { graphType: 'points', windowFunction: 'mean' }, undefined])
  })

  it('dynseq zoomed out further than 2 bp per pixel replies with a note, and so does a style a track already has', async () => {
    const { room } = await roomWithViewer()

    const reply = await callTool(room, 'set_signal_style', { graphType: 'dynseq', positions: [2] })
    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Note: "Conservation" is drawn as dynseq, which shows bases only below 2 bp per pixel: until the view is zoomed in that far it is drawn as bars\.\n/)

    const again = await callTool(room, 'set_signal_style', { flipAxis: false, positions: [2] })
    expect(again.text).toMatch(/^Note: "Conservation" already had its axis not flipped, so nothing changed\.\n/)
  })
})
