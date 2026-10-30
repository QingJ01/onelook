import { describe, expect, it } from 'vitest'
import { citationLocation, citeSource, makeSource, replaceSource, sourceVersion } from '../../src/workbench/evidence'

describe('versioned source evidence', () => {
  it('anchors repeated text to the selected occurrence, including Unicode and line ranges', () => {
    const source = makeSource('登录实现', '第一行\n登录🙂成功\n分支\n登录🙂成功', { filePath: 'src/auth.ts', revision: 'reviewed-version' })
    const quote = '登录🙂成功'
    const citation = citeSource(source, quote, source.text.lastIndexOf(quote))
    expect(citation.start).toBe(source.text.lastIndexOf(quote))
    expect(source.text.slice(citation.start, citation.end)).toBe(quote)
    expect(citationLocation(source, citation)).toBe('src/auth.ts · v1 · 第 4–4 行 · reviewed-version')
    expect(() => citeSource(source, '不存在的原文')).toThrow('连续原文')
  })

  it('keeps exact historical evidence and file metadata after the current text changes', () => {
    const source = makeSource('接口材料', '旧接口\n返回 401', { filePath: 'old/auth.ts', revision: 'v1' })
    const citation = citeSource(source, '返回 401')
    const updated = replaceSource(source, '新接口\n返回 403', { filePath: 'new/auth.ts', revision: 'v2' })
    expect(updated.version).toBe(2)
    expect(source.version).toBe(1)
    expect(sourceVersion(updated, citation.version)?.text.slice(citation.start, citation.end)).toBe(citation.quote)
    expect(citationLocation(updated, citation)).toBe('old/auth.ts · v1 · 第 2–2 行 · v1')
    expect(sourceVersion(updated, 999)).toBeUndefined()
  })

  it('refuses to evict historical evidence at the retention limit', () => {
    let source = makeSource('资料', '初始原文')
    for (let i = 0; i < 50; i++) source = replaceSource(source, `第 ${i + 1} 次更新`, {})
    const first = sourceVersion(source, 1)
    expect(() => replaceSource(source, '不能静默删除历史', {})).toThrow('50')
    expect(sourceVersion(source, 1)).toEqual(first)
    expect(source.versions).toHaveLength(50)
  })
})
