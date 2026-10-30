import { afterEach, describe, expect, it, vi } from 'vitest'
import { generate } from '../../server/ai.mjs'
import { createWorkspace } from '../../src/workbench/model'
import { makeSource, replaceSource } from '../../src/workbench/evidence'
import { generatedFixture } from './fixtures'

const hosts = new Set(['api.openai.com'])
const settings = { baseUrl: 'https://api.openai.com/v1', model: 'mock', apiKey: 'synthetic-test-key' }
afterEach(() => vi.useRealTimers())

describe('provider limits and data minimization', () => {
  it.each([429, 500])('redacts upstream HTTP %i response bodies', async status => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(settings.apiKey, { status }))
    const result = generate({ workspace: createWorkspace('course', 'Errors'), settings }, hosts, fetcher)
    await expect(result).rejects.toThrow(`HTTP ${status}`)
    await expect(result).rejects.not.toThrow(settings.apiKey)
  })

  it('aborts the provider after 90 seconds and reports a timeout', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const result = generate({ workspace: createWorkspace('course', 'Timeout'), settings }, hosts, fetcher)
    const assertion = expect(result).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(90_001); await assertion
    expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true)
  })

  it('sends only current versions, while preserving old evidence in local data', async () => {
    const workspace = createWorkspace('course', 'Current material')
    workspace.sources = [replaceSource(makeSource('Material', 'historical-only-marker'), 'current-only-marker', {})]
    let body = ''
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      body = String(init?.body)
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(generatedFixture()) } }] }))
    })
    await generate({ workspace, settings }, hosts, fetcher)
    expect(body).toContain('current-only-marker')
    expect(body).not.toContain('historical-only-marker')
    expect(body).not.toContain('synthetic-test-key')
    expect(workspace.sources[0].versions[0].text).toBe('historical-only-marker')
  })
})
