import type { MindMapNode } from '@/types'
import type { LayoutNode, LayoutOptions } from './mindLayout'

const DEFAULT_OPTIONS: LayoutOptions = {
    horizontalGap: 60,
    verticalGap: 24,
    nodeWidth: 120,
    nodeHeight: 40,
    direction: 'right',
}

const TEXT_WIDTH_PATTERN = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/
const NODE_PADDING_X = 32
const NODE_PADDING_Y = 20
const MIN_NODE_WIDTH = 60
const MAX_NODE_WIDTH = 300
const MIN_NODE_HEIGHT = 36
const LINE_HEIGHT_RATIO = 1.4

function estimateTextWidth(text: string): number {
    let width = 0
    for (const char of text) {
        width += TEXT_WIDTH_PATTERN.test(char) ? 14 : 8
    }
    return width
}

function getFontMetrics(node: MindMapNode) {
    const fontSize = node.style?.fontSize || 14
    const fontScale = fontSize / 14
    return { fontSize, fontScale }
}

function estimateWrappedLineCount(text: string, contentWidth: number, fontScale: number): number {
    if (!text) return 1
    const lines = text.split('\n')
    let total = 0
    for (const line of lines) {
        const lineWidth = estimateTextWidth(line) * fontScale
        total += Math.max(1, Math.ceil(lineWidth / contentWidth))
    }
    return Math.max(1, total)
}

/**
 * 树形布局算法
 * 垂直方向展开，类似文件树
 */
export class TreeLayout {
    private options: LayoutOptions

    constructor(options: Partial<LayoutOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options }
    }

    layout(root: MindMapNode, centerX: number, centerY: number): LayoutNode {
        const layoutRoot = this.buildLayoutTree(root)
        this.calculateSubtreeWidth(layoutRoot)

        layoutRoot.x = centerX
        layoutRoot.y = centerY
        this.assignPositions(layoutRoot)

        return layoutRoot
    }

    private buildLayoutTree(node: MindMapNode, parent?: LayoutNode): LayoutNode {
        const layoutNode: LayoutNode = {
            id: node.id,
            x: 0,
            y: 0,
            width: this.calculateNodeWidth(node),
            height: this.calculateNodeHeight(node),
            node,
            children: [],
            parent,
        }

        if (node.isExpanded && node.children.length > 0) {
            layoutNode.children = node.children.map(child =>
                this.buildLayoutTree(child, layoutNode)
            )
        }

        return layoutNode
    }

    private calculateNodeHeight(node: MindMapNode): number {
        const { fontSize, fontScale } = getFontMetrics(node)
        const iconWidth = node.data?.icon ? 24 : 0
        const width = this.calculateNodeWidth(node)
        const contentWidth = Math.max(1, width - NODE_PADDING_X - iconWidth)
        const lineCount = estimateWrappedLineCount(node.text, contentWidth, fontScale)
        const lineHeight = fontSize * LINE_HEIGHT_RATIO
        return Math.max(MIN_NODE_HEIGHT, Math.ceil(lineHeight * lineCount + NODE_PADDING_Y))
    }

    private calculateNodeWidth(node: MindMapNode): number {
        const { fontScale } = getFontMetrics(node)
        const textWidth = estimateTextWidth(node.text) * fontScale
        const iconWidth = node.data?.icon ? 24 : 0
        return Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, textWidth + NODE_PADDING_X + iconWidth))
    }

    private calculateSubtreeWidth(node: LayoutNode): number {
        if (node.children.length === 0) {
            return node.width
        }

        let totalWidth = 0
        for (const child of node.children) {
            totalWidth += this.calculateSubtreeWidth(child)
        }
        totalWidth += (node.children.length - 1) * this.options.horizontalGap

            ; (node as any)._subtreeWidth = Math.max(node.width, totalWidth)
        return (node as any)._subtreeWidth
    }

    private assignPositions(node: LayoutNode): void {
        if (node.children.length === 0) return

        const subtreeWidth = (node as any)._subtreeWidth || node.width
        let currentX = node.x - subtreeWidth / 2

        for (const child of node.children) {
            const childSubtreeWidth = (child as any)._subtreeWidth || child.width

            child.y = node.y + node.height / 2 + this.options.verticalGap + child.height / 2
            child.x = currentX + childSubtreeWidth / 2

            currentX += childSubtreeWidth + this.options.horizontalGap

            this.assignPositions(child)
        }
    }

    flatten(root: LayoutNode): LayoutNode[] {
        const result: LayoutNode[] = []
        const traverse = (node: LayoutNode) => {
            result.push(node)
            node.children.forEach(traverse)
        }
        traverse(root)
        return result
    }
}

