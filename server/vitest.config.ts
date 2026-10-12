import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Runs inside workerd with the Worker and its Durable Object from wrangler.toml.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      // ACK_TIMEOUT_MS: the wait for a Viewer's ack, 15 s when deployed, kept short here.
      miniflare: { bindings: { SESSION_HMAC_SECRET: 'test-session-hmac-secret', ACK_TIMEOUT_MS: 300 } },
    }),
  ],
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
  },
})
