/** igv-webapp, the IGV web application: where a Shareable URL opens. */
const IGV_WEBAPP_URL = 'https://igv.org/app/'

/** The part of an igv.js browser a Shareable URL is made from. */
export interface SessionCompressor {
  /** The Session as igv.js writes it, deflated and in a base64 that needs no escaping in a URL. */
  compressedSession(): string
}

/**
 * The Shareable URL of what `browser` is showing: igv-webapp, with the Session
 * carried in the link as igv-webapp's own share feature carries it. No Room
 * and no Viewer is involved in opening it.
 */
export function shareableUrl(browser: SessionCompressor): string {
  return `${IGV_WEBAPP_URL}?sessionURL=blob:${browser.compressedSession()}`
}
