import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApplicationServer } from '../../server/index.mjs'
import { createWorkspace } from '../../src/workbench/model'
import { generatedFixture } from './fixtures'

const allowedHosts = new Set(['api.openai.com'])
const apiKey = 'test-key-that-must-not-be-returned'
const settings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'mock-model',
  apiKey,
}

async function startServer(fetchImpl: typeof fetch = fetch) {
  const server = createApplicationServer({
    allowedHosts,
    fetchImpl,
    archifyRoot: '/does-not-exist',
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP address.')
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

const servers: Array<ReturnType<typeof createApplicationServer>> = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

describe('loopback API and provider boundary', () => {
  it('rejects malformed JSON and cross-origin mutations before provider access', async () => {
    const provider = vi.fn<typeof fetch>()
    const { server, origin } = await startServer(provider)
    servers.push(server)
    const malformed = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: '{bad',
    })
    expect(malformed.status).toBe(400)

    const crossOrigin = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://attacker.example' },
      body: '{}',
    })
    expect(crossOrigin.status).toBe(403)
    expect(provider).not.toHaveBeenCalled()
  })

  it('validates the provider allowlist and never redirects credentials', async () => {
    const provider = vi.fn<typeof fetch>()
    const { server, origin } = await startServer(provider)
    servers.push(server)
    const response = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        workspace: createWorkspace('architecture', 'Empty'),
        settings: { ...settings, baseUrl: 'https://127.0.0.1/v1' },
      }),
    })
    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it('reaches a labeled fake provider, validates its generated response, and does not return the API key', async () => {
    let providerUrl = ''
    let providerOptions: RequestInit | undefined
    const provider = vi.fn<typeof fetch>(async (input, init) => {
      providerUrl = String(input)
      providerOptions = init
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(generatedFixture()) } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const { server, origin } = await startServer(provider)
    servers.push(server)
    const workspace = createWorkspace('course', 'Empty course')
    const response = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ workspace, settings }),
    })
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result.generated.title).toBe('Generated workspace')
    expect(providerUrl).toBe('https://api.openai.com/v1/chat/completions')
    expect(providerOptions?.redirect).toBe('error')
    expect(new Headers(providerOptions?.headers).get('authorization')).toBe(`Bearer ${apiKey}`)
    expect(JSON.stringify(result)).not.toContain(apiKey)
  })

  it('returns bounded, non-sensitive provider errors instead of upstream bodies', async () => {
    const provider = vi.fn<typeof fetch>(async () => new Response(apiKey, { status: 500 }))
    const { server, origin } = await startServer(provider)
    servers.push(server)
    const response = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ workspace: createWorkspace('course', 'Empty'), settings }),
    })
    const result = await response.json()
    expect(response.status).toBe(502)
    expect(JSON.stringify(result)).not.toContain(apiKey)
    expect(result.error.message).toContain('HTTP 500')
  })
})
