/**
 * Showing and hiding the parts of tracks, round trip: the built Viewer runs igv.js in a headless
 * browser, and the parts in the Session summary are the ones igv.js shows, and keeps in the Session.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { TrackSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'
/**
 * A low-coverage 1000 Genomes CRAM on hg38: igv.js finds its .crai beside it. igv.js does not see
 * its reads as paired, so viewAsPairs is an error on it, and is left to the Viewer's unit tests.
 */
const CRAM_URL = 'https://s3.amazonaws.com/1000genomes/data/HG00103/alignment/HG00103.alt_bwamem_GRCh38DH.20150718.GBR.low_coverage.cram'
/** igv.js's own example VCF, small enough to load whole: it has three samples, NA00001 to NA00003. */
const VCF_URL = 'https://raw.githubusercontent.com/igvteam/igv.js/761dee6e5a7ba6cae677328f3e9197438a25036d/test/data/vcf/example.vcf'

/** A new Room with a Viewer in it showing the sequence track, Conservation, the track given, and Refseq All. */
async function roomWithViewer(track: { url: string; name: string }): Promise<{ room: string; page: Page }> {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,736,000-127,736,600' })
  await callTool(room, 'load_tracks', { tracks: [{ url: PHYLOP_URL, name: 'Conservation' }, track] })
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

describe('showing and hiding the parts of tracks, round trip', () => {
  it("show_track_parts hides an alignment track's coverage and mismatches and shows its soft clips, the Session summary gives them, and a reload keeps them", async () => {
    const { room, page } = await roomWithViewer({ url: CRAM_URL, name: 'HG00103' })
    const parts = { showCoverage: false, showSoftClips: true, showMismatches: false }

    const reply = await callTool(room, 'show_track_parts', { ...parts, names: ['hg00103'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(optionsIn(reply)[2]).toMatchObject(parts)

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toMatchObject(parts)

    const again = await callTool(room, 'show_track_parts', { showCoverage: false, positions: [3] })
    expect(again.text).toMatch(/^Note: "HG00103" already had its coverage hidden, so nothing changed\.\n/)
  })

  it('hiding the alignments of a track whose coverage is hidden is an error, and an error changes nothing', async () => {
    const { room } = await roomWithViewer({ url: CRAM_URL, name: 'HG00103' })
    await callTool(room, 'show_track_parts', { showCoverage: false, names: ['HG00103'] })

    const reply = await callTool(room, 'show_track_parts', { showAlignments: false, positions: [2, 3] })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: "Conservation" is a wig track, which has no parts to show or hide: only alignment and variant tracks have them\.\n/)
    const alone = await callTool(room, 'show_track_parts', { showAlignments: false, names: ['HG00103'] })
    expect(alone.text).toMatch(/^Error: "HG00103" has its coverage hidden, so hiding its alignments too would leave it nothing to draw: give showCoverage true with it\.\n/)
    expect(optionsIn(alone)[2]?.showAlignments).toBeUndefined()
  })

  it("all hides a variant track's genotypes, passing over the other tracks with a note, kept on a reload", async () => {
    const { room, page } = await roomWithViewer({ url: VCF_URL, name: 'Example calls' })

    const reply = await callTool(room, 'show_track_parts', { showGenotypes: false, all: true })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(
      /^Note: Passed over by all: "Conservation" is a wig track, which has no parts to show or hide: only alignment and variant tracks have them\. "Refseq All" is an annotation track, which has no parts to show or hide: only alignment and variant tracks have them\.\n/,
    )
    expect(optionsIn(reply)[2]).toMatchObject({ showGenotypes: false })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toMatchObject({ showGenotypes: false })
  })
})
