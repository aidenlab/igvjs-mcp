// scripts/deploy-prod.sh refuses to release anything but a prod- tag that is on origin. It is
// copied into a throwaway repository with a bare origin, so a refusal is all it can reach: a ref
// it accepted would go on to the tests and the deploy, which this repository has none of.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'deploy-prod.sh')
let dir, repo

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
const commit = (text) => {
  writeFileSync(join(repo, 'file'), text)
  git('add', 'file')
  git('commit', '-q', '-m', text)
}
const release = (...args) => spawnSync('bash', [join(repo, 'scripts', 'deploy-prod.sh'), ...args], { cwd: repo, encoding: 'utf8' })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-prod-test-'))
  execFileSync('git', ['init', '-q', '--bare', join(dir, 'origin.git')])
  repo = join(dir, 'repo')
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  git('remote', 'add', 'origin', join(dir, 'origin.git'))
  mkdirSync(join(repo, 'scripts'))
  copyFileSync(SCRIPT, join(repo, 'scripts', 'deploy-prod.sh'))
  commit('one')
  git('push', '-q', 'origin', 'main')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('deploy-prod.sh', () => {
  it('asks for a tag when given none', () => {
    const run = release()
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('usage: scripts/deploy-prod.sh prod-YYYY-MM-DD[.N]')
  })

  it('refuses a branch', () => {
    const run = release('main')
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('not a release tag: main')
  })

  it('refuses a tag that is not named prod-YYYY-MM-DD[.N]', () => {
    git('tag', '-a', 'v1.0.0', '-m', 'release')
    git('push', '-q', 'origin', 'v1.0.0')
    for (const ref of ['v1.0.0', 'prod-2026-11-5', 'prod-2026-11-05-hotfix']) {
      const run = release(ref)
      expect(run.status, ref).toBe(2)
      expect(run.stderr, ref).toContain(`not a release tag: ${ref}`)
    }
  })

  it('refuses a prod- tag that has not been pushed', () => {
    git('tag', '-a', 'prod-2026-11-05', '-m', 'release')
    const run = release('prod-2026-11-05')
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('tag prod-2026-11-05 is not on origin; push it first')
  })

  it('refuses a pushed branch that has a release name but is not a tag', () => {
    git('push', '-q', 'origin', 'main:refs/heads/prod-2026-11-05')
    const run = release('prod-2026-11-05')
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('tag prod-2026-11-05 is not on origin; push it first')
  })

  it('refuses a prod- tag that differs from the one on origin', () => {
    git('tag', '-a', 'prod-2026-11-05', '-m', 'release')
    git('push', '-q', 'origin', 'prod-2026-11-05')
    commit('two')
    git('tag', '-f', '-a', 'prod-2026-11-05', '-m', 'moved')
    const run = release('prod-2026-11-05')
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('tag prod-2026-11-05 here is not the one on origin')
  })
})
