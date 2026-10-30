import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'cs', 'kt',
  'swift', 'sql', 'yaml', 'yml', 'json', 'vue', 'css', 'html', 'txt', 'md', 'markdown',
])
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_PDF_PAGES = 200
const MAX_CHARACTERS = 300_000

function safeRelativePath(file: File): string {
  const value = file.webkitRelativePath || file.name
  const path = value.replaceAll('\\', '/').replace(/^\/+|^[A-Za-z]:\/+/, '')
  const segments = path.split('/').filter(segment => segment && segment !== '.')
  if (!segments.length || segments.some(segment => segment === '..')) {
    throw new TypeError('The selected file must have a relative path.')
  }
  return segments.join('/')
}

export async function readMaterialFile(file: File): Promise<{ text: string; filePath?: string }> {
  if (!(file instanceof File)) throw new TypeError('Select a local file to read.')
  const filePath = safeRelativePath(file)
  const extension = filePath.split('.').at(-1)?.toLowerCase()
  if (extension === 'pdf') {
    if (file.size > MAX_PDF_BYTES) throw new TypeError('PDF files must be no larger than 10 MiB.')
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
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
        characters += text.length
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
