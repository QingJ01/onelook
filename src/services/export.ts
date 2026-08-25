import type { MindMapDocument, MindMapNode } from '@/types'
import { xmindConverter } from './converters/xmind'
import { freemindConverter } from './converters/freemind'
import { opmlConverter } from './converters/opml'
import katexCss from 'katex/dist/katex.min.css?inline'

/** 导出图片时的加载超时时间 */
const IMAGE_LOAD_TIMEOUT = 15000

/**
 * 导出服务
 */
export const exportService = {
    /**
     * 导出为 JSON 文件
     */
    exportJSON(doc: MindMapDocument): void {
        const json = JSON.stringify(doc, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        downloadBlob(blob, `${doc.name}.json`)
    },

    /**
     * 导出为 Markdown
     */
    exportMarkdown(doc: MindMapDocument): void {
        const md = nodeToMarkdown(doc.root, 0)
        const blob = new Blob([md], { type: 'text/markdown' })
        downloadBlob(blob, `${doc.name}.md`)
    },

    /**
     * 导出为 PNG（需要 Canvas）
     */
    async exportPNG(svgElement: SVGSVGElement, fileName: string): Promise<void> {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('无法创建 Canvas 上下文')
        }

        // 获取 SVG 尺寸
        const bbox = svgElement.getBBox()
        const padding = 60
        const scale = 2 // 高分辨率
        canvas.width = Math.ceil((bbox.width + padding * 2) * scale)
        canvas.height = Math.ceil((bbox.height + padding * 2) * scale)

        // 填充白色背景
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // 准备导出专用的 SVG
        const exportSvg = await prepareExportSvg(svgElement, bbox, padding)

        // 序列化为 data URI。
        // 注意：不能使用 blob URL —— Chrome 下通过 blob URL 加载含 <foreignObject>
        // （Markdown 渲染节点）的 SVG 绘制到 Canvas 会污染画布，导致 toBlob
        // 抛出 SecurityError；data URI 则可以正常导出。
        const svgData = new XMLSerializer().serializeToString(exportSvg)
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`

        const img = await loadImage(dataUrl)

        try {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            const blob = await canvasToBlob(canvas)
            downloadBlob(blob, `${fileName}.png`)
        } catch (err) {
            if (err instanceof DOMException && /tainted/i.test(err.message)) {
                throw new Error('导出 PNG 失败：画布被污染（可能包含跨域图片）')
            }
            throw err instanceof Error ? err : new Error('导出 PNG 失败')
        }
    },

    /**
     * 导出为 SVG
     */
    async exportSVG(svgElement: SVGSVGElement, fileName: string): Promise<void> {
        // 获取 SVG 尺寸
        const bbox = svgElement.getBBox()
        const padding = 60

        // 准备导出专用的 SVG
        const exportSvg = await prepareExportSvg(svgElement, bbox, padding)

        // 下载
        const svgData = new XMLSerializer().serializeToString(exportSvg)
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
        downloadBlob(blob, `${fileName}.svg`)
    },

    /**
     * 导出为 OneLook 格式 (.olook)
     */
    exportOLook(doc: MindMapDocument): void {
        const oneLookFile = {
            version: '1.0.0',
            app: 'OneLook',
            created: doc.createdAt,
            modified: Date.now(),
            document: doc
        }
        const json = JSON.stringify(oneLookFile, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        downloadBlob(blob, `${doc.name}.olook`)
    },

    /**
     * 导出为 XMind 格式 (.xmind)
     */
    async exportXMind(doc: MindMapDocument): Promise<void> {
        const blob = await xmindConverter.export(doc)
        downloadBlob(blob, `${doc.name}.xmind`)
    },

    /**
     * 导出为 FreeMind 格式 (.mm)
     */
    async exportFreeMind(doc: MindMapDocument): Promise<void> {
        const blob = await freemindConverter.export(doc)
        downloadBlob(blob, `${doc.name}.mm`)
    },

    /**
     * 导出为 OPML 格式 (.opml)
     */
    async exportOPML(doc: MindMapDocument): Promise<void> {
        const blob = await opmlConverter.export(doc)
        downloadBlob(blob, `${doc.name}.opml`)
    },
}

/**
 * 准备导出专用的 SVG
 */
async function prepareExportSvg(svgElement: SVGSVGElement, bbox: DOMRect, padding: number): Promise<SVGSVGElement> {
    const width = bbox.width + padding * 2
    const height = bbox.height + padding * 2

    // 克隆 SVG
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement
    svgClone.setAttribute('width', String(width))
    svgClone.setAttribute('height', String(height))
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`)
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    // 移除不需要导出的元素
    const expandBtns = svgClone.querySelectorAll('.expand-btn')
    expandBtns.forEach(btn => btn.remove())

    // 移除拖拽目标样式类
    const draggingNodes = svgClone.querySelectorAll('.dragging, .drop-target')
    draggingNodes.forEach(node => {
        node.classList.remove('dragging', 'drop-target')
    })

    // 将节点图片内联为 data URI（SVG 以图片方式渲染时无法访问外部资源）
    await inlineForeignObjectImages(svgClone)

    // 解析 fill/stroke/style 中的 CSS 变量为具体颜色值（独立 SVG 中无法解析 var()）
    resolveCssVarsInAttributes(svgClone)

    // 添加白色背景到最前面
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('x', String(bbox.x - padding))
    bg.setAttribute('y', String(bbox.y - padding))
    bg.setAttribute('width', String(width))
    bg.setAttribute('height', String(height))
    bg.setAttribute('fill', 'white')

    // 获取 g 元素（transform 容器）
    const gElement = svgClone.querySelector('g')
    if (gElement) {
        svgClone.insertBefore(bg, gElement)
    } else {
        svgClone.insertBefore(bg, svgClone.firstChild)
    }

    // 移除 defs 中的 filter（简化导出）
    const defs = svgClone.querySelector('defs')
    if (defs) {
        defs.remove()
    }

    // 内联完整样式（含 Markdown 富文本与 KaTeX 公式样式，保证导出内容与画布一致）
    const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    styleElement.textContent = buildExportStyles()
    svgClone.insertBefore(styleElement, svgClone.firstChild)

    return svgClone
}

