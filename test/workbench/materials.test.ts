import { describe, expect, it } from 'vitest'
import { readMaterialFile, readMaterialFiles } from '../../src/workbench/materials'

function folderFile(path: string, text: string) {
  const file = new File([text], path.split('/').pop()!, { type: 'text/plain' })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

describe('local material reader', () => {
  it('reads UTF-8 text with a relative path', async () => {
    const file = new File(['你好\nconst x = 1'], 'sample.ts', { type: 'text/plain' })
    const result = await readMaterialFile(file)
    expect(result.text).toBe('你好\nconst x = 1')
    expect(result.filePath).toBe('sample.ts')
  })

  it('rejects unsupported, binary, malformed, and oversized text inputs', async () => {
    await expect(readMaterialFile(new File(['x'], 'image.png'))).rejects.toThrow(/Unsupported/)
    await expect(readMaterialFile(new File(['a\0b'], 'code.ts'))).rejects.toThrow(/Binary/)
    await expect(readMaterialFile(new File([new Uint8Array([0xc3, 0x28])], 'code.ts'))).rejects.toThrow(/UTF-8/)
    await expect(readMaterialFile(new File(['x'.repeat(1_048_577)], 'large.md'))).rejects.toThrow(/1 MiB/)
  })

  it('rejects absolute and parent-traversal paths', async () => {
    const traversal = new File(['text'], '../secret.md')
    await expect(readMaterialFile(traversal)).rejects.toThrow(/relative path/)
    const absolute = new File(['text'], 'safe.md')
    Object.defineProperty(absolute, 'webkitRelativePath', { value: '/Users/example/private/safe.md' })
    await expect(readMaterialFile(absolute)).rejects.toThrow(/relative path/)
  })

  it('imports a folder with a skip manifest for unsupported or excluded files', async () => {
    const result = await readMaterialFiles([
      folderFile('demo/src/index.ts', 'const entry = true'),
      folderFile('demo/README.md', '# Demo'),
      folderFile('demo/node_modules/lib/index.js', 'vendored'),
      folderFile('demo/pnpm-lock.yaml', 'lockfile'),
      folderFile('demo/assets/logo.png', 'PNG'),
    ])
    expect(result.imported.map(i => i.filePath).sort()).toEqual(['demo/README.md', 'demo/src/index.ts'])
    expect(result.skipped.map(s => s.path).sort()).toEqual([
      'demo/assets/logo.png', 'demo/node_modules/lib/index.js', 'demo/pnpm-lock.yaml',
    ])
  })

  it('caps folder imports at the file and total-character limits', async () => {
    const files = Array.from({ length: 101 }, (_, i) => folderFile(`demo/file-${i}.md`, 'x'))
    const result = await readMaterialFiles(files)
    expect(result.imported).toHaveLength(100)
    expect(result.skipped.some(s => /最多导入/.test(s.reason))).toBe(true)
  })
})
