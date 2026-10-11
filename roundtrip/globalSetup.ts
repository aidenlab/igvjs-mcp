/**
 * Builds the Viewer against the round-trip server address, then serves it with
 * `vite preview` beside the Worker under `wrangler dev`. Both stop when the
 * tests end.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SERVER_URL, VIEWER_URL } from './addresses.ts'

const serverDir = fileURLToPath(new URL('../server', import.meta.url))
const viewerDir = fileURLToPath(new URL('../viewer', import.meta.url))
const builtViewer = fileURLToPath(new URL('./.viewer', import.meta.url))
const workerState = fileURLToPath(new URL('./.wrangler', import.meta.url))

const port = (url: string) => new URL(url).port

let stopping = false

function start(name: string, cwd: string, args: string[]): ChildProcess {
  // Its own process group, so stopping it also stops what npx started.
  const child = spawn('npx', args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout!.on('data', (chunk) => (output += chunk))
  child.stderr!.on('data', (chunk) => (output += chunk))
  child.on('exit', (code) => {
    if (code && !stopping) console.error(`[roundtrip] ${name} exited with ${code}:\n${output}`)
  })
  return child
}

async function answers(url: string, name: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`${name} stopped before it answered at ${url}`)
    try {
      await fetch(url)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`${name} did not answer at ${url} within 60 s`)
}

export default async function setup(): Promise<() => void> {
  const build = spawnSync('npx', ['vite', 'build', '--outDir', builtViewer, '--emptyOutDir'], {
    cwd: viewerDir,
    env: { ...process.env, VITE_SERVER_URL: SERVER_URL },
    encoding: 'utf8',
  })
  if (build.status !== 0) throw new Error(`Building the Viewer failed:\n${build.stdout}\n${build.stderr}`)

  const children = [
    start('wrangler dev', serverDir, [
      'wrangler', 'dev', '--port', port(SERVER_URL), '--inspector-port', '0', '--persist-to', workerState,
      '--var', `VIEWER_URL:${VIEWER_URL}/`,
    ]),
    start('vite preview', viewerDir, ['vite', 'preview', '--outDir', builtViewer, '--port', port(VIEWER_URL), '--strictPort']),
  ]
  const stop = () => {
    stopping = true
    for (const child of children) {
      try {
        process.kill(-child.pid!, 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
  }

  try {
    await Promise.all([answers(SERVER_URL, 'wrangler dev', children[0]), answers(VIEWER_URL, 'vite preview', children[1])])
  } catch (error) {
    stop()
    throw error
  }
  return stop
}
