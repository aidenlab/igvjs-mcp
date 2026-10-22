/**
 * The Controls, round trip: in the built Viewer, one button hides and shows
 * the Shareable URL and igv.js's Navigation bar together, by hand. They start
 * hidden, and the Room keeps whether they are shown, beside the Session.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import { VIEWER_URL } from '../addresses.ts'
import { callTool, newSession, openViewer, showControls, toolReply } from '../model.ts'

let browser: Browser
let page: Page
let room: string

beforeAll(async () => {
  room = await newSession()
  ;({ browser, page } = await openViewer(room))
  // The link is there once igv.js has loaded, hidden with the Controls.
  await page.locator('.shareable-url__copy:enabled').waitFor({ state: 'attached' })
})

afterAll(() => browser?.close())

const MYC = 'chr8:127,735,434-127,742,951'
const BRCA1 = 'chr17:43,044,295-43,125,364'
/** Long enough for the Viewer to see that igv.js has gone quiet and save its Session in the Room. */
const SAVED_MS = 1500

/** A second Viewer on the Join link of `room`, in the same headless browser, once igv.js has loaded in it. */
async function anotherViewer(room: string): Promise<Page> {
  const other = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await other.goto(`${VIEWER_URL}/?room=${room}`)
  await other.locator('.shareable-url__copy:enabled').waitFor({ state: 'attached' })
  return other
}

/** What `viewer` shows of the Controls: the Shareable URL, the Navigation bar, and the button offering to hide them. */
async function controlsOn(viewer: Page) {
  return {
    shareableUrl: await viewer.locator('.controls').isVisible(),
    navigationBar: await viewer.locator('.igv-navbar').isVisible(),
    hideOffered: await viewer.getByRole('button', { name: 'Hide controls' }).isVisible(),
  }
}
const SHOWN = { shareableUrl: true, navigationBar: true, hideOffered: true }
const HIDDEN = { shareableUrl: false, navigationBar: false, hideOffered: false }

const shareableUrlStrip = () => page.locator('.controls')
// igv.js draws itself in a shadow root, which a locator reaches into.
const navigationBar = () => page.locator('.igv-navbar')
const locusBox = () => page.locator('.igv-search-input')
/** igv.js's magnifying glass, beside the locus box. */
const searchIcon = () => page.locator('.igv-search-icon-container')
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
  it('the Controls are hidden when a new Viewer opens, and the button offers to show them', async () => {
    const opened = await anotherViewer(await newSession())

    expect(await controlsOn(opened)).toEqual(HIDDEN)
    // The status line and the button are always shown.
    expect(await opened.locator('.viewer__status').isVisible()).toBe(true)
    expect(await opened.getByRole('button', { name: 'Show controls' }).getAttribute('aria-expanded')).toBe('false')
    await opened.close()
  })

  it('a Viewer opened on a genome and locus has its Controls hidden too', async () => {
    const { structuredContent } = await toolReply(await newSession(), 'open_viewer', { genome: 'mm10', locus: 'chr11' })
    const opened = await anotherViewer((structuredContent as { room: string }).room)

    expect(await controlsOn(opened)).toEqual(HIDDEN)
    await opened.close()
  })

  it('"Hide controls" hides the Shareable URL and the Navigation bar, and the genome browser takes the space they leave', async () => {
    const height = (await shareableUrlStrip().boundingBox())!.height + (await navigationBar().boundingBox())!.height
    const shown = await tracksTop()

    await hide()

    expect(await shareableUrlStrip().isVisible()).toBe(false)
    expect(await navigationBar().isVisible()).toBe(false)
    // The Navigation bar leaves its margin too.
    expect(await tracksTop()).toBeLessThanOrEqual(shown - height)
    // The status line and the button stay.
    expect(await page.locator('.viewer__status').isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: 'Show controls' }).getAttribute('aria-expanded')).toBe('false')

    await show()

    expect(await shareableUrlStrip().isVisible()).toBe(true)
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

  it('Controls shown while igv.js is loading are shown on the genome browser it brings', async () => {
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

    await showControls(loading)
    release()

    // The bar is igv.js's, and there to show once it has loaded.
    await loading.locator('.shareable-url__copy:enabled').waitFor()
    expect(await loading.locator('.igv-navbar').isVisible()).toBe(true)
    expect(await loading.locator('.igv-column-container').isVisible()).toBe(true)
    await loading.getByRole('button', { name: 'Hide controls' }).click()
    expect(await loading.locator('.igv-navbar').isVisible()).toBe(false)
    await loading.close()
  })

  it('the Navigation bar shows no Save Image button, no Select Tracks button and no magnifying glass, on the default Viewer and on a restored Session', async () => {
    /** The tooltips of the buttons the bar shows: igv.js gives each button its name as one. */
    const labels = () =>
      navigationBar().evaluate((bar) =>
        Array.from(bar.querySelectorAll('.igv-navbar-text-button, .igv-navbar-icon-button'))
          .filter((button) => button.getClientRects().length > 0)
          .map((button) => button.getAttribute('title')),
      )

    expect(await labels()).toContain('Crosshairs')
    expect(await labels()).not.toContain('Save Image')
    expect(await labels()).not.toContain('Select Tracks')
    expect(await searchIcon().isVisible()).toBe(false)

    // The Room now has a Session for the reload to restore.
    await callTool(room, 'go_to_locus', { locus: MYC })
    await page.waitForTimeout(SAVED_MS)
    await page.reload()
    await page.locator('.shareable-url__copy:enabled').waitFor()

    await expect.poll(() => locusBox().inputValue()).toBe(MYC)
    expect(await labels()).toContain('Crosshairs')
    expect(await labels()).not.toContain('Save Image')
    expect(await labels()).not.toContain('Select Tracks')
    expect(await searchIcon().isVisible()).toBe(false)
  })

  it('shown by hand, the Controls are still shown after a reload, and the Shareable URL is the same as before they were shown', async () => {
    const ownRoom = await newSession()
    const reopened = await anotherViewer(ownRoom)
    const before = (await callTool(ownRoom, 'get_shareable_url')).text

    await showControls(reopened)
    await reopened.reload()
    await reopened.locator('.shareable-url__copy:enabled').waitFor()

    expect(await controlsOn(reopened)).toEqual(SHOWN)
    expect((await callTool(ownRoom, 'get_shareable_url')).text).toBe(before)
    await reopened.close()
  })

  it('hidden by hand, the Controls are still hidden after a reload', async () => {
    await hide()

    await page.reload()
    await page.locator('.shareable-url__copy:enabled').waitFor({ state: 'attached' })

    expect(await controlsOn(page)).toEqual(HIDDEN)
  })

  it('a Viewer that joins later shows the Controls as they were last left, and a click in one Viewer does not reach the other', async () => {
    const later = await anotherViewer(room)
    expect(await controlsOn(later)).toEqual(SHOWN)

    await hide()

    expect(await controlsOn(later)).toEqual(SHOWN)
    await later.close()
  })
})
