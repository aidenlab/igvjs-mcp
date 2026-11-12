/**
 * Renaming tracks and setting their colors, round trip: the built Viewer runs
 * igv.js in a headless browser, and the names and colors in the Session
 * summary are the ones igv.js has, and keeps in the Session.
 */
import { inflateRawSync } from 'node:zlib'
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { TrackSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'

/** A new Room with a Viewer in it showing the sequence track, a wig track loaded with no name, and Refseq All. */
async function roomWithViewer(): Promise<{ room: string; page: Page }> {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })
  await callTool(room, 'load_tracks', { tracks: [{ url: PHYLOP_URL }] })
  return { room, page }
}

afterAll(() => Promise.all(browsers.map((browser) => browser.close())))

/** Long enough for the Viewer to see that igv.js has gone quiet and save its Session in the Room. */
const SAVED_MS = 1500

/** The tracks of a reply's Session summary as name, type and options, top to bottom. */
function tracksIn(reply: { summary: { tracks: TrackSummary[] } }) {
  return reply.summary.tracks.map(({ name, type, options }) => ({ name, type, ...(options ? { options } : {}) }))
}

/** The track names igv.js shows, top to bottom. */
async function drawnNames(page: Page): Promise<string[]> {
  return page.locator('.igv-track-label').allInnerTexts()
}

/** The track names of the Session a get_shareable_url reply carries in its link, as igv-webapp reads it. */
function sharedNames(text: string): Array<string | undefined> {
  const link = /^Shareable URL:\n(\S+)\n/.exec(text)![1]
  const base64 = new URL(link).searchParams.get('sessionURL')!.slice('blob:'.length).replaceAll('.', '+').replaceAll('_', '/').replaceAll('-', '=')
  const session = JSON.parse(inflateRawSync(Buffer.from(base64, 'base64')).toString('latin1')) as { tracks: Array<{ name?: string }> }
  return session.tracks.map((track) => track.name)
}

describe('renaming a track, round trip', () => {
  it('rename_track gives the track named its new name, igv.js shows it, the Shareable URL carries it, and a reload keeps it', async () => {
    const { room, page } = await roomWithViewer()

    const reply = await callTool(room, 'rename_track', { name: 'hg38.phyloP100way.bw', newName: 'Conservation' })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(reply.summary.tracks.map((track) => track.name)).toEqual(['sequence', 'Conservation', 'Refseq All'])
    expect(await drawnNames(page)).toContain('Conservation')
    // igv.js's own rename leaves the Session it writes without the name of a track loaded with none.
    expect(sharedNames((await callTool(room, 'get_shareable_url')).text)).toContain('Conservation')

    await page.waitForTimeout(SAVED_MS)
    await page.reload()
    await page.locator('.viewer__status--joined').waitFor()
    expect((await callTool(room, 'read_session_summary')).summary.tracks.map((track) => track.name)).toEqual(['sequence', 'Conservation', 'Refseq All'])
  })

  it('a track already so named replies with a note; the sequence track and a blank name are errors that rename nothing', async () => {
    const { room } = await roomWithViewer()

    const again = await callTool(room, 'rename_track', { position: 3, newName: 'Refseq All' })
    expect(again.isError).toBe(false)
    expect(again.text).toMatch(/^Note: The track was already named "Refseq All", so nothing changed\.\n\nSession summary:\n/)

    const sequence = await callTool(room, 'rename_track', { position: 1, newName: 'DNA' })
    expect(sequence.isError).toBe(true)
    expect(sequence.text).toMatch(/^Error: The sequence track's name cannot be set\.\n/)

    const blank = await callTool(room, 'rename_track', { position: 2, newName: '  ' })
    expect(blank.isError).toBe(true)
    expect(blank.text).toMatch(/^Error: Give the track's new name as newName\.\n/)
    expect(blank.summary.tracks.map((track) => track.name)).toEqual(['sequence', 'hg38.phyloP100way.bw', 'Refseq All'])
  })
})

describe('setting track colors, round trip', () => {
  it('set_track_color gives the tracks named their colors as igv.js spells them, the Session summary gives them as options, and a reload keeps them', async () => {
    const { room, page } = await roomWithViewer()

    const reply = await callTool(room, 'set_track_color', { color: '#1f77b4', altColor: 'rgb(214,39,40)', positions: [2] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(tracksIn(reply)[1]).toEqual({ name: 'hg38.phyloP100way.bw', type: 'wig', options: { color: 'rgb(31, 119, 180)', altColor: 'rgb(214, 39, 40)' } })

    await page.waitForTimeout(SAVED_MS)
    await page.reload()
    await page.locator('.viewer__status--joined').waitFor()
    expect(tracksIn(await callTool(room, 'read_session_summary'))[1].options).toEqual({ color: 'rgb(31, 119, 180)', altColor: 'rgb(214, 39, 40)' })
  })

  it('all is every track that takes the colors, leaving the sequence track as it is', async () => {
    const { room } = await roomWithViewer()

    const reply = await callTool(room, 'set_track_color', { color: '#000000', all: true })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(tracksIn(reply).map((track) => track.options?.color)).toEqual([undefined, 'rgb(0, 0, 0)', 'rgb(0, 0, 0)'])
  })

  it('colors a track already has reply with a note; "unset" gives back the color it was loaded with', async () => {
    const { room } = await roomWithViewer()

    await callTool(room, 'set_track_color', { color: '#1f77b4', names: ['Refseq All'] })
    const again = await callTool(room, 'set_track_color', { color: 'rgb(31, 119, 180)', names: ['refseq all'] })
    expect(again.isError).toBe(false)
    expect(again.text).toMatch(/^Note: "Refseq All" already had that color, so nothing changed\.\n\nSession summary:\n/)

    const unset = await callTool(room, 'set_track_color', { color: 'unset', names: ['Refseq All'] })
    expect(unset.isError).toBe(false)
    // igv.js's default color for an annotation track, as its own "Unset track color" gives it.
    expect(tracksIn(unset)[2].options?.color).toBe('rgb(0,0,150)')
  })

  it('a color that is no color, and the sequence track addressed, are errors that change no color', async () => {
    const { room } = await roomWithViewer()

    const named = await callTool(room, 'set_track_color', { color: 'red', all: true })
    expect(named.isError).toBe(true)
    expect(named.text).toMatch(/^Error: "red" is not a color igv-bot takes\. Give one as "#RRGGBB"/)

    const sequence = await callTool(room, 'set_track_color', { color: '#000000', positions: [1, 2] })
    expect(sequence.isError).toBe(true)
    expect(sequence.text).toMatch(/^Error: The sequence track's color cannot be set\.\n/)
    expect(tracksIn(sequence).map((track) => track.options)).toEqual([undefined, undefined, undefined])
  })
})
