import type { MindMapNode } from '@/types'
import { calculateNodeSize } from '@/utils/nodeContentMetrics'

export interface LayoutNode {
    id: string
    x: number
    y: number
    width: number
    height: number
    node: MindMapNode
    children: LayoutNode[]
    parent?: LayoutNode
}

export interface LayoutOptions {
    horizontalGap: number
    verticalGap: number
    nodeWidth: number
    nodeHeight: number
    direction: 'right' | 'left' | 'both'
}

const DEFAULT_OPTIONS: LayoutOptions = {
    horizontalGap: 60,
    verticalGap: 20,
    nodeWidth: 120,
    nodeHeight: 40,
    direction: 'right',
}

export class MindMapLayout {
    private options: LayoutOptions

    constructor(options: Partial<LayoutOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options }
    }

    layout(root: MindMapNode, centerX: number, centerY: number): LayoutNode {
        const layoutRoot = this.buildLayoutTree(root)

        this.calculateSubtreeHeight(layoutRoot)

        layoutRoot.x = centerX
        layoutRoot.y = centerY
        this.assignPositions(layoutRoot, centerX)

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

    private calculateSubtreeHeight(node: LayoutNode): number {
        if (node.children.length === 0) {
            return node.height
        }

        let totalHeight = 0
        for (const child of node.children) {
            totalHeight += this.calculateSubtreeHeight(child)
        }
        totalHeight += (node.children.length - 1) * this.options.verticalGap

        ;(node as any)._subtreeHeight = Math.max(node.height, totalHeight)

        return (node as any)._subtreeHeight
    }

    private assignPositions(node: LayoutNode, rootX: number = 0): void {
        if (node.children.length === 0) return

        const subtreeHeight = (node as any)._subtreeHeight || node.height
        let currentY = node.y - subtreeHeight / 2

        const isOnLeftSide = node.x < rootX

        for (const child of node.children) {
            const childSubtreeHeight = (child as any)._subtreeHeight || child.height

            if (child.node.position) {
                child.x = child.node.position.x
                child.y = child.node.position.y
            } else {
                if (isOnLeftSide) {
                    child.x = node.x - node.width / 2 - this.options.horizontalGap - child.width / 2
                } else {
                    child.x = node.x + node.width / 2 + this.options.horizontalGap + child.width / 2
                }

                child.y = currentY + childSubtreeHeight / 2
            }

            currentY += childSubtreeHeight + this.options.verticalGap

            this.assignPositions(child, rootX)
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

export function generateConnectionPath(
    from: { x: number; y: number; width: number },
    to: { x: number; y: number; width: number },
    style: 'curve' | 'straight' | 'polyline' = 'curve'
): string {
    const startX = from.x + from.width / 2
    const startY = from.y
    const endX = to.x - to.width / 2
    const endY = to.y

    switch (style) {
        case 'straight':
            return `M ${startX} ${startY} L ${endX} ${endY}`

        case 'polyline': {
            const midX = (startX + endX) / 2
            return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`
        }

        case 'curve':
        default: {
            const controlOffset = (endX - startX) / 2
            return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`
        }
    }
}
