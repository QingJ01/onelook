import { marked } from 'marked'
import { renderLatex } from './latex'

/**
 * 自定义 marked 渲染器
 * 1. 链接默认新窗口打开
 */
const renderer = new marked.Renderer()
const linkRenderer = renderer.link.bind(renderer)
renderer.link = (tokens: any) => {
    const html = linkRenderer(tokens)
    return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ')
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
