/**
 * Room face: Viewers are real WebSocket clients on the Worker's /ws; tests
 * assert the messages each Viewer receives.
 */
import { env } from 'cloudflare:test'
import { describe, it, expect, afterEach } from 'vitest'
import { MessageType } from 'igvjs-mcp-viewer/protocol'
import { ORIGIN, upgrade, openViewer, join, closeViewers } from './viewers.ts'

afterEach(closeViewers)

describe('join', () => {
  it('a Viewer that joins is answered with the id of its Room', async () => {
    const viewer = await openViewer('7ZQH4M2K9X')

    expect(await join(viewer)).toEqual({ type: MessageType.JOINED, room: '7ZQH4M2K9X' })
  })
})

describe('Room id', () => {
  it.each([
    ['no room', ''],
    ['a room that is not a Room id', '?room=not-a-room'],
  ])('an upgrade with %s is refused with 400', async (_, query) => {
    expect((await upgrade(query)).status).toBe(400)
  })
})

describe('Viewer origins', () => {
  it('every origin on the configured list may upgrade', async () => {
    expect(env.VIEWER_ORIGINS).toContain(ORIGIN)
    for (const origin of env.VIEWER_ORIGINS) {
      const res = await upgrade('?room=7ZQH4M2K9X', origin)
      expect(res.status, origin).toBe(101)
      res.webSocket!.accept()
      res.webSocket!.close()
    }
  })

  it('an upgrade from an origin not on the list is refused with 403', async () => {
    expect((await upgrade('?room=7ZQH4M2K9X', 'https://evil.example')).status).toBe(403)
  })

  it('an upgrade with no Origin header is refused with 403', async () => {
    expect((await upgrade('?room=7ZQH4M2K9X', null)).status).toBe(403)
  })
})
