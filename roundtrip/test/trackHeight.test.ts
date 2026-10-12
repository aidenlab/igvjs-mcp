/**
 * Setting track height, round trip: the built Viewer runs igv.js in a headless
 * browser, and the heights in the Session summary are the ones igv.js has.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

/** A new Room with a Viewer in it showing three tracks, at a locus small enough for igv.js to draw quickly. */
async function roomWithViewer() {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })
  await callTool(room, 'load_tracks', { tracks: [{ url: PHYLOP_URL, name: 'Conservation' }] })
  return { room, page }
}

afterAll(() => Promise.all(browsers.map((browser) => browser.close())))

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'

/** The heights of the tracks in the Session summary, top to bottom: the sequence track, Conservation, Refseq All. */
function heights(reply: { summary: { tracks: Array<{ height: number }> } }): number[] {
  return reply.summary.tracks.map((track) => track.height)
}

/** The heights igv.js draws the tracks at, top to bottom, the ideogram and ruler above them left out. */
async function drawnHeights(page: Page): Promise<number[]> {
  const drawn = await page.locator('.igv-viewport').evaluateAll((viewports) => viewports.map((viewport) => viewport.getBoundingClientRect().height))
  return drawn.slice(-3)
}

describe('setting track height, round trip', () => {
  it('set_track_height gives one track named an absolute height, and igv.js draws it so', async () => {
    const { room, page } = await roomWithViewer()
    expect(heights(await callTool(room, 'read_session_summary'))).toEqual([25, 50, 70])

    const reply = await callTool(room, 'set_track_height', { height: 120, names: ['conservation'] })

    expect(reply.isError).toBe(false)
    expect(heights(reply)).toEqual([25, 120, 70])
    expect(await drawnHeights(page)).toEqual([25, 120, 70])
    // The height is part of the Session from then on.
    expect(heights(await callTool(room, 'read_session_summary'))).toEqual([25, 120, 70])
  })

  it('"taller" on several tracks by position, then "shorter" on all, gives each its height back; the sequence track keeps its own', async () => {
    const { room } = await roomWithViewer()

    const taller = await callTool(room, 'set_track_height', { height: 'taller', positions: [2, 3] })
    expect(taller.isError).toBe(false)
    expect(heights(taller)).toEqual([25, 75, 105])

    const shorter = await callTool(room, 'set_track_height', { height: 'shorter', all: true })
    expect(shorter.isError).toBe(false)
    expect(heights(shorter)).toEqual([25, 50, 70])

    const absolute = await callTool(room, 'set_track_height', { height: 40, all: true })
    expect(heights(absolute)).toEqual([25, 40, 40])
  })

  it('a name or position that matches nothing replies with an error listing the tracks, and changes no height', async () => {
    const { room } = await roomWithViewer()
    const listed = 'The tracks are: 1\\. sequence; 2\\. Conservation; 3\\. Refseq All\\.\\n'

    const byName = await callTool(room, 'set_track_height', { height: 120, names: ['Conservation', 'H3K27ac'] })
    expect(byName.isError).toBe(true)
    expect(byName.text).toMatch(new RegExp(`^Error: No track is named "H3K27ac"\\. ${listed}`))
    expect(heights(byName)).toEqual([25, 50, 70])

    const byPosition = await callTool(room, 'set_track_height', { height: 'taller', positions: [2, 4] })
    expect(byPosition.isError).toBe(true)
    expect(byPosition.text).toMatch(new RegExp(`^Error: No track is at position 4\\. ${listed}`))
    expect(heights(byPosition)).toEqual([25, 50, 70])
  })

  it('a height outside the limits, and the sequence track addressed, are errors that change no height', async () => {
    const { room } = await roomWithViewer()

    const tooHigh = await callTool(room, 'set_track_height', { height: 5000, all: true })
    expect(tooHigh.isError).toBe(true)
    expect(tooHigh.text).toMatch(/^Error: A track cannot be 5000 pixels high\. Give a height from 1 to 1000 pixels, or "taller" or "shorter"\.\n/)

    const sequence = await callTool(room, 'set_track_height', { height: 60, positions: [1, 2] })
    expect(sequence.isError).toBe(true)
    expect(sequence.text).toMatch(/^Error: The sequence track's height cannot be set\.\n/)
    expect(heights(sequence)).toEqual([25, 50, 70])
  })
})
