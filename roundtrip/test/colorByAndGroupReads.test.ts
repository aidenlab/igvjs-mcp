/**
 * Coloring tracks and grouping reads, round trip: the built Viewer runs igv.js in a headless
 * browser, and the color-by and grouping in the Session summary are the ones igv.js has, and
 * keeps in the Session.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { TrackSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

const PHYLOP_URL = 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'
/** A low-coverage 1000 Genomes CRAM on hg38, of paired reads: igv.js finds its .crai beside it. */
const CRAM_URL = 'https://s3.amazonaws.com/1000genomes/data/HG00103/alignment/HG00103.alt_bwamem_GRCh38DH.20150718.GBR.low_coverage.cram'
/**
 * igv.js's own example VCF, small enough to load whole: its INFO fields are NS, DP, AF, AA, DB and H2. Its
 * variants are elsewhere than the locus in view, but color-by needs only its header.
 */
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

describe('coloring tracks and grouping reads, round trip', () => {
  it('set_color_by colors reads by a tag, the Session summary gives it as the tool takes it, and a reload keeps it', async () => {
    const { room, page } = await roomWithViewer({ url: CRAM_URL, name: 'HG00103' })

    const reply = await callTool(room, 'set_color_by', { by: 'tag', tag: 'HP', names: ['hg00103'] })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^Done\.\n/)
    expect(optionsIn(reply)[2]).toMatchObject({ colorBy: 'tag', colorByTag: 'HP' })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toMatchObject({ colorBy: 'tag', colorByTag: 'HP' })

    const again = await callTool(room, 'set_color_by', { by: 'tag', tag: 'HP', positions: [3] })
    expect(again.text).toMatch(/^Note: "HG00103" already had color-by tag HP, so nothing changed\.\n/)
  })

  it('group_reads with all groups the reads, passing over the other tracks with a note; none ungroups them, kept on a reload', async () => {
    const { room, page } = await roomWithViewer({ url: CRAM_URL, name: 'HG00103' })

    const grouped = await callTool(room, 'group_reads', { by: 'strand', all: true })

    expect(grouped.isError).toBe(false)
    expect(grouped.text).toMatch(
      /^Note: Passed over by all: "Conservation" is a wig track, which has no reads to group: only alignment tracks have them\. "Refseq All" is an annotation track, which has no reads to group: only alignment tracks have them\.\n/,
    )
    expect(optionsIn(grouped)[2]).toMatchObject({ groupBy: 'strand' })

    const ungrouped = await callTool(room, 'group_reads', { by: 'none', names: ['HG00103'] })
    expect(ungrouped.isError).toBe(false)
    expect(optionsIn(ungrouped)[2]?.groupBy).toBeUndefined()

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]?.groupBy).toBeUndefined()
  })

  it('a variant track colors by an INFO field its file declares, and by none, kept on a reload', async () => {
    const { room, page } = await roomWithViewer({ url: VCF_URL, name: 'Example calls' })

    const byAncestral = await callTool(room, 'set_color_by', { by: 'info', tag: 'AA', names: ['Example calls'] })
    expect(byAncestral.isError).toBe(false)
    expect(optionsIn(byAncestral)[2]).toMatchObject({ colorBy: 'info', colorByTag: 'AA' })

    const unknown = await callTool(room, 'set_color_by', { by: 'info', tag: 'SVTYPE', names: ['Example calls'] })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toMatch(/^Error: "Example calls" has no INFO field SVTYPE: its INFO fields are NS, DP, AF, AA, DB and H2\.\n/)

    const none = await callTool(room, 'set_color_by', { by: 'none', names: ['Example calls'] })
    expect(optionsIn(none)[2]).toMatchObject({ colorBy: 'none' })

    await reload(page)
    expect(optionsIn(await callTool(room, 'read_session_summary'))[2]).toMatchObject({ colorBy: 'none' })
  })

  it('a wig track has no color-by, and an error changes nothing', async () => {
    const { room } = await roomWithViewer({ url: CRAM_URL, name: 'HG00103' })

    const reply = await callTool(room, 'set_color_by', { by: 'strand', positions: [2, 3] })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: "Conservation" is a wig track, which has no color-by: its color is set by set_track_color\.\n/)
    expect(optionsIn(reply)[2]?.colorBy).not.toBe('strand')
  })
})
