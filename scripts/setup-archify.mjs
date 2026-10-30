import { execFile as callbackExecFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFile = promisify(callbackExecFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PIN = 'f325d86230553e1dd15d3464324f1fcd01f02352'
const REPOSITORY = 'https://github.com/tt-a1i/archify.git'

async function run(command, args, options = {}) {
  return execFile(command, args, {
    cwd: ROOT,
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    ...options,
  })
}

async function hasCli(root) {
  for (const candidate of [
    path.join(root, 'archify', 'bin', 'archify.mjs'),
    path.join(root, 'bin', 'archify.mjs'),
  ]) {
    try {
      if ((await stat(candidate)).isFile()) return true
    } catch {
      continue
    }
  }
  return false
}

async function verifyPinnedSource(root, label) {
  let head
  try {
    const { stdout } = await run('git', ['-C', root, 'rev-parse', 'HEAD'])
    head = stdout.trim()
  } catch {
    throw new Error(`${label} must be a Git checkout at the pinned Archify commit ${PIN}.`)
  }
  if (head !== PIN) {
    throw new Error(`${label} must be at the pinned Archify commit ${PIN}; found ${head}.`)
  }
}

const configuredRoot = process.env.ARCHIFY_ROOT
if (configuredRoot) {
  const root = path.resolve(configuredRoot)
  if (!(await hasCli(root))) {
    throw new Error('ARCHIFY_ROOT does not contain archify/bin/archify.mjs or bin/archify.mjs.')
  }
  await verifyPinnedSource(root, 'ARCHIFY_ROOT')
  process.stdout.write(`Using pinned Archify source from ARCHIFY_ROOT=${root}\n`)
} else {
  const target = path.join(ROOT, '.cache', 'archify')
  if (await hasCli(target)) {
    await verifyPinnedSource(target, '.cache/archify')
    process.stdout.write(`Archify ${PIN} is already set up at ${target}\n`)
  } else {
    const parent = path.dirname(target)
    const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'onelook-archify-setup-'))
    const checkout = path.join(stagingRoot, 'checkout')
    try {
      await mkdir(parent, { recursive: true })
      await run('git', ['clone', '--filter=blob:none', '--no-checkout', '--sparse', REPOSITORY, checkout])
      await run('git', ['-C', checkout, 'fetch', '--depth', '1', 'origin', PIN])
      await run('git', ['-C', checkout, 'sparse-checkout', 'set', 'archify'])
      await run('git', ['-C', checkout, 'checkout', '--detach', PIN])
      await verifyPinnedSource(checkout, 'Downloaded Archify source')
      if (!(await hasCli(checkout))) {
        throw new Error(`Downloaded Archify source did not match the required pin ${PIN}.`)
      }
      await rename(checkout, target)
      process.stdout.write(`Installed pinned Archify source ${PIN} at ${target}\n`)
    } finally {
      await rm(stagingRoot, { recursive: true, force: true })
    }
  }
}

export { PIN }
