/**
 * Brings up the stack under test: the Viewer, built as it is for deployment and
 * served statically, and the local Worker under `wrangler dev`.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SERVER_URL, VIEWER_URL } from './addresses.ts'

const REPO_ROOT = join(import.meta.dirname, '..')

async function listening(url: string): Promise<boolean> {
  try {
    await fetch(url)
    return true
  } catch {
    return false
  }
}

async function start(name: string, url: string, command: string, args: string[], cwd: string): Promise<ChildProcess> {
  if (await listening(url)) throw new Error(`${url} is already in use; the round trip needs it for ${name}`)
  let output = ''
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout!.on('data', (chunk) => (output += chunk))
  child.stderr!.on('data', (chunk) => (output += chunk))

  const deadline = Date.now() + 60_000
  while (!(await listening(url))) {
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill()
      throw new Error(`${name} did not start at ${url}:\n${output}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return child
}

export default async function setup() {
  const scratch = mkdtempSync(join(tmpdir(), 'igv-bot-roundtrip-'))
  const dist = join(scratch, 'dist')
  const port = (url: string) => new URL(url).port

  // Vite inlines VITE_SERVER_URL at build time: this Viewer joins its Room on the Worker started below.
  execFileSync('npm', ['run', 'build', '--workspace', 'viewer', '--', '--outDir', dist], {
    cwd: REPO_ROOT,
    env: { ...process.env, VITE_SERVER_URL: SERVER_URL },
    stdio: 'pipe',
  })

  const children: ChildProcess[] = []
  try {
    children.push(
      await start(
        'the Viewer',
        VIEWER_URL,
        'npx',
        ['vite', 'preview', '--outDir', dist, '--port', port(VIEWER_URL), '--strictPort'],
        join(REPO_ROOT, 'viewer'),
      ),
    )
    children.push(
      await start(
        'the Worker',
        SERVER_URL,
        'npx',
        ['wrangler', 'dev', '--port', port(SERVER_URL), '--inspector-port', '0', '--persist-to', join(scratch, 'state')],
        join(REPO_ROOT, 'server'),
      ),
    )
  } catch (error) {
    for (const child of children) child.kill()
    throw error
  }

  return () => {
    for (const child of children) child.kill()
    rmSync(scratch, { recursive: true, force: true })
  }
}