/**
 * 组织架构图布局
 * 自上而下展开
 */
export class OrgLayout {
    private options: LayoutOptions

    constructor(options: Partial<LayoutOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options, verticalGap: 60 }
    }

    layout(root: MindMapNode, centerX: number, centerY: number): LayoutNode {
        const layoutRoot = this.buildLayoutTree(root)
        this.calculateSubtreeWidth(layoutRoot)

        layoutRoot.x = centerX
        layoutRoot.y = centerY
        this.assignPositions(layoutRoot)

        return layoutRoot
    }

    private buildLayoutTree(node: MindMapNode, parent?: LayoutNode): LayoutNode {
        const layoutNode: LayoutNode = {
            id: node.id,
            x: 0,
            y: 0,
            width: this.calculateNodeWidth(node),
            height: this.calculateNodeHeight(node),
            node,
            children: [],
            parent,
        }

        if (node.isExpanded && node.children.length > 0) {
            layoutNode.children = node.children.map(child =>
                this.buildLayoutTree(child, layoutNode)
            )
        }

        return layoutNode
    }

    private calculateNodeHeight(node: MindMapNode): number {
        const { fontSize, fontScale } = getFontMetrics(node)
        const iconWidth = node.data?.icon ? 24 : 0
        const width = this.calculateNodeWidth(node)
        const contentWidth = Math.max(1, width - NODE_PADDING_X - iconWidth)
        const lineCount = estimateWrappedLineCount(node.text, contentWidth, fontScale)
        const lineHeight = fontSize * LINE_HEIGHT_RATIO
        return Math.max(MIN_NODE_HEIGHT, Math.ceil(lineHeight * lineCount + NODE_PADDING_Y))
    }

    private calculateNodeWidth(node: MindMapNode): number {
        const { fontScale } = getFontMetrics(node)
        const textWidth = estimateTextWidth(node.text) * fontScale
        const iconWidth = node.data?.icon ? 24 : 0
        return Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, textWidth + NODE_PADDING_X + iconWidth))
    }

    private calculateSubtreeWidth(node: LayoutNode): number {
        if (node.children.length === 0) {
            return node.width
        }

        let totalWidth = 0
        for (const child of node.children) {
            totalWidth += this.calculateSubtreeWidth(child)
        }
        totalWidth += (node.children.length - 1) * this.options.horizontalGap

            ; (node as any)._subtreeWidth = Math.max(node.width, totalWidth)
        return (node as any)._subtreeWidth
    }

    private assignPositions(node: LayoutNode): void {
        if (node.children.length === 0) return

        const subtreeWidth = (node as any)._subtreeWidth || node.width
        let currentX = node.x - subtreeWidth / 2

        for (const child of node.children) {
            const childSubtreeWidth = (child as any)._subtreeWidth || child.width

            child.y = node.y + node.height / 2 + this.options.verticalGap + child.height / 2
            child.x = currentX + childSubtreeWidth / 2

            currentX += childSubtreeWidth + this.options.horizontalGap

            this.assignPositions(child)
        }
    }

    flatten(root: LayoutNode): LayoutNode[] {
        const result: LayoutNode[] = []
        const traverse = (node: LayoutNode) => {
            result.push(node)
            node.children.forEach(traverse)
        }
        traverse(root)
        return result
    }
}

