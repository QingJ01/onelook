import net from 'node:net'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vitePort = 3000
const apiPort = 3001
const ports = [vitePort, apiPort]

function available(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') reject(new Error(`Port ${port} is occupied. Stop its owner or choose another port.`))
      else reject(error)
    })
    server.listen(port, '127.0.0.1', () => server.close(resolve))
  })
}

const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
    process.exit(code)
  }, 2000).unref()
}

try {
  if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new TypeError('VITE_PORT and API_PORT must be valid TCP ports.')
  }
  for (const port of ports) await available(port)
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(apiPort) }, stdio: 'inherit',
  })
  const vite = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port',
    String(vitePort), '--strictPort', '--open', 'false',
  ], { cwd: root, env: process.env, stdio: 'inherit' })
  children.push(server, vite)
  for (const child of children) child.once('exit', code => {
    if (!stopping) stop(code || 1)
  })
  process.on('SIGINT', () => stop(0))
  process.on('SIGTERM', () => stop(0))
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  stop(1)
}
