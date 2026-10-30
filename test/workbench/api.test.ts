import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateContent } from '../../src/workbench/api'
import { createWorkspace } from '../../src/workbench/model'
import { generatedFixture } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

describe('same-origin workbench API client', () => {
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
