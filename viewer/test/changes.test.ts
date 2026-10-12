/**
 * Watching igv.js for changes: a fake browser fires igv.js's events and the
 * tests assert on the Session summaries reported.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QUIET_MS, watchChanges, type ChangeSource } from '../src/changes.ts'
import type { SessionSummary } from '../src/protocol.ts'

/** A browser whose Session summary is its locus, and that fires events as igv.js does. */
function fakeBrowser() {
  const listeners = new Map<string, Array<() => void>>()
  const browser: ChangeSource & { locus: string; fire(event: string): void } = {
    locus: 'all',
    on: (event, listener) => void listeners.set(event, [...(listeners.get(event) ?? []), listener]),
    fire: (event) => listeners.get(event)?.forEach((listener) => listener()),
  }
  const reported: string[][] = []
  watchChanges(
    browser,
    (): SessionSummary => ({ genome: 'hg38', loci: [browser.locus], tracks: [], crosshairs: false, centreLine: false }),
    (summary) => reported.push(summary.loci),
  )
  return { browser, reported }
}

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

describe('watching igv.js for changes', () => {
  it('reports the Session summary as it stands when watching starts', () => {
    const { reported } = fakeBrowser()

    expect(reported).toEqual([['all']])
  })

  it.each(['locuschange', 'trackremoved', 'trackorderchanged', 'trackheightchange', 'tracknamechange', 'genomechange'])(
    'reports the Session summary once igv.js has been quiet after %s',
    (event) => {
      const { browser, reported } = fakeBrowser()
      reported.length = 0

      browser.locus = 'chr8:1-100'
      browser.fire(event)
      vi.advanceTimersByTime(QUIET_MS - 1)
      expect(reported).toEqual([])

      vi.advanceTimersByTime(1)
      expect(reported).toEqual([['chr8:1-100']])
    },
  )

  it('reports a burst of changes, such as a drag, once: the summary at its end', () => {
    const { browser, reported } = fakeBrowser()
    reported.length = 0

    for (let step = 1; step <= 40; step++) {
      browser.locus = `chr8:${step}-${step + 99}`
      browser.fire('locuschange')
      vi.advanceTimersByTime(16) // a frame
    }
    vi.advanceTimersByTime(QUIET_MS)

    expect(reported).toEqual([['chr8:40-139']])
  })

  it('reports each of two changes with a quiet spell between them', () => {
    const { browser, reported } = fakeBrowser()
    reported.length = 0

    browser.locus = 'chr8:1-100'
    browser.fire('locuschange')
    vi.advanceTimersByTime(QUIET_MS)
    browser.locus = 'chr8:201-300'
    browser.fire('locuschange')
    vi.advanceTimersByTime(QUIET_MS)

    expect(reported).toEqual([['chr8:1-100'], ['chr8:201-300']])
  })
})