/**
 * 加载图片（带超时保护，避免导出流程永久挂起）
 */
function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const timer = window.setTimeout(() => {
            img.src = ''
            reject(new Error('导出失败：图片生成超时'))
        }, IMAGE_LOAD_TIMEOUT)
        img.onload = () => {
            window.clearTimeout(timer)
            resolve(img)
        }
        img.onerror = () => {
            window.clearTimeout(timer)
            reject(new Error('导出 PNG 失败：图片加载错误'))
        }
        img.src = url
    })
}

/**
 * 将 Canvas 转换为 Blob（捕获污染等同步异常）
 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob)
                } else {
                    reject(new Error('导出 PNG 失败：无法生成图片'))
                }
            }, 'image/png')
        } catch (err) {
            reject(err instanceof Error ? err : new Error('导出 PNG 失败：无法生成图片'))
        }
    })
}

/**
 * 尽力将 foreignObject 中的外部图片转换为 data URI。
 * 跨域且不支持 CORS 的图片会被移除，避免阻塞导出。
 */
async function inlineForeignObjectImages(svgClone: SVGSVGElement): Promise<void> {
    const images = Array.from(svgClone.querySelectorAll('foreignObject img'))
    await Promise.all(images.map(async (img) => {
        const src = img.getAttribute('src') || ''
        if (!src || src.startsWith('data:')) return
        try {
            const response = await fetch(src, { mode: 'cors', cache: 'force-cache' })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const blob = await response.blob()
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = () => reject(reader.error)
                reader.readAsDataURL(blob)
            })
            img.setAttribute('src', dataUrl)
            img.removeAttribute('loading')
            img.removeAttribute('referrerpolicy')
        } catch {
            // 无法内联的图片直接移除，保证整体导出不被阻断
            img.remove()
        }
    }))
}

/**
 * 读取主题 CSS 变量的实际值
 */
function getThemeColor(varName: string, fallback: string): string {
    try {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
        return value || fallback
    } catch {
        return fallback
    }
}

/**
 * 将克隆 SVG 属性中的 var(--x) 引用替换为主题的实际颜色值
 */
