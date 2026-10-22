// @vitest-environment happy-dom
/**
 * The Controls, on a page built as the Viewer's index.html builds it: tests
 * press the button and read what the page shows.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { controls, type NavigationBarOwner } from '../src/controls.ts'
import type { ViewerSettings } from '../src/protocol.ts'

beforeEach(() => {
  document.body.innerHTML = `
    <button class="viewer__controls-toggle" type="button" aria-controls="controls" aria-expanded="false">Show controls</button>
    <section class="controls controls--hidden" id="controls">
      <input class="shareable-url__field" type="text" readonly />
      <button class="shareable-url__copy" type="button" disabled>Copy</button>
    </section>`
})

const toggle = () => document.querySelector<HTMLButtonElement>('.viewer__controls-toggle')!
const stripHidden = () => document.querySelector('.controls')!.classList.contains('controls--hidden')

/** A genome browser whose Navigation bar is shown or hidden as igv.js's is. */
function genomeBrowser(shown: boolean): NavigationBarOwner & { navbarShown: boolean } {
  const browser = {
    navbarShown: shown,
    navbar: {
      hide: () => void (browser.navbarShown = false),
      show: () => void (browser.navbarShown = true),
      navbarDidResize: () => {},
    },
  }
  return browser
}

describe('the Controls', () => {
  it('start hidden, with the button offering to show them', () => {
    const page = controls()
    const browser = genomeBrowser(false)
    page.setGenomeBrowser(browser)

    expect(stripHidden()).toBe(true)
    expect(browser.navbarShown).toBe(false)
    expect(toggle().textContent).toBe('Show controls')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('the button shows them, then hides them again, and each change is reported as the Viewer settings', () => {
    const reported: ViewerSettings[] = []
    const page = controls(document, (settings) => reported.push(settings))
    const browser = genomeBrowser(false)
    page.setGenomeBrowser(browser)

    toggle().click()

    expect(stripHidden()).toBe(false)
    expect(browser.navbarShown).toBe(true)
    expect(toggle().textContent).toBe('Hide controls')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')

    toggle().click()

    expect(stripHidden()).toBe(true)
    expect(browser.navbarShown).toBe(false)
    expect(toggle().textContent).toBe('Show controls')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(reported).toEqual([{ controls: true }, { controls: false }])
  })

  it('shown by the one function, the button reads as the button would leave it, and pressing it hides them', () => {
    const reported: ViewerSettings[] = []
    const page = controls(document, (settings) => reported.push(settings))

    page.showControls(true)

    expect(stripHidden()).toBe(false)
    expect(toggle().textContent).toBe('Hide controls')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')

    toggle().click()

    expect(stripHidden()).toBe(true)
    expect(reported).toEqual([{ controls: true }, { controls: false }])
  })

  it('shown before igv.js has loaded, the Navigation bar is shown once the genome browser exists', () => {
    const page = controls()
    page.showControls(true)
    // igv.js creates the bar hidden.
    const browser = genomeBrowser(false)

    page.setGenomeBrowser(browser)

    expect(browser.navbarShown).toBe(true)
  })

  it('restored from the Room, are shown as saved there, and the Room is not told again', () => {
    const reported: ViewerSettings[] = []
    const page = controls(document, (settings) => reported.push(settings))

    page.restoreViewerSettings({ controls: true })

    expect(stripHidden()).toBe(false)
    expect(toggle().textContent).toBe('Hide controls')
    expect(reported).toEqual([])
  })

  it('shown by hand before the Room answered, stay shown whatever the Room had saved', () => {
    const reported: ViewerSettings[] = []
    const page = controls(document, (settings) => reported.push(settings))
    toggle().click()

    page.restoreViewerSettings({ controls: false })

    expect(stripHidden()).toBe(false)
    expect(reported).toEqual([{ controls: true }])
  })

  it('left hidden while igv.js loads, the Navigation bar it creates hidden stays hidden', () => {
    const page = controls()
    page.showControls(true)
    page.showControls(false)
    const browser = genomeBrowser(false)

    page.setGenomeBrowser(browser)

    expect(browser.navbarShown).toBe(false)
  })
})
