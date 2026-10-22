/**
 * Reopening, round trip: a person changes the Viewer, then reloads it, or
 * closes it and opens the Join link again, and gets their last view back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Browser, Page } from 'playwright'
import type { SessionSummary } from 'igvjs-mcp-viewer/protocol'
import { callTool, newSession, openViewer, showControls } from '../model.ts'

let browser: Browser
let page: Page
let room: string
let left: SessionSummary

/** Long enough for the Viewer to see that igv.js has gone quiet and save its Session in the Room. */
const SAVED_MS = 1500

beforeAll(async () => {
  room = await newSession()
  ;({ browser, page } = await openViewer(room))

  // What the person leaves: a locus, a taller gene track, and both display toggles on.
  await callTool(room, 'go_to_locus', { locus: 'chr8:127,735,434-127,742,951' })
  await page.locator('.igv-gear-menu-column > div').last().locator('div').first().click()
  await page.getByText('Set track height', { exact: true }).click()
  const height = page.locator('.igv-ui-generic-dialog-container input:visible')
  await height.fill('120')
  await height.press('Enter')
  await showControls(page)
  await page.getByTitle('Crosshairs').click()
  await page.getByTitle('Center Line').click()
  await page.waitForTimeout(SAVED_MS)

  left = (await callTool(room, 'read_session_summary')).summary
})

afterAll(() => browser?.close())

describe('reopening, round trip', () => {
  it('what the person left is a view unlike the default', () => {
    expect(left).toEqual({
      genome: 'hg38',
      loci: ['chr8:127,735,434-127,742,951'],
      tracks: [
        { name: 'sequence', type: 'sequence', height: 25 },
        { name: 'Refseq All', type: 'annotation', url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz', height: 120 },
      ],
      crosshairs: true,
      centreLine: true,
    })
  })

  it('a reload restores the Session: genome, locus, tracks with their heights, and both display toggles', async () => {
    await page.reload()
    await page.locator('.viewer__status--joined').waitFor()

    const reply = await callTool(room, 'read_session_summary')

    expect(reply.isError).toBe(false)
    expect(reply.summary).toEqual(left)
  })

  it('the Join link opened again after the Viewer was closed restores the same view', async () => {
    await browser.close()
    ;({ browser, page } = await openViewer(room))

    const reply = await callTool(room, 'read_session_summary')

    expect(reply.summary).toEqual(left)
  })

  it('a Room with no saved Session shows the default Viewer', async () => {
    const fresh = await newSession()
    const other = await openViewer(fresh)
    try {
      const reply = await callTool(fresh, 'read_session_summary')

      expect(reply.summary).toEqual({
        genome: 'hg38',
        loci: ['all'],
        tracks: [
          { name: 'sequence', type: 'sequence', height: 25 },
          { name: 'Refseq All', type: 'annotation', url: 'https://igv.org/genomes/data/hg38/ncbiRefSeq.txt.gz', height: 70 },
        ],
        crosshairs: false,
        centreLine: false,
      })
    } finally {
      await other.browser.close()
    }
  })
})