function resolveCssVarsInAttributes(root: Element): void {
    const varPattern = /var\((--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\)/g
    const replaceVars = (value: string) => value.replace(varPattern, (_, name: string, fallback?: string) =>
        getThemeColor(name, fallback ? fallback.trim().replace(/^['"]|['"]$/g, '') : '')
    )

    const elements: Element[] = [root, ...root.querySelectorAll('*')]
    for (const el of elements) {
        for (const attr of ['fill', 'stroke']) {
            const value = el.getAttribute(attr)
            if (value && value.includes('var(')) {
                el.setAttribute(attr, replaceVars(value))
            }
        }
        const style = el.getAttribute('style')
        if (style && style.includes('var(--color')) {
            el.setAttribute('style', replaceVars(style))
        }
    }
}

/**
 * 构建导出 SVG 的完整内联样式
 */
function buildExportStyles(): string {
    const textColor = getThemeColor('--color-text', '#1f2937')
    const nodeBg = getThemeColor('--color-bg', '#f9fafb')
    const borderColor = getThemeColor('--color-border', '#e5e7eb')
    const primaryColor = getThemeColor('--color-primary', '#3b82f6')

    return `
        .node-bg {
            fill: ${nodeBg};
            stroke: ${borderColor};
            stroke-width: 1.5;
        }
        .node.root .node-bg {
            fill: ${primaryColor};
            stroke: ${primaryColor};
        }
        .node.selected .node-bg {
            stroke: ${primaryColor};
            stroke-width: 2;
        }
        .node-text {
            fill: ${textColor};
            font-size: 13px;
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 500;
        }
        .node.root .node-text {
            fill: white;
            font-size: 16px;
            font-weight: 600;
        }
        .connection {
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
        }
        .summary-text {
            font-size: 12px;
            fill: ${primaryColor};
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .md-content {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--node-content-gap, 8px);
            text-align: center;
            padding: var(--node-content-pad-y, 8px) var(--node-content-pad-x, 12px);
            box-sizing: border-box;
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
            font-size: 13px;
            line-height: 1.4;
            color: ${textColor};
        }
        .md-content.md-content-image {
            flex-direction: column;
        }
        .md-content p {
            margin: 0;
        }
        .md-content strong {
            font-weight: bold;
        }
        .md-content em {
            font-style: italic;
        }
        .md-content del {
            text-decoration: line-through;
        }
        .md-content code {
            background: rgba(0,0,0,0.1);
            padding: 1px 4px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.9em;
        }
        .md-content a {
            color: ${primaryColor};
            text-decoration: underline;
        }
        .node.root .md-content {
            color: white;
        }
        .node.root .md-content a {
            color: white;
        }
        .node-data-image {
            display: block;
            max-width: 100%;
            max-height: 180px;
            width: auto;
            height: auto;
            margin: 0 auto;
            object-fit: contain;
            border-radius: 4px;
        }
        .node-rich-text-body {
            margin: 0;
            text-align: center;
            line-height: 1.4;
            word-break: break-word;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            width: 100%;
        }
        .node-rich-text-body.root-node {
            color: white;
            font-weight: 500;
        }
        .node-rich-text-body.with-image {
            margin: 0;
            color: inherit;
        }
        .node-photo-text {
            margin-top: 0;
            text-align: center;
            line-height: 1.4;
            word-break: break-word;
            white-space: pre-wrap;
        }
        ${katexCss}
    `
}

/**
 * 导入服务
 */
export const importService = {
    /**
     * 从 JSON 文件导入
     */
    async importJSON(file: File): Promise<MindMapDocument> {
        const text = await file.text()
        const data = JSON.parse(text)

        // 验证文档结构
        validateDocument(data)

        return data as MindMapDocument
    },

    /**
     * 从 Markdown 导入
     */
    async importMarkdown(file: File): Promise<MindMapNode> {
        const text = await file.text()
        return markdownToNode(text)
    },

    /**
     * 从 OneLook 格式导入 (.olook)
     */
    async importOLook(file: File): Promise<MindMapDocument> {
        const text = await file.text()
        const data = JSON.parse(text)

        // 验证格式
        if (data.app !== 'OneLook' || !data.document) {
            throw new Error('无效的 OneLook 文件格式')
        }

        // 验证文档结构
        validateDocument(data.document)

        return data.document
    },

    /**
     * 从 XMind 格式导入 (.xmind)
     */
    async importXMind(file: File): Promise<MindMapDocument> {
        return await xmindConverter.import(file)
    },

    /**
     * 从 FreeMind 格式导入 (.mm)
     */
    async importFreeMind(file: File): Promise<MindMapDocument> {
        return await freemindConverter.import(file)
    },

    /**
     * 从 OPML 格式导入 (.opml)
     */
    async importOPML(file: File): Promise<MindMapDocument> {
        return await opmlConverter.import(file)
    },

    /**
     * 根据文件扩展名自动选择导入方法
     */
    async importAuto(file: File): Promise<MindMapDocument> {
        const ext = file.name.toLowerCase().split('.').pop()

        switch (ext) {
            case 'xmind':
                return await this.importXMind(file)
            case 'mm':
                return await this.importFreeMind(file)
            case 'opml':
                return await this.importOPML(file)
            case 'olook':
                return await this.importOLook(file)
            case 'json':
                return await this.importJSON(file)
            case 'md':
            case 'markdown': {
                const root = await this.importMarkdown(file)
                return {
                    id: crypto.randomUUID(),
                    name: file.name.replace(/\.(md|markdown)$/i, ''),
                    root,
                    layout: 'mind',
                    theme: 'light',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    version: '0.1.0'
                }
            }
            default:
                throw new Error(`不支持的文件格式: .${ext}`)
        }
    },
}

/**
 * 验证文档结构
 */
function validateDocument(data: unknown): asserts data is MindMapDocument {
    if (!data || typeof data !== 'object') {
        throw new Error('文件内容不是有效的 JSON 对象')
    }

    const doc = data as Record<string, unknown>

    // 验证必需字段
    if (typeof doc.id !== 'string' || !doc.id) {
        throw new Error('文档缺少有效的 id 字段')
    }
    if (typeof doc.name !== 'string') {
        throw new Error('文档缺少有效的 name 字段')
    }
    if (!doc.root || typeof doc.root !== 'object') {
        throw new Error('文档缺少有效的 root 节点')
    }

    // 验证根节点
    validateNode(doc.root, 0)
}

/**
 * 递归验证节点结构（限制深度防止栈溢出）
 */
function validateNode(node: unknown, depth: number): void {
    const MAX_DEPTH = 100
    if (depth > MAX_DEPTH) {
        throw new Error(`节点嵌套层级超过最大限制 (${MAX_DEPTH})`)
    }

    if (!node || typeof node !== 'object') {
        throw new Error('节点结构无效')
    }

    const n = node as Record<string, unknown>

    if (typeof n.id !== 'string' || !n.id) {
        throw new Error('节点缺少有效的 id')
    }
    if (typeof n.text !== 'string') {
        throw new Error('节点缺少有效的 text')
    }
    if (!Array.isArray(n.children)) {
        throw new Error('节点 children 必须是数组')
    }

    // 递归验证子节点
    for (const child of n.children) {
        validateNode(child, depth + 1)
    }
}

/**
 * 下载 Blob
 */
function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * 节点转 Markdown
 */
function nodeToMarkdown(node: MindMapNode, level: number): string {
    const indent = '  '.repeat(level)
    const prefix = level === 0 ? '# ' : '- '
    let md = `${indent}${prefix}${node.text}\n`

    if (node.data?.note) {
        md += `${indent}  > ${node.data.note}\n`
    }

    for (const child of node.children) {
        md += nodeToMarkdown(child, level + 1)
    }

    return md
}

/**
 * Markdown 转节点（简化版）
 */
function markdownToNode(md: string): MindMapNode {
    const lines = md.trim().split('\n')
    const root: MindMapNode = {
        id: crypto.randomUUID(),
        text: '导入的导图',
        children: [],
        isExpanded: true,
    }

    const stack: MindMapNode[] = [root]

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('>')) continue

        // 计算层级
        const indentMatch = line.match(/^(\s*)/)
        const indent = indentMatch ? indentMatch[1].length : 0
        const level = Math.floor(indent / 2)

        // 提取文本
        let text = trimmed
        if (text.startsWith('# ')) text = text.slice(2)
        else if (text.startsWith('- ')) text = text.slice(2)
        else if (text.startsWith('* ')) text = text.slice(2)

        if (!text) continue

        const node: MindMapNode = {
            id: crypto.randomUUID(),
            text,
            children: [],
            isExpanded: true,
        }

        // 确定父节点
        while (stack.length > level + 1) {
            stack.pop()
        }

        const parent = stack[stack.length - 1]
        node.parentId = parent.id
        parent.children.push(node)
        stack.push(node)
    }

    // 如果根节点只有一个子节点且文本为默认值，提升子节点
    if (root.text === '导入的导图' && root.children.length === 1) {
        const child = root.children[0]
        root.text = child.text
        root.children = child.children
        root.children.forEach(c => c.parentId = root.id)
    }

    return root
}
