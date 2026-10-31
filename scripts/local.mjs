import { spawn } from 'node:child_process'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(pnpm, args, { stdio: 'inherit', shell: process.platform === 'win32' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${pnpm} ${args.join(' ')} exited with code ${code}`)))
  })
}

try {
  const port = Number(process.env.PORT || '3000')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('PORT must be an integer from 1 to 65535.')
  await run(['install', '--frozen-lockfile'])
  await run(['setup:archify'])
  await run(['build'])
  process.stdout.write(`Starting OneLook at http://localhost:${port}\n`)
  const child = spawn(process.execPath, ['server/index.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  })
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
  child.once('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
  child.once('exit', code => process.exit(code ?? 1))
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
