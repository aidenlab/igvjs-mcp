/**
 * Changes made by hand, round trip: a person pans igv.js with the mouse or
 * uses a track's gear menu in the headless browser, and the next tool reply
 * carries the Session summary of what they left.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import { callTool, newRoom, openViewer } from '../model.ts'

let browser: Browser
let page: Page
let room: string

beforeAll(async () => {
  room = await newRoom()
  ;({ browser, page } = await openViewer(room))
})

afterAll(() => browser?.close())

/** The start and end, in base pairs, of a locus such as "chr8:127,735,434-127,742,951". */
function span(locus: string): [number, number] {
  const [start, end] = locus.split(':')[1].split('-').map((n) => Number(n.replaceAll(',', '')))
  return [start, end]
}

describe('a change made by hand, round trip', () => {
  it('a pan with the mouse shows in the next reply: read_session_summary gives the new locus', async () => {
    await callTool(room, 'go_to_locus', { locus: 'chr1:1,000,001-1,002,000' })

    // Drag the annotation track a quarter of the way to the right: the view moves left.
    const box = (await page.locator('.igv-column > .igv-viewport').last().boundingBox())!
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 10 })
    await page.mouse.up()

    const reply = await callTool(room, 'read_session_summary')

    expect(reply.isError).toBe(false)
    expect(reply.summary.loci).toHaveLength(1)
    const [start, end] = span(reply.summary.loci[0])
    expect(reply.summary.loci[0]).toMatch(/^chr1:/)
    expect(end - start + 1).toBe(2000)
    expect(start).toBeGreaterThan(1_000_001 - 600)
    expect(start).toBeLessThan(1_000_001 - 400)
  })

  it('read_session_summary changes nothing: asked twice, it gives the same summary', async () => {
    const first = await callTool(room, 'read_session_summary')
    const second = await callTool(room, 'read_session_summary')

    expect(second.summary).toEqual(first.summary)
  })

  it("a track removed from its gear menu is gone from the next reply's track list", async () => {
    const before = await callTool(room, 'read_session_summary')
    expect(before.summary.tracks.map((track) => track.name)).toEqual(['sequence', 'Refseq All'])

    await page.locator('.igv-gear-menu-column > div').last().locator('div').first().click()
    await page.getByText('Remove track', { exact: true }).click()

    const reply = await callTool(room, 'zoom_in')

    expect(reply.isError).toBe(false)
    expect(reply.summary.tracks).toEqual([{ name: 'sequence', type: 'sequence', height: 25 }])
  })
})
