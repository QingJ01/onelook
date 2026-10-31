import type { Citation, Source, SourceVersion } from './types'

export function makeSource(title: string, text: string, metadata: { url?: string; filePath?: string; revision?: string } = {}): Source {
  return { id: crypto.randomUUID(), title, text, createdAt: Date.now(), version: 1, versions: [], ...metadata }
}

export function sourceVersion(source: Source, version: number): SourceVersion | undefined {
  return source.version === version ? source : source.versions.find(item => item.version === version)
}

export function citeSource(source: Source, quote: string, start = source.text.indexOf(quote)): Citation {
  if (!quote.trim() || start < 0 || source.text.slice(start, start + quote.length) !== quote) {
    throw new Error('引用必须对应所选资料中的连续原文。')
  }
  return { sourceId: source.id, quote, version: source.version, start, end: start + quote.length }
}

export function replaceSource(source: Source, text: string, metadata: { filePath?: string; revision?: string }): Source {
  if (source.versions.length >= 50) throw new Error('已保留 50 个资料旧版本。请导出备份后另建资料，不会自动丢弃引用依据。')
  const { version, text: oldText, createdAt, filePath, revision } = source
  return {
    ...source, ...metadata, text, version: version + 1, createdAt: Date.now(),
    versions: [...source.versions, { version, text: oldText, createdAt, ...(filePath ? { filePath } : {}), ...(revision ? { revision } : {}) }],
  }
}

export function citationLocation(source: Source, citation: Citation): string {
  const version = sourceVersion(source, citation.version)
  if (!version) return '资料版本缺失'
  const start = version.text.slice(0, citation.start).split('\n').length
  const end = version.text.slice(0, Math.max(citation.start, citation.end - 1)).split('\n').length
  return `${version.filePath || source.title} · v${citation.version} · 第 ${start}–${end} 行${version.revision ? ` · ${version.revision}` : ''}`
}
