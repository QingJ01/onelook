import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { importRepo, parseRepoUrl } from '../../server/repo.mjs'

const sha = 'a'.repeat(40)

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function repoZip(files: Record<string, string>) {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(files)) {
    zip.file(`owner-repo-${sha.slice(0, 7)}/${path}`, text)
  }
  return zip.generateAsync({ type: 'uint8array' })
}

function githubStub(zip: Uint8Array) {
  return vi.fn<typeof fetch>(async (url) => {
    const href = String(url)
    if (href.endsWith('/repos/o/r')) return jsonResponse({ default_branch: 'main' })
    if (href.includes('/commits/')) return jsonResponse({ sha })
    if (href.includes('/zipball/')) return new Response(zip)
    return jsonResponse({ message: 'unexpected' }, 500)
  })
}

describe('github repository import', () => {
  it('accepts only repository root URLs', () => {
    expect(parseRepoUrl('https://github.com/o/r')).toEqual({ owner: 'o', repo: 'r' })
    expect(parseRepoUrl('https://github.com/o/r.git')).toEqual({ owner: 'o', repo: 'r' })
    for (const bad of [
      'http://github.com/o/r', 'https://gitlab.com/o/r', 'https://github.com/o/r/tree/main',
      'https://user:pass@github.com/o/r', 'https://github.com/o', 'https://github.com/o/r?x=1',
    ]) expect(() => parseRepoUrl(bad)).toThrow()
  })

  it('imports supported text files and reports skipped entries', async () => {
    const zip = await repoZip({
      'src/index.ts': 'const a = 1',
      'README.md': '# Demo',
      'node_modules/pkg/index.js': 'ignored',
      'pnpm-lock.yaml': 'lockfile: true',
      'assets/logo.png': 'PNG',
      'docs/guide.txt': 'guide text',
    })
    const result = await importRepo({ url: 'https://github.com/o/r' }, githubStub(zip), new AbortController().signal)
    expect(result.repo).toBe('o/r')
    expect(result.ref).toBe(sha.slice(0, 12))
    expect(result.files.map(f => f.path).sort()).toEqual(['README.md', 'docs/guide.txt', 'src/index.ts'])
    const skipped = result.skipped.map(s => s.path).sort()
    expect(skipped).toEqual(['assets/logo.png', 'node_modules/pkg/index.js', 'pnpm-lock.yaml'])
  })

  it('rejects private or missing repositories without exposing internals', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ message: 'Not Found' }, 404))
    await expect(importRepo({ url: 'https://github.com/o/missing' }, fetcher, new AbortController().signal))
      .rejects.toThrow(/not found|private/i)
  })

  it('reports rate limits distinctly', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({}, 403))
    await expect(importRepo({ url: 'https://github.com/o/r' }, fetcher, new AbortController().signal))
      .rejects.toThrow(/rate/i)
  })

  it('fails when no supported text files exist', async () => {
    const zip = await repoZip({ 'logo.png': 'PNG', 'README.exe': 'binary' })
    await expect(importRepo({ url: 'https://github.com/o/r' }, githubStub(zip), new AbortController().signal))
      .rejects.toThrow(/No supported text files/)
  })
})
