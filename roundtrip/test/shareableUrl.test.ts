/**
 * The Shareable URL, round trip: the built Viewer runs igv.js in a headless
 * browser, and the link the model is given carries the Session igv.js is
 * showing, as igv-webapp reads it.
 */
import { inflateRawSync } from 'node:zlib'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import { callTool, newSession, openViewer } from '../model.ts'

let browser: Browser
let page: Page
let room: string

beforeAll(async () => {
  room = await newSession()
  ;({ browser, page } = await openViewer(room))
})

afterAll(() => browser?.close())

const MYC = 'chr8:127,735,434-127,742,951'
const BRCA1 = 'chr17:43,044,295-43,125,364'

/** The Shareable URL a reply gives: the line after "Shareable URL:". */
function linkIn(text: string): string {
  const [, link] = /^Shareable URL:\n(\S+)\n/.exec(text) ?? []
  expect(link, text).toBeDefined()
  return link
}

/**
 * The Session a Shareable URL carries, read as igv-webapp reads it: the
 * `sessionURL` is "blob:" and the Session's JSON, deflated and in base64 with
 * `.`, `_` and `-` in place of `+`, `/` and `=`.
 */
function sessionIn(link: string) {
  const sessionUrl = new URL(link).searchParams.get('sessionURL')!
  expect(sessionUrl).toMatch(/^blob:[A-Za-z0-9._-]+$/)
  const base64 = sessionUrl.slice('blob:'.length).replaceAll('.', '+').replaceAll('_', '/').replaceAll('-', '=')
  return JSON.parse(inflateRawSync(Buffer.from(base64, 'base64')).toString('latin1')) as {
    reference: { id: string }
    locus: string | string[]
    tracks: Array<{ url?: string }>
  }
}

describe('the Shareable URL, round trip', () => {
  it('get_shareable_url returns an igv-webapp link that carries the current Session: genome, locus and tracks', async () => {
    await callTool(room, 'go_to_locus', { locus: MYC })

    const reply = await callTool(room, 'get_shareable_url')

    expect(reply.isError).toBe(false)
    const link = linkIn(reply.text)
    expect(link).toMatch(/^https:\/\/igv\.org\/app\/\?sessionURL=blob:/)
    const session = sessionIn(link)
    expect(session.reference.id).toBe('hg38')
    expect([session.locus].flat()).toEqual([MYC])
    expect(session.tracks.map((track) => track.url)).toContain('https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz')
    // Asking changes nothing.
    expect(reply.summary.loci).toEqual([MYC])
  })

  it('opened in igv-webapp, the link shows the same genome, locus and tracks, with no Room', async () => {
    await callTool(room, 'go_to_locus', { locus: MYC })
    const { summary } = await callTool(room, 'set_track_height', { height: 133, names: ['Refseq All'] })
    const link = linkIn((await callTool(room, 'get_shareable_url')).text)

    // A real fetch of igv-webapp from igv.org, in a page that knows nothing of the Viewer's.
    const webapp = await browser.newPage({ userAgent: await page.evaluate(() => navigator.userAgent) })
    await webapp.goto(link)

    await expect.poll(() => webapp.locator('.igv-search-input').inputValue(), { timeout: 30_000 }).toBe(MYC)
    expect(await webapp.locator('.igv-current-genome').textContent()).toBe('hg38')
    expect(await webapp.locator('.igv-track-label').allTextContents()).toEqual(['Refseq All'])
    // The ideogram, the ruler, and the tracks of the Session summary at their heights.
    const heights = await webapp.locator('.igv-column > .igv-viewport').evaluateAll((viewports) => viewports.map((viewport) => (viewport as HTMLElement).offsetHeight))
    expect(heights.slice(2)).toEqual(summary.tracks.map((track) => track.height))
    expect(heights.at(-1)).toBe(133)
    await webapp.close()
  })

  it('the Viewer shows the same link in a field a person can select, kept up to date as the Session changes', async () => {
    await callTool(room, 'go_to_locus', { locus: MYC })
    const field = page.locator('.shareable-url__field')

    await expect.poll(() => field.inputValue()).toBe(linkIn((await callTool(room, 'get_shareable_url')).text))
    expect(await field.getAttribute('readonly')).not.toBeNull()

    await callTool(room, 'go_to_locus', { locus: BRCA1 })

    await expect.poll(async () => [sessionIn(await field.inputValue()).locus].flat()).toEqual([BRCA1])
    expect(await field.inputValue()).toBe(linkIn((await callTool(room, 'get_shareable_url')).text))
  })

  it('the copy button copies the link', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const link = linkIn((await callTool(room, 'get_shareable_url')).text)
    await expect.poll(() => page.locator('.shareable-url__field').inputValue()).toBe(link)

    await page.getByRole('button', { name: 'Copy' }).click()

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link)
    expect(await page.locator('.shareable-url__copy').textContent()).toBe('Copied')
  })
})
