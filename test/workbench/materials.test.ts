import { describe, expect, it } from 'vitest'
import { readMaterialFile } from '../../src/workbench/materials'

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
})
