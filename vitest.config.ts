import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'server/vitest.config.ts',
      'viewer/vitest.config.ts',
      { test: { name: 'scripts', include: ['scripts/**/*.test.mjs'] } },
    ],
  },
})
