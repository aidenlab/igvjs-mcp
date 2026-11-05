#!/usr/bin/env node
// What a build runs, taken from git: "<tag> (<short sha>)" when HEAD is tagged, else
// "<branch> (<short sha>)", e.g. "prod-2026-11-12 (a1b2c3d)" or "main (d4e5f6a)". The
// sha carries "-dirty" when tracked files differ from HEAD, so a build of uncommitted
// work does not claim a commit it does not run. scripts/deploy-dev.sh stamps this into
// the Worker as its VERSION var, which the MCP initialize answers as serverInfo.version,
// and into the Viewer page as version.json; the Worker's GET /version reports both.
//
//   node scripts/version.mjs
import { execFileSync } from 'node:child_process'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function tag() {
  try {
    return git('describe', '--tags', '--exact-match', 'HEAD')
  } catch {
    return undefined // HEAD is not tagged
  }
}

function isDirty() {
  try {
    git('diff', '--quiet', 'HEAD')
    return false
  } catch {
    return true
  }
}

const name = tag() ?? (git('branch', '--show-current') || 'detached')
const sha = git('rev-parse', '--short=7', 'HEAD') + (isDirty() ? '-dirty' : '')
console.log(`${name} (${sha})`)
