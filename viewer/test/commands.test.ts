// @vitest-environment happy-dom
/**
 * The set_controls Command, applied as the Viewer applies it: to a genome
 * browser and the Controls of a page built as the Viewer's index.html builds
 * it. Tests read the page and the Session summary of each outcome.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyCommand, type GenomeBrowser } from '../src/commands.ts'
import { controls, type Controls } from '../src/controls.ts'
import type { CommandOutcome, ViewerSettings } from '../src/protocol.ts'

let page: Controls
let reported: ViewerSettings[]

beforeEach(() => {
  document.body.innerHTML = `
    <button class="viewer__controls-toggle" type="button" aria-controls="controls" aria-expanded="false">Show controls</button>
    <section class="controls controls--hidden" id="controls">
      <input class="shareable-url__field" type="text" readonly />
      <button class="shareable-url__copy" type="button" disabled>Copy</button>
    </section>`
  reported = []
  page = controls(document, (settings) => reported.push(settings))
})

const toggle = () => document.querySelector<HTMLButtonElement>('.viewer__controls-toggle')!
const stripHidden = () => document.querySelector('.controls')!.classList.contains('controls--hidden')

/** A genome browser on hg38's whole-genome view with no tracks: as much of igv.js as a Session summary reads. */
const browser = {
  toJSON: () => ({ reference: { id: 'hg38' }, locus: 'all', tracks: [] }),
  findTracks: () => [],
} as unknown as GenomeBrowser

const setControls = (show: boolean) => applyCommand(browser, { type: 'set_controls', show }, page)
const controlsIn = (outcome: CommandOutcome) => outcome.summary.controls
/** Whether the Session summary of a read_session_summary says the Controls are showing. */
const controlsRead = async () => controlsIn(await applyCommand(browser, { type: 'read_session_summary' }, page))

describe('set_controls', () => {
  it('show: true shows the Controls, the button offers to hide them, and the Session summary says they are showing', async () => {
    const outcome = await setControls(true)

    expect(outcome.ok).toBe(true)
    expect(stripHidden()).toBe(false)
    expect(toggle().textContent).toBe('Hide controls')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(controlsIn(outcome)).toBe(true)
    expect(reported).toEqual([{ controls: true }])
  })

  it('show: false hides them again, and the Session summary says so', async () => {
    await setControls(true)

    const outcome = await setControls(false)

    expect(outcome.ok).toBe(true)
    expect(stripHidden()).toBe(true)
    expect(toggle().textContent).toBe('Show controls')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(controlsIn(outcome)).toBe(false)
  })

  it.each([true, false])('show: %s repeated changes nothing and is no error', async (show) => {
    await setControls(show)

    const outcome = await setControls(show)

    expect(outcome.ok).toBe(true)
    expect(stripHidden()).toBe(!show)
    expect(toggle().textContent).toBe(show ? 'Hide controls' : 'Show controls')
    expect(controlsIn(outcome)).toBe(show)
  })

  it("the Session summary follows the button too: what the person last chose is what the next Command's summary says", async () => {
    toggle().click()
    expect(await controlsRead()).toBe(true)

    toggle().click()
    expect(await controlsRead()).toBe(false)
  })

  it('the button hides Controls the Command showed', async () => {
    await setControls(true)

    toggle().click()

    expect(stripHidden()).toBe(true)
    expect(await controlsRead()).toBe(false)
  })
})
