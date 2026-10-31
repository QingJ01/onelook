import JSZip from 'jszip'
import { MAX_SOURCE_FILES, MAX_TOTAL_CHARACTERS, supportedSourcePath } from '../shared/text-sources.mjs'

const MAX_ZIP_BYTES = 30 * 1024 * 1024
const MAX_META_BYTES = 1024 * 1024
const REPO_TIMEOUT_MS = 30_000

function fail(message, statusCode = 400) {
  throw Object.assign(new TypeError(message), { statusCode })
}

function parseRepoUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) fail('A repository URL is required.')
  let url
  try {
    url = new URL(raw)
  } catch {
    fail('The repository URL is not a valid URL.')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.search || url.hash) {
    fail('Only public https://github.com/owner/repo URLs are supported.')
  }
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 2) fail('Only repository root URLs are supported, such as https://github.com/owner/repo.')
  const [owner, repo] = segments
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) fail('The repository owner name is invalid.')
  const name = repo.replace(/\.git$/i, '')
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) fail('The repository name is invalid.')
  return { owner, repo: name }
}

async function limited(response, maximum, label) {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximum) {
      await reader.cancel()
      fail(`${label} exceeded the ${Math.floor(maximum / (1024 * 1024))} MB limit.`, 502)
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer
}

async function githubFetch(path, fetchImpl, signal, { binary = false, maximum = MAX_META_BYTES } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REPO_TIMEOUT_MS)
  const relayAbort = () => controller.abort(signal.reason)
  signal?.addEventListener('abort', relayAbort, { once: true })
  try {
    if (signal?.aborted) relayAbort()
    const response = await fetchImpl(`https://api.github.com${path}`, {
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'onelook-local-workbench',
      },
    })
    if (signal?.aborted) fail('The repository import was cancelled.', 499)
    if (response.status === 404) fail('Repository not found, or it is private (unauthenticated access only).', 404)
    if (response.status === 403 || response.status === 429) fail('GitHub rate limited this request. Try again later.', 502)
    if (!response.ok) fail(`GitHub API returned HTTP ${response.status}.`, 502)
    const bytes = await limited(response, maximum, 'GitHub response')
    return binary ? bytes : JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    if (signal?.aborted) fail('The repository import was cancelled.', 499)
    if (controller.signal.aborted || error?.name === 'AbortError') fail('The repository import timed out.', 504)
    if (error?.statusCode) throw error
    fail('Could not reach the GitHub API.', 502)
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', relayAbort)
  }
}

async function importRepo(payload, fetchImpl, signal) {
  const { owner, repo } = parseRepoUrl(payload?.url)
  const meta = await githubFetch(`/repos/${owner}/${repo}`, fetchImpl, signal)
  const branch = typeof meta?.default_branch === 'string' ? meta.default_branch : ''
  if (!branch) fail('The repository has no readable default branch.', 502)
  const commit = await githubFetch(`/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, fetchImpl, signal)
  const sha = typeof commit?.sha === 'string' ? commit.sha : ''
  if (!/^[0-9a-f]{40}$/i.test(sha)) fail('GitHub did not return a valid commit SHA.', 502)
  const zip = await githubFetch(`/repos/${owner}/${repo}/zipball/${sha}`, fetchImpl, signal, {
    binary: true,
    maximum: MAX_ZIP_BYTES,
  })
  let archive
  try {
    archive = await JSZip.loadAsync(zip)
  } catch {
    fail('The repository archive could not be opened.', 502)
  }
  const prefix = Object.keys(archive.files)
    .filter(name => !archive.files[name].dir && name.includes('/'))
    .map(name => name.split('/')[0])[0]
  const files = []
  const skipped = []
  let total = 0
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue
    const path = prefix && entry.name.startsWith(`${prefix}/`)
      ? entry.name.slice(prefix.length + 1)
      : entry.name
    if (!path) continue
    if (files.length >= MAX_SOURCE_FILES) {
      skipped.push({ path, reason: `最多导入 ${MAX_SOURCE_FILES} 个文本文件` })
      continue
    }
    if (!supportedSourcePath(path)) {
      skipped.push({ path, reason: '不支持的类型或位于跳过目录' })
      continue
    }
    let text
    try {
      text = await entry.async('string')
    } catch {
      skipped.push({ path, reason: '无法读取内容' })
      continue
    }
    if (text.includes('\0') || text.length > 300_000 || total + text.length > MAX_TOTAL_CHARACTERS) {
      skipped.push({ path, reason: '二进制、过大或超过总量上限' })
      continue
    }
    files.push({ path, text })
    total += text.length
  }
  if (!files.length) fail('No supported text files were found in this repository.', 422)
  return { repo: `${owner}/${repo}`, ref: sha.slice(0, 12), files, skipped }
}

export { importRepo, parseRepoUrl }
