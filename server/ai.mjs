import { explainPrompt, generatePrompt } from './ai-prompts.mjs'
import { validateGeneratedContentData, validateWorkspaceData } from '../shared/validation.mjs'

const AI_TIMEOUT_MS = 90_000
const RESPONSE_LIMIT = 2 * 1024 * 1024

function settingsFrom(value, allowedHosts) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new TypeError('AI settings are required.'), { statusCode: 400 })
  }
  const { baseUrl, model, apiKey } = value
  if (typeof baseUrl !== 'string' || baseUrl.length > 2048) {
    throw Object.assign(new TypeError('AI base URL must be a valid HTTPS URL.'), { statusCode: 400 })
  }
  let url
  try {
    url = new URL(baseUrl)
  } catch {
    throw Object.assign(new TypeError('AI base URL must be a valid HTTPS URL.'), { statusCode: 400 })
  }
  if (
    url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())
    || url.username || url.password || url.search || url.hash
    || (url.port && url.port !== '443')
  ) {
    throw Object.assign(new TypeError('AI base URL must use HTTPS on an allowed host.'), { statusCode: 400 })
  }
  if (typeof model !== 'string' || !model.trim() || model.length > 200) {
    throw Object.assign(new TypeError('AI model is required and must be at most 200 characters.'), { statusCode: 400 })
  }
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096) {
    throw Object.assign(new TypeError('AI API key is required and must be at most 4096 characters.'), { statusCode: 400 })
  }
  return { baseUrl: url.toString(), model: model.trim(), apiKey }
}

async function readLimited(response) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > RESPONSE_LIMIT) {
      await reader.cancel()
      throw Object.assign(new Error('AI provider response exceeded the 2 MB limit.'), { statusCode: 502 })
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(buffer)
}

async function complete({ baseUrl, model, apiKey }, systemPrompt, userContent, fetchImpl) {
  const endpoint = new URL(baseUrl)
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? 'AI provider rejected the supplied API key.'
        : `AI provider returned HTTP ${response.status}.`
      throw Object.assign(new Error(message), { statusCode: 502 })
    }
    let envelope
    try {
      envelope = JSON.parse(await readLimited(response))
    } catch (error) {
      if (error?.statusCode) throw error
      throw Object.assign(new Error('AI provider returned invalid JSON.'), { statusCode: 502 })
    }
    const content = envelope?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw Object.assign(new Error('AI provider returned no structured content.'), { statusCode: 502 })
    }
    try {
      const parsed = JSON.parse(content)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      return parsed
    } catch {
      throw Object.assign(new Error('AI provider did not return a valid JSON object.'), { statusCode: 502 })
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('AI provider request timed out after 90 seconds.'), { statusCode: 504 })
    }
    if (error?.statusCode) throw error
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('AI provider request timed out after 90 seconds.'), { statusCode: 504 })
    }
    if (error?.name === 'TypeError' || error?.name === 'FetchError') {
      throw Object.assign(new Error('Could not connect to the configured AI provider.'), { statusCode: 502 })
    }
    throw Object.assign(new Error('AI provider request failed.'), { statusCode: 502 })
  } finally {
    clearTimeout(timeout)
  }
}

function emptyGraph(workspace) {
  if (workspace.nodes.length || workspace.relations.length || workspace.path.length || workspace.questions.length) {
    throw Object.assign(new TypeError('AI generation is only available for an empty workspace.'), { statusCode: 400 })
  }
}

async function generate(payload, allowedHosts, fetchImpl) {
  const workspace = validateWorkspaceData(payload?.workspace)
  emptyGraph(workspace)
  const settings = settingsFrom(payload?.settings, allowedHosts)
  const generated = await complete(
    settings,
    generatePrompt,
    JSON.stringify({ scenario: workspace.scenario, title: workspace.title, summary: workspace.summary, sources: workspace.sources }),
    fetchImpl,
  )
  return { generated: validateGeneratedContentData(generated, workspace) }
}

async function explain(payload, allowedHosts, fetchImpl) {
  const workspace = validateWorkspaceData(payload?.workspace)
  if (typeof payload?.nodeId !== 'string' || !workspace.nodes.some(node => node.id === payload.nodeId)) {
    throw Object.assign(new TypeError('The requested node does not exist in this workspace.'), { statusCode: 400 })
  }
  if (typeof payload?.question !== 'string' || !payload.question.trim() || payload.question.length > 3000) {
    throw Object.assign(new TypeError('Question must contain 1–3000 characters.'), { statusCode: 400 })
  }
  const settings = settingsFrom(payload?.settings, allowedHosts)
  const node = workspace.nodes.find(item => item.id === payload.nodeId)
  const response = await complete(
    settings,
    explainPrompt,
    JSON.stringify({ workspace: { title: workspace.title, summary: workspace.summary, sources: workspace.sources }, node, question: payload.question }),
    fetchImpl,
  )
  if (typeof response.body !== 'string' || !response.body.trim() || response.body.length > 20000) {
    throw Object.assign(new TypeError('AI explanation must contain 1–20000 characters.'), { statusCode: 502 })
  }
  return { explanation: response.body }
}

export { explain, generate, settingsFrom }
