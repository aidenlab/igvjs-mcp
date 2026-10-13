/**
 * The Controls, round trip: in the built Viewer, one button hides and shows
 * the Shareable URL and igv.js's Navigation bar together, by hand.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import { VIEWER_URL } from '../addresses.ts'
import { callTool, newSession, openViewer } from '../model.ts'

let browser: Browser
let page: Page
let room: string

beforeAll(async () => {
  room = await newSession()
  ;({ browser, page } = await openViewer(room))
  // The link is there once igv.js has loaded.
  await page.locator('.shareable-url__copy:enabled').waitFor()
})

afterAll(() => browser?.close())

const MYC = 'chr8:127,735,434-127,742,951'
const BRCA1 = 'chr17:43,044,295-43,125,364'

const shareableUrl = () => page.locator('.controls')
// igv.js draws itself in a shadow root, which a locator reaches into.
const navigationBar = () => page.locator('.igv-navbar')
const locusBox = () => page.locator('.igv-search-input')
const hide = () => page.getByRole('button', { name: 'Hide controls' }).click()
const show = () => page.getByRole('button', { name: 'Show controls' }).click()
/** How far down the page the tracks of the genome browser start. */
const tracksTop = async () => (await page.locator('.igv-column-container').boundingBox())!.y

// Each test starts with the Controls shown, whatever became of the one before.
beforeEach(async () => {
  const showButton = page.getByRole('button', { name: 'Show controls' })
  if (await showButton.isVisible()) await showButton.click()
})

describe('the Controls, round trip', () => {
  it('the Controls are shown when the Viewer opens', async () => {
    expect(await shareableUrl().isVisible()).toBe(true)
    expect(await navigationBar().isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: 'Hide controls' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('"Hide controls" hides the Shareable URL and the Navigation bar, and the genome browser takes the space they leave', async () => {
    const height = (await shareableUrl().boundingBox())!.height + (await navigationBar().boundingBox())!.height
    const shown = await tracksTop()

    await hide()

    expect(await shareableUrl().isVisible()).toBe(false)
    expect(await navigationBar().isVisible()).toBe(false)
    // The Navigation bar leaves its margin too.
    expect(await tracksTop()).toBeLessThanOrEqual(shown - height)
    // The status line and the button stay.
    expect(await page.locator('.viewer__status').isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: 'Show controls' }).getAttribute('aria-expanded')).toBe('false')

    await show()

    expect(await shareableUrl().isVisible()).toBe(true)
    expect(await navigationBar().isVisible()).toBe(true)
    expect(await tracksTop()).toBe(shown)
    expect(await page.locator('.viewer__status').isVisible()).toBe(true)
  })

  it('hidden or not, the Shareable URL is kept up to date', async () => {
    await hide()
    const { text } = await callTool(room, 'go_to_locus', { locus: BRCA1 }).then(() => callTool(room, 'get_shareable_url'))

    await show()

    const [, link] = /^Shareable URL:\n(\S+)\n/.exec(text)!
    await expect.poll(() => page.locator('.shareable-url__field').inputValue()).toBe(link)
  })

  it('a locus the model sets while the Controls are hidden is in the locus box when they are shown again', async () => {
    await hide()
    await callTool(room, 'go_to_locus', { locus: MYC })

    await show()

    await expect.poll(() => locusBox().inputValue()).toBe(MYC)
  })

  it('shown again, the Navigation bar works as before: a locus typed in its locus box is where the genome browser goes', async () => {
    await hide()
    await show()

    await locusBox().fill(BRCA1)
    await locusBox().press('Enter')

    await expect.poll(async () => (await callTool(room, 'get_shareable_url')).summary.loci).toEqual([BRCA1])
  })

  it('with the Controls hidden, a track still opens its gear menu', async () => {
    await hide()

    await page.locator('.igv-gear-menu-column > div > div').last().click()

    expect(await page.locator('.igv-menu-popup').filter({ visible: true }).count()).toBe(1)
    await page.keyboard.press('Escape')
    await show()
  })

  it('Controls hidden while igv.js is loading are hidden on the genome browser it brings', async () => {
    const loading = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    // igv.js reads its list of genomes first: held back, it is still loading when the button is pressed.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await loading.route('**/genomes/genomes3.json', async (route) => {
      await held
      await route.continue()
    })
    await loading.goto(`${VIEWER_URL}/?room=${await newSession()}`)
    await loading.locator('.viewer__status--joined').waitFor()

    await loading.getByRole('button', { name: 'Hide controls' }).click()
    release()

    // The bar is igv.js's to show until it has loaded.
    await loading.locator('.shareable-url__copy:enabled').waitFor({ state: 'attached' })
    expect(await loading.locator('.igv-navbar').isVisible()).toBe(false)
    expect(await loading.locator('.igv-column-container').isVisible()).toBe(true)
    await loading.getByRole('button', { name: 'Show controls' }).click()
    expect(await loading.locator('.igv-navbar').isVisible()).toBe(true)
    await loading.close()
  })

  it('a reload shows the Controls again', async () => {
    await hide()

    await page.reload()
    await page.locator('.viewer__status--joined').waitFor()

    await page.locator('.shareable-url__copy:enabled').waitFor()
    expect(await navigationBar().isVisible()).toBe(true)
    expect(await shareableUrl().isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: 'Hide controls' }).isVisible()).toBe(true)
  })
})
