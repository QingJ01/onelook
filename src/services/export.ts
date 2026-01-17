import type { MindMapDocument, MindMapNode } from '@/types'

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
        if (!ctx) return

        // 获取 SVG 尺寸
        const bbox = svgElement.getBBox()
        const padding = 60
        const scale = 2 // 高分辨率
        canvas.width = (bbox.width + padding * 2) * scale
        canvas.height = (bbox.height + padding * 2) * scale

        // 填充白色背景
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // 准备导出专用的 SVG
        const exportSvg = prepareExportSvg(svgElement, bbox, padding)

        // 转换为图片
        const svgData = new XMLSerializer().serializeToString(exportSvg)
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)

        const img = new Image()
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            URL.revokeObjectURL(url)

            canvas.toBlob((blob) => {
                if (blob) {
                    downloadBlob(blob, `${fileName}.png`)
                }
            }, 'image/png')
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            console.error('PNG export failed')
        }
        img.src = url
    },

    /**
     * 导出为 SVG
     */
    exportSVG(svgElement: SVGSVGElement, fileName: string): void {
        // 获取 SVG 尺寸
        const bbox = svgElement.getBBox()
        const padding = 60

        // 准备导出专用的 SVG
        const exportSvg = prepareExportSvg(svgElement, bbox, padding)

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
}

/**
 * 准备导出专用的 SVG
 */
function prepareExportSvg(svgElement: SVGSVGElement, bbox: DOMRect, padding: number): SVGSVGElement {
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

    // 内联完整样式
    const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    styleElement.textContent = `
        .node-bg { 
            fill: #f9fafb; 
            stroke: #e5e7eb; 
            stroke-width: 1;
        }
        .node.root .node-bg { 
            fill: #3b82f6; 
            stroke: #3b82f6; 
        }
        .node.selected .node-bg {
            stroke: #3b82f6;
            stroke-width: 2;
        }
        .node-text { 
            fill: #1f2937; 
            font-size: 14px; 
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
            stroke: #d1d5db; 
            stroke-width: 2;
            stroke-linecap: round;
        }
    `
    svgClone.insertBefore(styleElement, svgClone.firstChild)

    return svgClone
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
        return JSON.parse(text)
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

        return data.document
    },
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
