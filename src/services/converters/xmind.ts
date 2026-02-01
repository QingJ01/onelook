/**
 * XMind 格式转换器
 * 支持 XMind 8+ 的 .xmind 格式（基于 ZIP + JSON）
 */

import type { MindMapNode, MindMapDocument, NodeStyle, NodeData } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import JSZip from 'jszip'

// XMind JSON 结构类型定义
interface XMindTopic {
    id: string
    class?: string
    title: string
    structureClass?: string
    children?: {
        attached?: XMindTopic[]
        detached?: XMindTopic[]
    }
    notes?: {
        plain?: { content: string }
        html?: { content: string }
    }
    labels?: string[]
    href?: string
    image?: {
        src: string
    }
    markers?: Array<{
        markerId: string
    }>
    style?: {
        properties?: {
            'svg:fill'?: string
            'fo:color'?: string
            'fo:font-size'?: string
            'fo:font-weight'?: string
            'border-line-color'?: string
            'border-line-width'?: string
            'shape-class'?: string
        }
    }
}

interface XMindSheet {
    id: string
    class?: string
    title: string
    rootTopic: XMindTopic
    theme?: string
}

interface XMindContent {
    sheets?: XMindSheet[]
    // 兼容旧版格式
    id?: string
    title?: string
    rootTopic?: XMindTopic
}

export const xmindConverter = {
    /**
     * 从 XMind 文件导入
     */
    async import(file: File): Promise<MindMapDocument> {
        const zip = await JSZip.loadAsync(file)

        // 尝试读取 content.json（XMind 8+ 格式）
        const contentFile = zip.file('content.json')
        if (!contentFile) {
            throw new Error('无效的 XMind 文件：找不到 content.json')
        }

        const contentText = await contentFile.async('text')
        const content: XMindContent[] | XMindContent = JSON.parse(contentText)

        // 处理数组格式（标准 XMind 8+ 格式）
        let sheet: XMindSheet
        if (Array.isArray(content)) {
            if (content.length === 0) {
                throw new Error('XMind 文件中没有工作表')
            }
            sheet = content[0] as XMindSheet
        } else if (content.sheets && content.sheets.length > 0) {
            sheet = content.sheets[0]
        } else if (content.rootTopic) {
            // 兼容简化格式
            sheet = {
                id: content.id || uuidv4(),
                title: content.title || '导入的导图',
                rootTopic: content.rootTopic
            }
        } else {
            throw new Error('无法解析 XMind 文件结构')
        }

        // 转换为 OneLook 格式
        const root = convertXMindTopic(sheet.rootTopic)

        return {
            id: uuidv4(),
            name: sheet.title || file.name.replace(/\.xmind$/i, ''),
            root,
            layout: 'mind',
            theme: 'light',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: '0.1.0'
        }
    },

    /**
     * 导出为 XMind 格式
     */
    async export(doc: MindMapDocument): Promise<Blob> {
        const zip = new JSZip()

        // 创建 XMind 内容
        const xmindContent: XMindSheet[] = [{
            id: uuidv4(),
            class: 'sheet',
            title: doc.name,
            rootTopic: convertToXMindTopic(doc.root)
        }]

        // 添加 content.json
        zip.file('content.json', JSON.stringify(xmindContent, null, 2))

        // 添加 metadata.json
        const metadata = {
            creator: {
                name: 'OneLook',
                version: '0.2.0'
            }
        }
        zip.file('metadata.json', JSON.stringify(metadata, null, 2))

        // 添加 manifest.json
        const manifest = {
            'file-entries': {
                'content.json': {},
                'metadata.json': {}
            }
        }
        zip.file('manifest.json', JSON.stringify(manifest, null, 2))

        // 生成 ZIP 文件
        return await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
    }
}

/**
 * 将 XMind Topic 转换为 OneLook 节点
 */
