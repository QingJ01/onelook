import { marked } from 'marked'
import { renderLatex } from './latex'

export type AttachmentPreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'json', 'csv', 'log']

const renderer = new marked.Renderer()
const linkRenderer = renderer.link.bind(renderer)

renderer.link = (tokens: any) => {
    const href = tokens?.href || ''
    if (!isSafeUrl(href)) {
        return escapeHtml(tokens?.text || '')
    }

    const attachmentType = getAttachmentPreviewType(href)
    const html = linkRenderer(tokens)
    const attachmentAttr = attachmentType ? ` data-attachment-type="${attachmentType}"` : ''
    return html.replace(/^<a /, `<a target="_blank" rel="noopener noreferrer"${attachmentAttr} `)
}

renderer.image = (tokens: any) => {
    const src = tokens?.href || ''
    if (!isSafeImageUrl(src)) {
        return ''
    }

    const alt = escapeHtml(tokens?.text || '')
    const title = tokens?.title ? ` title="${escapeHtml(tokens.title)}"` : ''
    return `<img src="${escapeHtml(src)}" alt="${alt}"${title} loading="lazy" referrerpolicy="no-referrer" />`
}

renderer.html = (token: any) => {
    const raw = token?.raw ?? token?.text ?? ''
    return escapeHtml(raw)
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function getUrlPath(href: string): string {
    try {
        const url = new URL(href, window.location.href)
        return url.pathname.toLowerCase()
    } catch {
        return href.split('?')[0].split('#')[0].toLowerCase()
    }
}

function getUrlExtension(href: string): string {
    const path = getUrlPath(href)
    const index = path.lastIndexOf('.')
    if (index < 0) return ''
    return path.slice(index + 1)
}

export function isSafeUrl(href: string): boolean {
    const normalized = href.trim()
    if (!normalized) return false
    if (/^javascript:/i.test(normalized)) return false
    if (/^data:/i.test(normalized)) return false
    return true
}

function isSafeImageUrl(href: string): boolean {
    const normalized = href.trim()
    if (!normalized) return false
    if (/^javascript:/i.test(normalized)) return false
    if (/^data:image\//i.test(normalized)) return true
    return !/^data:/i.test(normalized)
}

export function getAttachmentPreviewType(href: string): AttachmentPreviewType | null {
    const normalized = href.trim()
    if (!normalized) return null

    if (/^data:image\//i.test(normalized)) return 'image'
    if (/^data:audio\//i.test(normalized)) return 'audio'
    if (/^data:video\//i.test(normalized)) return 'video'
    if (/^data:application\/pdf/i.test(normalized)) return 'pdf'
    if (/^blob:/i.test(normalized)) return 'file'

    const ext = getUrlExtension(normalized)
    if (!ext) return null

    if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
    if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
    if (AUDIO_EXTENSIONS.includes(ext)) return 'audio'
    if (ext === 'pdf') return 'pdf'
    if (TEXT_EXTENSIONS.includes(ext)) return 'text'

    return 'file'
}

export function renderMarkdown(text: string): string {
    if (!text) return ''

    let html = marked(text, {
        renderer,
        breaks: true,
        gfm: true
    }) as string

    html = renderLatex(html)

    return html
}
