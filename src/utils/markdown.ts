import { marked } from 'marked'
import { renderLatex } from './latex'

/**
 * 自定义 marked 渲染器
 * 1. 链接默认新窗口打开
 */
const renderer = new marked.Renderer()
const linkRenderer = renderer.link.bind(renderer)
renderer.link = (tokens: any) => {
    const href = tokens?.href || ''
    if (/^javascript:/i.test(href) || /^data:/i.test(href)) {
        return escapeHtml(tokens?.text || '')
    }
    const html = linkRenderer(tokens)
    return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ')
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

/**
 * 统一 Markdown 渲染函数
 * 支持 LaTeX 和新窗口打开链接
 */
export function renderMarkdown(text: string): string {
    if (!text) return ''

    // 使用自定义渲染器
    let html = marked(text, {
        renderer,
        breaks: true,
        gfm: true
    }) as string

    // 渲染 LaTeX
    html = renderLatex(html)

    return html
}
