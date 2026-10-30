import { createServer as createHttpServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { explain, generate } from './ai.mjs'
import { archifyAvailable, renderWorkspace } from './archify.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_LIMIT = 2 * 1024 * 1024
const ACTIVE_LIMIT = 3
const BODY_TIMEOUT_MS = 20_000
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.woff2', 'font/woff2'],
  ['.ico', 'image/x-icon'],
])

function parseAllowedHosts(raw = process.env.AI_ALLOWED_HOSTS) {
  const entries = (raw || 'api.openai.com').split(',').map(host => host.trim().toLowerCase()).filter(Boolean)
  if (entries.some(host => !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.'))) {
    throw new TypeError('AI_ALLOWED_HOSTS must contain comma-separated hostnames.')
  }
  return new Set(entries)
}

function respond(res, status, body, headers = {}) {
  if (res.headersSent || res.destroyed) return
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(JSON.stringify(body))
}

function localHost(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

function checkOrigin(req, url, allowedOrigins) {
  const host = req.headers.host?.toLowerCase()
  if (!host || !localHost(host, req.socket.localPort)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  if (req.method === 'GET' || req.method === 'HEAD') return true
  const origin = req.headers.origin
  if (typeof origin !== 'string') return false
  let parsed
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return false
  return origin === url.origin || allowedOrigins.has(origin)
}

async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    throw Object.assign(new TypeError('Content-Type must be application/json.'), { statusCode: 415 })
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    throw Object.assign(new TypeError('Compressed request bodies are not supported.'), { statusCode: 415 })
  }
  const length = req.headers['content-length']
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > JSON_LIMIT)) {
    throw Object.assign(new TypeError(`Request body must be at most ${JSON_LIMIT} bytes.`), { statusCode: 413 })
  }
  const chunks = []
  let size = 0
  let timer
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Request body timed out.'), { statusCode: 408 })), BODY_TIMEOUT_MS)
    })
    const read = (async () => {
      for await (const chunk of req) {
        size += chunk.length
        if (size > JSON_LIMIT) throw Object.assign(new Error(`Request body must be at most ${JSON_LIMIT} bytes.`), { statusCode: 413 })
        chunks.push(chunk)
      }
      let data
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        throw Object.assign(new SyntaxError('Request body must contain valid JSON.'), { statusCode: 400 })
      }
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw Object.assign(new TypeError('Request body must be a JSON object.'), { statusCode: 400 })
      }
      return data
    })()
    return await Promise.race([read, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function serveStatic(req, res, distDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'X-Content-Type-Options': 'nosniff' }).end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  const relative = pathname.replace(/^\/+/, '')
  let target = path.resolve(distDir, relative)
  if (target !== distDir && !target.startsWith(`${distDir}${path.sep}`)) {
    res.writeHead(403).end()
    return
  }
  try {
    if (!(await stat(target)).isFile()) target = path.join(distDir, 'index.html')
  } catch {
    target = path.join(distDir, 'index.html')
  }
  try {
    const body = await readFile(target)
    res.writeHead(200, {
      'Content-Type': mimeTypes.get(path.extname(target)) || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': path.basename(target) === 'index.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end('Built OneLook files are unavailable. Run the production build first.')
  }
}

function createApplicationServer({
  allowedHosts = parseAllowedHosts(),
  allowedOrigins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']),
  fetchImpl = fetch,
  distDir = path.join(ROOT, 'dist'),
  archifyRoot = process.env.ARCHIFY_ROOT,
} = {}) {
  let active = 0
  return createHttpServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    let url
    try {
      url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
    } catch {
      respond(res, 400, { error: { message: 'Invalid request URL.' } })
      return
    }
    if (!url.pathname.startsWith('/api/')) {
      void serveStatic(req, res, path.resolve(distDir))
      return
    }
    if (!checkOrigin(req, url, allowedOrigins)) {
      respond(res, 403, { error: { message: 'Request origin is not allowed.' } })
      return
    }
    if (url.pathname === '/api/health' && req.method === 'GET') {
      respond(res, 200, { archify: archifyAvailable(archifyRoot), aiHosts: [...allowedHosts].sort() })
      return
    }
    const endpoints = new Map([
      ['/api/generate', (payload, signal) => generate(payload, allowedHosts, fetchImpl, signal)],
      ['/api/explain', (payload, signal) => explain(payload, allowedHosts, fetchImpl, signal)],
      ['/api/render', async (payload, signal) => renderWorkspace(payload?.workspace, { archifyRoot, viewId: payload?.viewId, signal })],
    ])
    const operation = endpoints.get(url.pathname)
    if (!operation) {
      respond(res, 404, { error: { message: 'API endpoint not found.' } })
      return
    }
    if (req.method !== 'POST') {
      respond(res, 405, { error: { message: 'This endpoint requires POST.' } }, { Allow: 'POST' })
      return
    }
    if (active >= ACTIVE_LIMIT) {
      respond(res, 503, { error: { message: 'The local service is busy. Try again shortly.' } })
      return
    }
    active += 1
    const controller = new AbortController()
    const cancelOnDisconnect = () => {
      if (!res.writableEnded) controller.abort()
    }
    res.on('close', cancelOnDisconnect)
    void (async () => {
      try {
        const payload = await readJson(req)
        const result = await operation(payload, controller.signal)
        respond(res, 200, result)
      } catch (error) {
        if (res.destroyed) return
        const status = Number.isInteger(error?.statusCode) ? error.statusCode : 400
        const message = error instanceof Error ? error.message : 'Request could not be completed.'
        respond(res, status, { error: { message } })
      } finally {
        res.off('close', cancelOnDisconnect)
        active -= 1
      }
    })()
  })
}

function startServer() {
  const rawPort = process.env.PORT || '3001'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('PORT must be between 1 and 65535.')
  const configuredOrigins = process.env.ONLOOK_ALLOWED_ORIGINS
  const allowedOrigins = configuredOrigins
    ? new Set(configuredOrigins.split(',').map(origin => origin.trim()).filter(Boolean))
    : new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:3000', 'http://127.0.0.1:3000'])
  const server = createApplicationServer({ allowedOrigins })
  server.headersTimeout = 10_000
  server.requestTimeout = 30_000
  server.keepAliveTimeout = 5_000
  server.maxRequestsPerSocket = 100
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`OneLook local service listening on http://127.0.0.1:${port}\n`)
  })
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer()

export { createApplicationServer, startServer }
