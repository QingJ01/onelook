export const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'cs', 'kt',
  'swift', 'sql', 'yaml', 'yml', 'json', 'vue', 'css', 'html', 'txt', 'md', 'markdown',
])

export const SKIP_DIRECTORIES = new Set([
  '.git', '.cache', '.idea', '.vscode', '.turbo', '.next', '.nuxt',
  'node_modules', 'dist', 'build', 'coverage', 'vendor', 'out', 'target',
  '__pycache__', '.venv', 'venv',
])

export const SKIP_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb',
  '.ds_store', 'composer.lock', 'cargo.lock', 'go.sum',
])

export const MAX_SOURCE_FILES = 100
export const MAX_TOTAL_CHARACTERS = 300_000

export function supportedSourcePath(path) {
  const normalized = path.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  const name = segments[segments.length - 1] ?? ''
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  if (segments.slice(0, -1).some(segment => SKIP_DIRECTORIES.has(segment.toLowerCase()))) return false
  if (SKIP_FILES.has(name.toLowerCase())) return false
  return TEXT_EXTENSIONS.has(extension)
}
