import { defineConfig } from 'vitest/config'

// Slow and not hermetic: igv.js fetches hg38 and looks genes up over the network.
export default defineConfig({
  test: {
    name: 'roundtrip',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
