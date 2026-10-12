/** How long the copy button says the link was copied. */
const COPIED_MS = 1500

export interface ControlPanel {
  /** Shows `url` as the Shareable URL: the link of the Session as it now stands. */
  showShareableUrl(url: string): void
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
 * The Control panel of the page: the Shareable URL in a field with a copy
 * button, and the button in the Viewer's header that retracts the panel and
 * brings it back.
 */
export function controlPanel(page: ParentNode = document): ControlPanel {
  const panel = page.querySelector<HTMLElement>('.control-panel')!
  const toggle = page.querySelector<HTMLButtonElement>('.viewer__panel-toggle')!
  const field = page.querySelector<HTMLInputElement>('.shareable-url__field')!
  const copyButton = page.querySelector<HTMLButtonElement>('.shareable-url__copy')!

  toggle.addEventListener('click', () => {
    const retracted = panel.classList.toggle('control-panel--retracted')
    toggle.setAttribute('aria-expanded', String(!retracted))
    toggle.textContent = retracted ? 'Show controls' : 'Hide controls'
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
  }
}
