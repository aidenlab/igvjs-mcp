/**
 * What a deployment runs, at one address: the Worker's version and the Viewer
 * page's. geenee reads /version in this shape.
 */

/** How long the page is given to answer. */
const FETCH_TIMEOUT_MS = 5000

/**
 * The Viewer page's version.json as the page serves it, with the address it was
 * read from; or, when it could not be read, what failed.
 */
export type ViewerVersion = { url: string } & Record<string, unknown>

export interface VersionReport {
  /** What the Worker answers an MCP initialize with as serverInfo.version. */
  worker: string
  viewer: ViewerVersion
}

/**
 * Reads the page's version.json, at the root of VIEWER_URL, each time it is
 * asked: the page is deployed on its own, so a kept copy could be out of date.
 */
export async function versionReport(workerVersion: string, viewerUrl: string): Promise<VersionReport> {
  const url = new URL('/version.json', viewerUrl).href
  const viewer = await readViewerVersion(url).then(
    (page) => ({ ...page, url }),
    (error: unknown) => ({ url, error: error instanceof Error ? error.message : String(error) }),
  )
  return { worker: workerVersion, viewer }
}

async function readViewerVersion(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  // Pages answers a path it does not have with the page's index.html, and 200.
  const page: unknown = await response.json().catch(() => undefined)
  if (typeof page !== 'object' || page === null || Array.isArray(page)) {
    throw new Error(`not a JSON object (${response.headers.get('Content-Type') ?? 'no Content-Type'})`)
  }
  return page as Record<string, unknown>
}
