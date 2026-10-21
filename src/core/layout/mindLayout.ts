import type { MindMapNode } from '@/types'
import { calculateNodeSize } from '@/utils/nodeContentMetrics'
import { getCellAnchor, getTableGeometry, isTableNode } from '@/utils/specialNodes'

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

        if (isTableNode(node.node)) {
            // 表格节点：子树高度取锚点组跨度（组间避让后）与表格自身高度的较大者
            const span = this.buildTableGroups(node).span
            ;(node as any)._subtreeHeight = Math.max(node.height, span.bottom - span.top)
            return (node as any)._subtreeHeight
        }

        let totalHeight = 0
        for (const child of node.children) {
            totalHeight += this.calculateSubtreeHeight(child)
        }
        totalHeight += (node.children.length - 1) * this.options.verticalGap

        ;(node as any)._subtreeHeight = Math.max(node.height, totalHeight)

        return (node as any)._subtreeHeight
    }

    /** 表格节点的子节点按单元格锚点分组；同时给出避让后的纵向跨度（相对 node.y） */
    private buildTableGroups(node: LayoutNode): {
        groups: Array<{ items: LayoutNode[]; height: number; center: number }>
        unanchored: LayoutNode[]
        span: { top: number; bottom: number }
    } {
        const geo = getTableGeometry(node.node)
        const groups: Array<{ anchor: { row: number; col: number }; items: LayoutNode[]; height: number; desired: number; center: number }> = []
        const byKey = new Map<string, (typeof groups)[number]>()
        const unanchored: LayoutNode[] = []

        for (const child of node.children) {
            const anchor = getCellAnchor(child.node)
            if (!anchor || !geo) {
                unanchored.push(child)
                continue
            }
            const row = Math.max(0, Math.min(geo.rowCount - 1, anchor.row))
            const col = Math.max(0, Math.min(geo.colCount - 1, anchor.col))
            const key = `${row}:${col}`
            let group = byKey.get(key)
            if (!group) {
                const rect = geo.cellRect(row, col)
                group = {
                    anchor: { row, col },
                    items: [],
                    height: 0,
                    desired: rect.y + rect.height / 2 - geo.height / 2,
                    center: 0,
                }
                byKey.set(key, group)
                groups.push(group)
            }
            group.items.push(child)
        }

        for (const g of groups) {
            g.height =
                g.items.reduce((s, it) => s + ((it as any)._subtreeHeight || it.height), 0) +
                (g.items.length - 1) * this.options.verticalGap
        }

        // 组间避让：按期望中心排序，向下顺推
        groups.sort((a, b) => a.desired - b.desired)
        let prevBottom = -Infinity
        for (const g of groups) {
            const center = Math.max(node.y + g.desired, prevBottom + this.options.verticalGap + g.height / 2)
            g.center = center
            prevBottom = center + g.height / 2
        }

        let top = node.y - node.height / 2
        let bottom = node.y + node.height / 2
        if (groups.length > 0) {
            top = Math.min(top, groups[0].center - groups[0].height / 2)
            bottom = Math.max(bottom, prevBottom)
        }
        for (const it of unanchored) {
            const h = (it as any)._subtreeHeight || it.height
            bottom += this.options.verticalGap + h
        }

        return {
            groups: groups.map(g => ({ items: g.items, height: g.height, center: g.center })),
            unanchored,
            span: { top, bottom },
        }
    }

    private assignPositions(node: LayoutNode, rootX: number = 0): void {
        if (node.children.length === 0) return

        if (isTableNode(node.node)) {
            this.assignTableChildPositions(node, rootX)
            return
        }

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

    /** 表格节点的子节点：按锚点组挂到对应单元格右侧，组内垂直堆叠 */
    private assignTableChildPositions(node: LayoutNode, rootX: number): void {
        const { groups, unanchored, span } = this.buildTableGroups(node)
        const childX = node.x + node.width / 2 + this.options.horizontalGap

        for (const g of groups) {
            let y = g.center - g.height / 2
            for (const it of g.items) {
                const h = (it as any)._subtreeHeight || it.height
                it.x = childX + it.width / 2
                it.y = y + h / 2
                y += h + this.options.verticalGap
                this.assignPositions(it, rootX)
            }
        }

        // 无锚点子节点（外部导入等）：排在锚点组下方
        let y = span.bottom + this.options.verticalGap
        for (const it of unanchored) {
            const h = (it as any)._subtreeHeight || it.height
            it.x = childX + it.width / 2
            it.y = y + h / 2
            y += h + this.options.verticalGap
            this.assignPositions(it, rootX)
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
