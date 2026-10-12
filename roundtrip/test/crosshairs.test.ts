/**
 * Showing and hiding the crosshairs and the centre line, round trip: the built
 * Viewer runs igv.js in a headless browser, and what the Session summary says
 * is showing is what igv.js draws.
 */
import { describe, it, expect, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import { callTool, newSession, openViewer } from '../model.ts'

const browsers: Browser[] = []

/** A new Room with a Viewer in it. At a locus, unless `locus` is "all": the whole-genome view has no centre line. */
async function roomWithViewer(locus = 'chr8:127,735,434-127,742,951') {
  const room = await newSession()
  const { browser, page } = await openViewer(room)
  browsers.push(browser)
  await callTool(room, 'go_to_locus', { locus })
  return { room, page }
}

afterAll(() => Promise.all(browsers.map((browser) => browser.close())))

/** Long enough for the Viewer to see that igv.js has gone quiet and save its Session in the Room. */
const SAVED_MS = 1500

/** Whether igv.js draws the elements at `selector`: it hides each by its `display`. */
async function drawn(page: Page, selector: string): Promise<boolean> {
  const displays = await page.locator(selector).evaluateAll((elements) => elements.map((element) => (element as HTMLElement).style.display))
  expect(displays.length).toBeGreaterThan(0)
  return displays.every((display) => display !== 'none')
}

const crosshairsDrawn = (page: Page) => drawn(page, '.igv-cursor-guide-vertical, .igv-cursor-guide-horizontal')
const centreLineDrawn = (page: Page) => drawn(page, '.igv-center-line')

describe('crosshairs and centre line, round trip', () => {
  it('set_crosshairs shows the crosshairs and hides them again, in igv.js and in the Session summary', async () => {
    const { room, page } = await roomWithViewer()
    expect(await crosshairsDrawn(page)).toBe(false)

    const shown = await callTool(room, 'set_crosshairs', { show: true })
    expect(shown.isError).toBe(false)
    expect(shown.summary).toMatchObject({ crosshairs: true, centreLine: false })
    expect(await crosshairsDrawn(page)).toBe(true)
    expect(await centreLineDrawn(page)).toBe(false)

    const hidden = await callTool(room, 'set_crosshairs', { show: false })
    expect(hidden.isError).toBe(false)
    expect(hidden.summary).toMatchObject({ crosshairs: false, centreLine: false })
    expect(await crosshairsDrawn(page)).toBe(false)
  })

  it('set_centre_line shows the centre line and hides it again, in igv.js and in the Session summary', async () => {
    const { room, page } = await roomWithViewer()
    expect(await centreLineDrawn(page)).toBe(false)

    const shown = await callTool(room, 'set_centre_line', { show: true })
    expect(shown.isError).toBe(false)
    expect(shown.summary).toMatchObject({ crosshairs: false, centreLine: true })
    expect(await centreLineDrawn(page)).toBe(true)
    expect(await crosshairsDrawn(page)).toBe(false)

    const hidden = await callTool(room, 'set_centre_line', { show: false })
    expect(hidden.isError).toBe(false)
    expect(hidden.summary).toMatchObject({ crosshairs: false, centreLine: false })
    expect(await centreLineDrawn(page)).toBe(false)
  })

  it('showing what is already showing leaves it showing', async () => {
    const { room, page } = await roomWithViewer()
    await callTool(room, 'set_crosshairs', { show: true })
    await callTool(room, 'set_centre_line', { show: true })

    const crosshairs = await callTool(room, 'set_crosshairs', { show: true })
    const centreLine = await callTool(room, 'set_centre_line', { show: true })

    expect(centreLine.summary).toMatchObject({ crosshairs: true, centreLine: true })
    expect(crosshairs.isError || centreLine.isError).toBe(false)
    expect(await crosshairsDrawn(page)).toBe(true)
    expect(await centreLineDrawn(page)).toBe(true)
  })

  it("igv.js's own buttons agree with the model: one press hides what the model showed", async () => {
    const { room, page } = await roomWithViewer()
    await callTool(room, 'set_crosshairs', { show: true })
    await callTool(room, 'set_centre_line', { show: true })

    await page.getByTitle('Crosshairs').click()
    await page.getByTitle('Center Line').click()

    expect(await crosshairsDrawn(page)).toBe(false)
    expect(await centreLineDrawn(page)).toBe(false)
    expect((await callTool(room, 'read_session_summary')).summary).toMatchObject({ crosshairs: false, centreLine: false })
  })

  it('both are part of the Session: a reload brings them back as the model left them', async () => {
    const { room, page } = await roomWithViewer()
    // The locus is saved first: igv.js announces that change, and neither of these.
    await page.waitForTimeout(SAVED_MS)
    await callTool(room, 'set_crosshairs', { show: true })
    await callTool(room, 'set_centre_line', { show: true })
    await page.waitForTimeout(SAVED_MS)

    await page.reload()
    await page.locator('.viewer__status--joined').waitFor()

    expect((await callTool(room, 'read_session_summary')).summary).toMatchObject({ crosshairs: true, centreLine: true })
    expect(await crosshairsDrawn(page)).toBe(true)
    expect(await centreLineDrawn(page)).toBe(true)
  })

  it('going to the whole-genome view hides both, and they stay hidden at the next locus', async () => {
    const { room, page } = await roomWithViewer()
    await callTool(room, 'set_crosshairs', { show: true })
    await callTool(room, 'set_centre_line', { show: true })

    const wholeGenome = await callTool(room, 'go_to_locus', { locus: 'all' })
    expect(wholeGenome.summary).toMatchObject({ crosshairs: false, centreLine: false })
    expect(await crosshairsDrawn(page)).toBe(false)
    expect(await centreLineDrawn(page)).toBe(false)

    const locus = await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })
    expect(locus.summary).toMatchObject({ crosshairs: false, centreLine: false })
  })

  it('the whole-genome view has no centre line: showing it there is an error, and it stays hidden', async () => {
    const { room, page } = await roomWithViewer('all')

    const reply = await callTool(room, 'set_centre_line', { show: true })

    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(/^Error: The whole-genome view has no centre line\. Go to a locus or gene first\.\n/)
    expect(reply.summary).toMatchObject({ centreLine: false })
    expect(await centreLineDrawn(page)).toBe(false)
  })
})
