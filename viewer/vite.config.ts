import { defineConfig } from 'vite'

// The dev server passes /ws on to the local Worker, so the Viewer joins its
// Room through its own address. Claude desktop's built-in browser blocks a page
// from opening a socket to another local address such as localhost:8787.
// The port is fixed: the local Worker's VIEWER_URL and VIEWER_ORIGINS name it.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
})
