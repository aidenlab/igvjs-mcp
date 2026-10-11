import { defineConfig } from 'vitest/config'

// The command round-trip against the real Viewer: needs a network connection,
// because igv.js fetches the genome and resolves gene names over it.
export default defineConfig({
  test: {
    name: 'roundtrip',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
