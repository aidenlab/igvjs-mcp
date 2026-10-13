/** How long the copy button says the link was copied. */
const COPIED_MS = 1500

/** As much of igv.js as hiding and showing its Navigation bar takes. */
export interface NavigationBarOwner {
  navbar: {
    hide(): void
    show(): void
    navbarDidResize(): void
  }
}

export interface Controls {
  /** Shows `url` as the Shareable URL: the link of the Session as it now stands. */
  showShareableUrl(url: string): void
  /** Takes `browser` as the genome browser on the page: its Navigation bar is hidden if the Controls are, and from now on with them. */
  setGenomeBrowser(browser: NavigationBarOwner): void
}

/**
 * Shows or hides igv.js's Navigation bar. igv.js draws itself in a shadow root
 * no stylesheet of the Viewer reaches, and has no public call for this after
 * creation: this is what its own `showNavigation: false` does.
 */
function showNavigationBar(browser: NavigationBarOwner, show: boolean) {
  if (show) {
    browser.navbar.show()
    // Hidden, the bar has no width to fit its buttons to.
    browser.navbar.navbarDidResize()
  } else {
    browser.navbar.hide()
  }
}

/** Copies `field`'s text. Where the page is refused the clipboard, the text is left selected for the person to copy. */
async function copy(field: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(field.value)
    return true
  } catch {
    field.select()
    return document.execCommand('copy')
  }
}

/**
 * The Controls of the page: the Shareable URL in a field with a copy button,
 * igv.js's Navigation bar, and the button in the Viewer's header that hides
 * the two and shows them again. Whether they are hidden is kept nowhere.
 */
export function controls(page: ParentNode = document): Controls {
  const strip = page.querySelector<HTMLElement>('.controls')!
  const toggle = page.querySelector<HTMLButtonElement>('.viewer__controls-toggle')!
  const field = page.querySelector<HTMLInputElement>('.shareable-url__field')!
  const copyButton = page.querySelector<HTMLButtonElement>('.shareable-url__copy')!

  let hidden = false
  let genomeBrowser: NavigationBarOwner | undefined
  toggle.addEventListener('click', () => {
    hidden = !hidden
    strip.classList.toggle('controls--hidden', hidden)
    if (genomeBrowser) showNavigationBar(genomeBrowser, !hidden)
    toggle.setAttribute('aria-expanded', String(!hidden))
    toggle.textContent = hidden ? 'Show controls' : 'Hide controls'
  })

  // The link is too long to drag across: one click takes all of it.
  field.addEventListener('focus', () => field.select())

  let copied: ReturnType<typeof setTimeout> | undefined
  copyButton.addEventListener('click', async () => {
    if (!(await copy(field))) return
    copyButton.textContent = 'Copied'
    clearTimeout(copied)
    copied = setTimeout(() => (copyButton.textContent = 'Copy'), COPIED_MS)
  })

  return {
    showShareableUrl(url) {
      field.value = url
      copyButton.disabled = false
    },
    setGenomeBrowser(browser) {
      genomeBrowser = browser
      if (hidden) showNavigationBar(browser, false)
    },
  }
}
