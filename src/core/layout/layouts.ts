import type { MindMapNode } from '@/types'
import type { LayoutNode, LayoutOptions } from './mindLayout'
import { calculateNodeSize } from '@/utils/nodeContentMetrics'

const DEFAULT_OPTIONS: LayoutOptions = {
    horizontalGap: 60,
    verticalGap: 24,
    nodeWidth: 120,
    nodeHeight: 40,
    direction: 'right',
}

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
        const size = calculateNodeSize(node)
        const layoutNode: LayoutNode = {
            id: node.id,
            x: 0,
            y: 0,
            width: size.width,
            height: size.height,
            node,
            children: [],
            parent,
        }

        if (node.isExpanded && node.children.length > 0) {
            layoutNode.children = node.children.map(child => this.buildLayoutTree(child, layoutNode))
        }

        return layoutNode
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

        ;(node as any)._subtreeWidth = Math.max(node.width, totalWidth)
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
        const size = calculateNodeSize(node)
        const layoutNode: LayoutNode = {
            id: node.id,
            x: 0,
            y: 0,
            width: size.width,
            height: size.height,
            node,
            children: [],
            parent,
        }

        if (node.isExpanded && node.children.length > 0) {
            layoutNode.children = node.children.map(child => this.buildLayoutTree(child, layoutNode))
        }

        return layoutNode
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

        ;(node as any)._subtreeWidth = Math.max(node.width, totalWidth)
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
        const size = calculateNodeSize(node)
        const layoutNode: LayoutNode = {
            id: node.id,
            x: 0,
            y: 0,
            width: size.width,
            height: size.height,
            node,
            children: [],
            parent,
        }

        if (node.isExpanded && node.children.length > 0) {
            layoutNode.children = node.children.map(child => this.buildLayoutTree(child, layoutNode))
        }

        return layoutNode
    }

    private assignPositions(node: LayoutNode): void {
        if (node.children.length === 0) return

        const isRoot = !node.parent

        if (isRoot) {
            let topY = node.y - this.options.verticalGap - this.options.nodeHeight / 2
            let bottomY = node.y + this.options.verticalGap + this.options.nodeHeight / 2
            let currentX = node.x + node.width / 2 + this.options.horizontalGap

            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i]
                const isTop = i % 2 === 0

                child.x = currentX + child.width / 2
                child.y = isTop ? topY : bottomY

                if (isTop) {
                    topY -= this.options.verticalGap + child.height
                } else {
                    bottomY += this.options.verticalGap + child.height
                    currentX += this.options.horizontalGap * 2 + child.width
                }

                this.assignChildPositions(child, isTop)
            }
        }
    }

    private assignChildPositions(node: LayoutNode, isAbove: boolean): void {
        if (node.children.length === 0) return

        const direction = isAbove ? -1 : 1
        let currentY = node.y + direction * (this.options.verticalGap / 2 + node.height / 2)

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