function convertXMindTopic(topic: XMindTopic, parentId?: string): MindMapNode {
    const node: MindMapNode = {
        id: uuidv4(),
        text: topic.title || '',
        parentId,
        children: [],
        isExpanded: true
    }

    // 转换样式
    if (topic.style?.properties) {
        const props = topic.style.properties
        const style: NodeStyle = {}

        if (props['svg:fill']) {
            style.background = props['svg:fill']
        }
        if (props['fo:color']) {
            style.color = props['fo:color']
        }
        if (props['fo:font-size']) {
            style.fontSize = parseInt(props['fo:font-size'])
        }
        if (props['fo:font-weight'] === 'bold') {
            style.fontWeight = 'bold'
        }
        if (props['border-line-color']) {
            style.borderColor = props['border-line-color']
        }
        if (props['shape-class']) {
            const shapeMap: Record<string, NodeStyle['shape']> = {
                'org.xmind.topicShape.roundedRect': 'round',
                'org.xmind.topicShape.rect': 'rect',
                'org.xmind.topicShape.diamond': 'diamond',
                'org.xmind.topicShape.ellipse': 'ellipse'
            }
            style.shape = shapeMap[props['shape-class']] || 'round'
        }

        if (Object.keys(style).length > 0) {
            node.style = style
        }
    }

    // 转换扩展数据
    const data: NodeData = {}

    if (topic.notes?.plain?.content) {
        data.note = topic.notes.plain.content
    } else if (topic.notes?.html?.content) {
        // 简单去除 HTML 标签
        data.note = topic.notes.html.content.replace(/<[^>]*>/g, '')
    }

    if (topic.href) {
        data.hyperlink = topic.href
    }

    if (topic.labels && topic.labels.length > 0) {
        data.tags = topic.labels
    }

    // 转换标记（优先级、进度等）
    if (topic.markers) {
        for (const marker of topic.markers) {
            const markerId = marker.markerId
            // 优先级标记
            if (markerId.startsWith('priority-')) {
                const priority = parseInt(markerId.replace('priority-', ''))
                if (priority >= 1 && priority <= 9) {
                    data.priority = priority
                }
            }
            // 进度标记
            if (markerId.startsWith('task-')) {
                const progressMap: Record<string, number> = {
                    'task-start': 0,
                    'task-quarter': 25,
                    'task-half': 50,
                    'task-3quar': 75,
                    'task-done': 100
                }
                if (progressMap[markerId] !== undefined) {
                    data.progress = progressMap[markerId]
                }
            }
        }
    }

    if (Object.keys(data).length > 0) {
        node.data = data
    }

    // 递归转换子节点
    if (topic.children?.attached) {
        node.children = topic.children.attached.map(child =>
            convertXMindTopic(child, node.id)
        )
    }

    return node
}

/**
 * 将 OneLook 节点转换为 XMind Topic
 */
function convertToXMindTopic(node: MindMapNode): XMindTopic {
    const topic: XMindTopic = {
        id: uuidv4(),
        title: node.text
    }

    // 根节点标记
    if (!node.parentId) {
        topic.class = 'topic'
        topic.structureClass = 'org.xmind.ui.map.unbalanced'
    }

    // 转换样式
    if (node.style) {
        const properties: NonNullable<XMindTopic['style']>['properties'] = {}

        if (node.style.background) {
            properties['svg:fill'] = node.style.background
        }
        if (node.style.color) {
            properties['fo:color'] = node.style.color
        }
        if (node.style.fontSize) {
            properties['fo:font-size'] = `${node.style.fontSize}pt`
        }
        if (node.style.fontWeight === 'bold') {
            properties['fo:font-weight'] = 'bold'
        }
        if (node.style.borderColor) {
            properties['border-line-color'] = node.style.borderColor
        }
        if (node.style.shape) {
            const shapeMap: Record<string, string> = {
                'round': 'org.xmind.topicShape.roundedRect',
                'rect': 'org.xmind.topicShape.rect',
                'diamond': 'org.xmind.topicShape.diamond',
                'ellipse': 'org.xmind.topicShape.ellipse'
            }
            properties['shape-class'] = shapeMap[node.style.shape]
        }

        if (Object.keys(properties).length > 0) {
            topic.style = { properties }
        }
    }

    // 转换扩展数据
    if (node.data) {
        if (node.data.note) {
            topic.notes = {
                plain: { content: node.data.note }
            }
        }

        if (node.data.hyperlink) {
            topic.href = node.data.hyperlink
        }

        if (node.data.tags && node.data.tags.length > 0) {
            topic.labels = node.data.tags
        }

        // 转换标记
        const markers: Array<{ markerId: string }> = []

        if (node.data.priority && node.data.priority >= 1 && node.data.priority <= 9) {
            markers.push({ markerId: `priority-${node.data.priority}` })
        }

        if (node.data.progress !== undefined) {
            const progressMap: Record<number, string> = {
                0: 'task-start',
                25: 'task-quarter',
                50: 'task-half',
                75: 'task-3quar',
                100: 'task-done'
            }
            // 找最接近的进度值
            const closest = Object.keys(progressMap)
                .map(Number)
                .reduce((prev, curr) =>
                    Math.abs(curr - node.data!.progress!) < Math.abs(prev - node.data!.progress!)
                        ? curr : prev
                )
            markers.push({ markerId: progressMap[closest] })
        }

        if (markers.length > 0) {
            topic.markers = markers
        }
    }

    // 递归转换子节点
    if (node.children.length > 0) {
        topic.children = {
            attached: node.children.map(child => convertToXMindTopic(child))
        }
    }

    return topic
}
