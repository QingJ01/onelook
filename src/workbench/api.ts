import {
  validateGeneratedContentData,
  validateUnderstandingData,
  validateWorkspaceData,
} from '../../shared/validation.mjs'
import type {
  AISettings,
  GeneratedContent,
  MaterialUnderstanding,
  RepoImport,
  Workspace,
} from './types'

const AI_TIMEOUT_MS = 95_000
const RENDER_TIMEOUT_MS = 95_000

interface ApiError {
  error?: { message?: string }
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const relayAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', relayAbort, { once: true })
  try {
    if (signal?.aborted) relayAbort()
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (signal?.aborted) throw new Error('The request was cancelled.')
    let result: unknown
    try {
      result = await response.json()
    } catch {
      throw new Error('The local service returned an unreadable response.')
    }
    if (signal?.aborted) throw new Error('The request was cancelled.')
    if (!response.ok) {
      const message = (result as ApiError | null)?.error?.message
      throw new Error(typeof message === 'string' ? message : `The local service returned HTTP ${response.status}.`)
    }
    return result as T
  } catch (error) {
    if (signal?.aborted) throw new Error('The request was cancelled.')
    if (timedOut) throw new Error('The request timed out. Please try again.')
    if (error instanceof Error && error.message) throw error
    throw new Error('Could not reach the local OneLook service.')
  } finally {
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', relayAbort)
  }
}

export async function generateContent(
  workspace: Workspace,
  settings: AISettings,
  signal?: AbortSignal,
): Promise<GeneratedContent> {
  const current = validateWorkspaceData(workspace) as Workspace
  const response = await postJson<{ generated?: unknown }>('/api/generate', {
    workspace: current,
    settings,
  }, AI_TIMEOUT_MS, signal)
  return validateGeneratedContentData(response?.generated, current) as GeneratedContent
}

export async function understandWorkspace(
  workspace: Workspace,
  settings: AISettings,
  signal?: AbortSignal,
): Promise<MaterialUnderstanding> {
  const current = validateWorkspaceData(workspace) as Workspace
  const response = await postJson<{ understanding?: unknown }>('/api/understand', {
    workspace: current,
    settings,
  }, AI_TIMEOUT_MS, signal)
  return validateUnderstandingData(response?.understanding, current) as MaterialUnderstanding
}

export async function importRepo(url: string, signal?: AbortSignal): Promise<RepoImport> {
  const response = await postJson<{ repo?: unknown; ref?: unknown; files?: unknown; skipped?: unknown }>(
    '/api/repo',
    { url },
    AI_TIMEOUT_MS,
    signal,
  )
  const value = response as RepoImport
  if (
    typeof value.repo !== 'string' || typeof value.ref !== 'string'
    || !Array.isArray(value.files) || !Array.isArray(value.skipped)
  ) {
    throw new Error('The local service returned an invalid repository import.')
  }
  return value
}

export async function explainNode(
  workspace: Workspace,
  nodeId: string,
  question: string,
  settings: AISettings,
  signal?: AbortSignal,
): Promise<string> {
  const current = validateWorkspaceData(workspace) as Workspace
  const response = await postJson<{ explanation?: unknown }>('/api/explain', {
    workspace: current,
    nodeId,
    question,
    settings,
  }, AI_TIMEOUT_MS, signal)
  if (typeof response?.explanation !== 'string') {
    throw new Error('The AI response did not contain an explanation.')
  }
  return response.explanation
}

export async function renderArchify(
  workspace: Workspace,
  viewId?: string,
  signal?: AbortSignal,
): Promise<{ html: string; ir: unknown }> {
  const current = validateWorkspaceData(workspace) as Workspace
  const response = await postJson<{ html?: unknown; ir?: unknown }>('/api/render', {
    workspace: current,
    ...(viewId === undefined ? {} : { viewId }),
  }, RENDER_TIMEOUT_MS, signal)
  if (typeof response?.html !== 'string' || !response.html.trim()) {
    throw new Error('Archify returned an empty HTML artifact.')
  }
  if (response.ir === undefined) throw new Error('Archify did not return the source IR.')
  return { html: response.html, ir: response.ir }
}

export async function getApiHealth(): Promise<{ archify: boolean; aiHosts: string[] }> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch('/api/health', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`The local service returned HTTP ${response.status}.`)
    const value: unknown = await response.json()
    if (
      value === null || typeof value !== 'object'
      || typeof (value as { archify?: unknown }).archify !== 'boolean'
      || !Array.isArray((value as { aiHosts?: unknown }).aiHosts)
      || !(value as { aiHosts: unknown[] }).aiHosts.every(host => typeof host === 'string')
    ) throw new Error('The local service returned an invalid health response.')
    return value as { archify: boolean; aiHosts: string[] }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The local service health check timed out.')
    if (error instanceof Error && error.message) throw error
    throw new Error('Could not reach the local OneLook service.')
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
