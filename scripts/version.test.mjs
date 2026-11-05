// scripts/version.mjs, run in a throwaway git repository as a deploy runs it in this one.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'version.mjs')
let repo

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
const shortSha = () => git('rev-parse', '--short=7', 'HEAD')
const version = () => execFileSync('node', [SCRIPT], { cwd: repo, encoding: 'utf8' }).trim()

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'version-test-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  writeFileSync(join(repo, 'file'), 'one')
  git('add', 'file')
  git('commit', '-q', '-m', 'one')
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('version.mjs', () => {
  it('names the branch and short commit on a branch', () => {
    expect(version()).toBe(`main (${shortSha()})`)
  })

  it('names the release tag and short commit on a tagged commit', () => {
    git('tag', '-a', 'prod-2026-11-12', '-m', 'release')
    expect(version()).toBe(`prod-2026-11-12 (${shortSha()})`)
  })

  it('says it is detached when HEAD is on no branch and no tag', () => {
    git('checkout', '-q', '--detach')
    expect(version()).toBe(`detached (${shortSha()})`)
  })

  it('marks the commit dirty when the working tree has uncommitted changes', () => {
    writeFileSync(join(repo, 'file'), 'two')
    expect(version()).toBe(`main (${shortSha()}-dirty)`)
  })
})
