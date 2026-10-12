import { describe, it, expect } from 'vitest'
import { shareableUrl } from '../src/shareableUrl.ts'

describe('shareableUrl', () => {
  it("is igv-webapp's address with the compressed Session as its sessionURL, a blob, as igv-webapp's own share feature writes it", () => {
    const browser = { compressedSession: () => 'rZRva9swEMa_ShF9.Oz-' }

    expect(shareableUrl(browser)).toBe('https://igv.org/app/?sessionURL=blob:rZRva9swEMa_ShF9.Oz-')
  })
})
