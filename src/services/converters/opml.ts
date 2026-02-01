/**
 * OPML 格式转换器
 * 支持 OPML (Outline Processor Markup Language) 格式
 * 广泛用于大纲工具和 RSS 阅读器
 */

import type { MindMapNode, MindMapDocument } from '@/types'
import { v4 as uuidv4 } from 'uuid'

export const opmlConverter = {
    /**
     * 从 OPML 文件导入
     */
    async import(file: File): Promise<MindMapDocument> {
        const text = await file.text()
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'application/xml')

        // 检查解析错误
        const parseError = doc.querySelector('parsererror')
        if (parseError) {
            throw new Error('无效的 OPML 文件：XML 解析错误')
        }

        // 获取 opml 根元素
        const opmlElement = doc.querySelector('opml')
        if (!opmlElement) {
            throw new Error('无效的 OPML 文件：找不到 opml 元素')
        }

        // 获取标题
        const titleElement = doc.querySelector('head > title')
        const title = titleElement?.textContent || file.name.replace(/\.opml$/i, '')

        // 获取 body
        const bodyElement = doc.querySelector('body')
        if (!bodyElement) {
            throw new Error('无效的 OPML 文件：找不到 body 元素')
        }

        // 获取顶级 outline 元素
        const topOutlines = bodyElement.querySelectorAll(':scope > outline')

        // 创建根节点
        const root: MindMapNode = {
            id: uuidv4(),
            text: title,
            children: [],
            isExpanded: true
        }

        // 转换所有顶级 outline 为子节点
        root.children = Array.from(topOutlines).map(outline =>
            convertOPMLOutline(outline, root.id)
        )

        // 如果只有一个顶级节点，提升它为根节点
        if (root.children.length === 1 && root.text === file.name.replace(/\.opml$/i, '')) {
            const child = root.children[0]
            root.text = child.text
            root.children = child.children
            root.children.forEach(c => c.parentId = root.id)
            if (child.data) root.data = child.data
            if (child.style) root.style = child.style
        }

        return {
            id: uuidv4(),
            name: title,
            root,
            layout: 'mind',
            theme: 'light',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: '0.1.0'
        }
    },

    /**
     * 导出为 OPML 格式
     */
    async export(doc: MindMapDocument): Promise<Blob> {
        const xmlContent = generateOPMLXML(doc)
        return new Blob([xmlContent], { type: 'text/x-opml;charset=utf-8' })
    }
}

/**
 * 将 OPML outline 元素转换为 OneLook 节点
 */
function convertOPMLOutline(element: Element, parentId: string): MindMapNode {
    // OPML 使用 text 属性存储文本，有时也用 title
    const text = element.getAttribute('text') ||
        element.getAttribute('title') ||
        element.getAttribute('_note') ||
        ''

    const node: MindMapNode = {
        id: uuidv4(),
        text,
        parentId,
        children: [],
        isExpanded: true
    }

    // 提取备注（_note 属性或 note 属性）
    const note = element.getAttribute('_note') || element.getAttribute('note')
    if (note && note !== text) {
        node.data = { note }
    }

    // 提取链接
    const url = element.getAttribute('url') || element.getAttribute('htmlUrl')
    if (url) {
        if (!node.data) node.data = {}
        node.data.hyperlink = url
    }

    // 递归转换子节点
    const childOutlines = element.querySelectorAll(':scope > outline')
    node.children = Array.from(childOutlines).map(child =>
        convertOPMLOutline(child, node.id)
    )

    return node
}

/**
 * 生成 OPML XML
 */
function generateOPMLXML(doc: MindMapDocument): string {
    const lines: string[] = []
    lines.push('<?xml version="1.0" encoding="UTF-8"?>')
    lines.push('<opml version="2.0">')

    // head 部分
    lines.push('  <head>')
    lines.push(`    <title>${escapeXML(doc.name)}</title>`)
    lines.push(`    <dateCreated>${new Date(doc.createdAt).toUTCString()}</dateCreated>`)
    lines.push(`    <dateModified>${new Date(doc.updatedAt).toUTCString()}</dateModified>`)
    lines.push('    <ownerName>OneLook</ownerName>')
    lines.push('  </head>')

    // body 部分
    lines.push('  <body>')

    // 根节点作为第一个 outline
    generateOutlineXML(doc.root, lines, 2)

    lines.push('  </body>')
    lines.push('</opml>')

    return lines.join('\n')
}

/**
 * 生成 outline XML
 */
function generateOutlineXML(node: MindMapNode, lines: string[], indent: number): void {
    const indentStr = '  '.repeat(indent)
    const attrs: string[] = []

    // text 属性（必需）
    attrs.push(`text="${escapeXML(node.text)}"`)

    // 备注
    if (node.data?.note) {
        attrs.push(`_note="${escapeXML(node.data.note)}"`)
    }

    // 链接
    if (node.data?.hyperlink) {
        attrs.push(`url="${escapeXML(node.data.hyperlink)}"`)
    }

    if (node.children.length > 0) {
        lines.push(`${indentStr}<outline ${attrs.join(' ')}>`)
        for (const child of node.children) {
            generateOutlineXML(child, lines, indent + 1)
        }
        lines.push(`${indentStr}</outline>`)
    } else {
        lines.push(`${indentStr}<outline ${attrs.join(' ')}/>`)
    }
}

/**
 * XML 转义
 */
function escapeXML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}