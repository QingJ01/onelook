import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { MAX_SOURCE_FILES, MAX_TOTAL_CHARACTERS, TEXT_EXTENSIONS, supportedSourcePath } from '../../shared/text-sources.mjs'

const MAX_TEXT_BYTES = 1024 * 1024
const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_PDF_PAGES = 200
const MAX_CHARACTERS = 300_000

export interface FolderImport {
  imported: { title: string; text: string; filePath: string }[]
  skipped: { path: string; reason: string }[]
}

function safeRelativePath(file: File): string {
  const value = file.webkitRelativePath || file.name
  if (/^[\\/]|^[A-Za-z]:/.test(value)) throw new TypeError('The selected file must have a relative path.')
  const path = value.replace(/\\/g, '/')
  const segments = path.split('/').filter(segment => segment && segment !== '.')
  if (!segments.length || segments.some(segment => segment === '..')) {
    throw new TypeError('The selected file must have a relative path.')
  }
  return segments.join('/')
}

export async function readMaterialFile(file: File): Promise<{ text: string; filePath?: string }> {
  if (!(file instanceof File)) throw new TypeError('Select a local file to read.')
  const filePath = safeRelativePath(file)
  const extension = filePath.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') {
    if (file.size > MAX_PDF_BYTES) throw new TypeError('PDF files must be no larger than 10 MiB.')
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useWorkerFetch: false,
      disableAutoFetch: true,
      disableStream: true,
    })
    try {
      const document = await task.promise
      if (document.numPages > MAX_PDF_PAGES) throw new TypeError('PDF files must contain no more than 200 pages.')
      const pages: string[] = []
      let characters = 0
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').trim()
        characters += text.length + (pages.length ? 2 : 0)
        if (characters > MAX_CHARACTERS) throw new TypeError('Extracted PDF text exceeds 300,000 characters.')
        pages.push(text)
        page.cleanup()
      }
      const text = pages.join('\n\n').trim()
      if (!text) throw new TypeError('No text could be extracted; scanned or empty PDFs are not supported.')
      return { text, filePath }
    } catch (error) {
      if (error instanceof TypeError) throw error
      throw new TypeError('The PDF is encrypted, unreadable, or could not be extracted.')
    } finally {
      await task.destroy()
    }
  }
  if (!extension || !TEXT_EXTENSIONS.has(extension)) {
    throw new TypeError('Unsupported file type. Select a supported text file or PDF.')
  }
  if (file.size > MAX_TEXT_BYTES) throw new TypeError('Text files must be no larger than 1 MiB.')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  } catch {
    throw new TypeError('The selected text file is not valid UTF-8.')
  }
  if (text.includes('\0')) throw new TypeError('Binary files are not supported.')
  if (text.length > MAX_CHARACTERS) throw new TypeError('Text files may contain at most 300,000 characters.')
  return { text, filePath }
}

export async function readMaterialFiles(files: Iterable<File>): Promise<FolderImport> {
  const imported: FolderImport['imported'] = []
  const skipped: FolderImport['skipped'] = []
  let total = 0
  for (const file of files) {
    let filePath: string
    try {
      filePath = safeRelativePath(file)
    } catch (error) {
      skipped.push({ path: file.name || '(unknown)', reason: (error as Error).message })
      continue
    }
    if (!supportedSourcePath(filePath) && !filePath.toLowerCase().endsWith('.pdf')) {
      skipped.push({ path: filePath, reason: '不支持的类型或位于跳过目录' })
      continue
    }
    if (imported.length >= MAX_SOURCE_FILES) {
      skipped.push({ path: filePath, reason: `最多导入 ${MAX_SOURCE_FILES} 个文件` })
      continue
    }
    try {
      const material = await readMaterialFile(file)
      if (total + material.text.length > MAX_TOTAL_CHARACTERS) {
        skipped.push({ path: filePath, reason: '超过本次导入总量上限' })
        continue
      }
      imported.push({ title: filePath, text: material.text, filePath })
      total += material.text.length
    } catch (error) {
      skipped.push({ path: filePath, reason: (error as Error).message })
    }
  }
  if (!imported.length && !skipped.length) throw new TypeError('Select at least one file.')
  return { imported, skipped }
}
