import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateContent } from '../../src/workbench/api'
import { createWorkspace } from '../../src/workbench/model'
import { generatedFixture } from './fixtures'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('same-origin workbench API client', () => {
  function pendingFetch() {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (init?.signal?.aborted) abort()
      else init?.signal?.addEventListener('abort', abort, { once: true })
    })))
  }

  it('distinguishes user cancellation from a request timeout', async () => {
    pendingFetch()
    const controller = new AbortController()
    const result = generateContent(createWorkspace('course', 'Cancel'), { baseUrl: 'https://api.openai.com/v1', model: 'mock', apiKey: 'not-a-real-key' }, controller.signal)
    const assertion = expect(result).rejects.toThrow('cancelled')
    controller.abort()
    await assertion
  })

  it('reports the bounded client timeout separately', async () => {
    vi.useFakeTimers(); pendingFetch()
    const result = generateContent(createWorkspace('course', 'Timeout'), { baseUrl: 'https://api.openai.com/v1', model: 'mock', apiKey: 'not-a-real-key' })
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(95001)
    await assertion
  })
  it('sends the workspace and memory-only settings, then validates the generated result', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ generated: generatedFixture() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    const workspace = createWorkspace('architecture', 'Empty')
    const settings = { baseUrl: 'https://api.openai.com/v1', model: 'mock', apiKey: 'memory-only' }

    const result = await generateContent(workspace, settings)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/generate')
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(request.workspace.id).toBe(workspace.id)
    expect(request.settings.apiKey).toBe('memory-only')
    expect(result.nodes[0]?.id).toBe('generated-a')
  })

  it('surfaces server errors without substituting a fallback result', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { message: 'The local service is busy.' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )))
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    await expect(generateContent(
      createWorkspace('course', 'Empty'),
      { baseUrl: 'https://api.openai.com/v1', model: 'mock', apiKey: 'memory-only' },
    )).rejects.toThrow('The local service is busy.')
  })
})
