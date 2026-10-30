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
  await run(['install', '--frozen-lockfile'])
  await run(['setup:archify'])
  await run(['build'])
  const port = process.env.PORT || '3000'
  process.stdout.write(`OneLook is available at http://localhost:${port}\n`)
  const child = spawn(process.execPath, ['server/index.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: port },
  })
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
  child.once('exit', code => process.exit(code ?? 1))
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
