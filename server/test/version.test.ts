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

const version = (headers: Record<string, string> = {}) => SELF.fetch('https://igv-bot.test/version', { headers })

/** What a browser sends when the address is opened. */
const BROWSER = { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }

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

  it('answers JSON to curl and scripts, which do not ask for HTML', async () => {
    serve({ [PAGE_VERSION_URL]: () => Response.json({ version: 'main (9e1d2b7)' }) })

    const response = await version({ Accept: '*/*' })

    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/)
  })

  describe('opened in a browser', () => {
    it('answers a page naming both versions and where each runs', async () => {
      serve({ [PAGE_VERSION_URL]: () => Response.json({ version: 'main (9e1d2b7)' }) })

      const response = await version(BROWSER)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const html = await response.text()
      expect(html).toMatch(/^<!doctype html>/)
      expect(html).toContain('main (d4e5f6a)')
      expect(html).toContain('main (9e1d2b7)')
      expect(html).toContain('igv-bot.test')
      expect(html).toContain('localhost:5173')
    })

    it("shows why the page's version could not be read", async () => {
      serve({ [PAGE_VERSION_URL]: () => new Response('Not Found', { status: 404 }) })

      const html = await (await version(BROWSER)).text()

      expect(html).toContain('could not be read: HTTP 404')
    })

    it("escapes what the page's file says", async () => {
      serve({ [PAGE_VERSION_URL]: () => Response.json({ version: '<script>alert(1)</script>' }) })

      const html = await (await version(BROWSER)).text()

      expect(html).not.toContain('<script>alert(1)</script>')
      expect(html).toContain('&#60;script&#62;')
    })
  })
})