/**
 * 鱼骨图布局
 * 左右交替展开
 */
export class FishboneLayout {
    private options: LayoutOptions

    constructor(options: Partial<LayoutOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options }
    }

    layout(root: MindMapNode, centerX: number, centerY: number): LayoutNode {
        const layoutRoot = this.buildLayoutTree(root)

        layoutRoot.x = centerX
        layoutRoot.y = centerY
        this.assignPositions(layoutRoot)

        return layoutRoot
    }

    private buildLayoutTree(node: MindMapNode, parent?: LayoutNode): LayoutNode {
        const layoutNode: LayoutNode = {
            id: node.id,
            x: 0,
            y: 0,
            width: this.calculateNodeWidth(node),
            height: this.calculateNodeHeight(node),
            node,
            children: [],
            parent,
        }

        if (node.isExpanded && node.children.length > 0) {
            layoutNode.children = node.children.map(child =>
                this.buildLayoutTree(child, layoutNode)
            )
        }

        return layoutNode
    }

    private calculateNodeHeight(node: MindMapNode): number {
        const { fontSize, fontScale } = getFontMetrics(node)
        const iconWidth = node.data?.icon ? 24 : 0
        const width = this.calculateNodeWidth(node)
        const contentWidth = Math.max(1, width - NODE_PADDING_X - iconWidth)
        const lineCount = estimateWrappedLineCount(node.text, contentWidth, fontScale)
        const lineHeight = fontSize * LINE_HEIGHT_RATIO
        return Math.max(MIN_NODE_HEIGHT, Math.ceil(lineHeight * lineCount + NODE_PADDING_Y))
    }

    private calculateNodeWidth(node: MindMapNode): number {
        const { fontScale } = getFontMetrics(node)
        const textWidth = estimateTextWidth(node.text) * fontScale
        const iconWidth = node.data?.icon ? 24 : 0
        return Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, textWidth + NODE_PADDING_X + iconWidth))
    }

    private assignPositions(node: LayoutNode): void {
        if (node.children.length === 0) return

        const isRoot = !node.parent

        if (isRoot) {
            // 根节点的子节点交替上下排列
            let topY = node.y - this.options.verticalGap - this.options.nodeHeight / 2
            let bottomY = node.y + this.options.verticalGap + this.options.nodeHeight / 2
            let currentX = node.x + node.width / 2 + this.options.horizontalGap

            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i]
                const isTop = i % 2 === 0

                child.x = currentX + child.width / 2
                child.y = isTop ? topY : bottomY

                if (isTop) {
                    topY -= this.options.verticalGap + this.options.nodeHeight
                } else {
                    bottomY += this.options.verticalGap + this.options.nodeHeight
                    currentX += this.options.horizontalGap * 2 + child.width
                }

                this.assignChildPositions(child, isTop)
            }
        }
    }

    private assignChildPositions(node: LayoutNode, isAbove: boolean): void {
        if (node.children.length === 0) return

        const direction = isAbove ? -1 : 1
        let currentY = node.y + direction * (this.options.verticalGap / 2 + this.options.nodeHeight / 2)

        for (const child of node.children) {
            child.x = node.x + node.width / 2 + this.options.horizontalGap / 2 + child.width / 2
            child.y = currentY + direction * child.height / 2

            currentY += direction * (this.options.verticalGap / 2 + child.height)

            this.assignChildPositions(child, isAbove)
        }
    }

    flatten(root: LayoutNode): LayoutNode[] {
        const result: LayoutNode[] = []
        const traverse = (node: LayoutNode) => {
            result.push(node)
            node.children.forEach(traverse)
        }
        traverse(root)
        return result
    }
}

/**
 * 为不同布局生成连接线路径
 */
export function generateTreeConnectionPath(
    from: { x: number; y: number; height: number },
    to: { x: number; y: number; height: number }
): string {
    const startX = from.x
    const startY = from.y + from.height / 2
    const endX = to.x
    const endY = to.y - to.height / 2

    const midY = (startY + endY) / 2

    return `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`
}
