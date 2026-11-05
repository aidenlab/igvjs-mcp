/**
 * GET /version: what the deployment runs, the Worker's version and the Viewer
 * page's, at one address.
 */
import { SELF } from 'cloudflare:test'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { serve } from './genomeList.ts'

// VIEWER_URL in wrangler.toml's top level, which the tests run.
const PAGE_VERSION_URL = 'http://localhost:5173/version.json'

afterEach(() => vi.restoreAllMocks())

const version = () => SELF.fetch('https://igv-bot.test/version')

describe('/version', () => {
  it("answers the Worker's version and the Viewer page's version.json with its url", async () => {
    serve({ [PAGE_VERSION_URL]: () => Response.json({ version: 'main (9e1d2b7)', built: 'Thursday' }) })

    const response = await version()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      worker: 'main (d4e5f6a)',
      viewer: { url: PAGE_VERSION_URL, version: 'main (9e1d2b7)', built: 'Thursday' },
    })
  })

  it('answers 200 with what failed when the page has no version.json', async () => {
    serve({ [PAGE_VERSION_URL]: () => new Response('Not Found', { status: 404 }) })

    const response = await version()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      worker: 'main (d4e5f6a)',
      viewer: { url: PAGE_VERSION_URL, error: 'HTTP 404' },
    })
  })

  it('answers 200 with what failed when the page does not answer', async () => {
    serve({}) // any fetch fails

    const response = await version()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      worker: 'main (d4e5f6a)',
      viewer: { url: PAGE_VERSION_URL, error: `unexpected fetch of ${PAGE_VERSION_URL}` },
    })
  })

  it("answers 200 with what failed when the page answers with something that is not a version.json, as Pages' fallback index.html", async () => {
    serve({
      [PAGE_VERSION_URL]: () => new Response('<!doctype html><title>igv</title>', { headers: { 'Content-Type': 'text/html' } }),
    })

    const response = await version()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      worker: 'main (d4e5f6a)',
      viewer: { url: PAGE_VERSION_URL, error: 'not a JSON object (text/html)' },
    })
  })
})
