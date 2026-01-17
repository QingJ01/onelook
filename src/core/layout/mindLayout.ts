import type { MindMapNode } from '@/types'

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
    horizontalGap: number  // 水平间距
    verticalGap: number    // 垂直间距
    nodeWidth: number      // 节点默认宽度
    nodeHeight: number     // 节点默认高度
    direction: 'right' | 'left' | 'both'  // 布局方向
}

const DEFAULT_OPTIONS: LayoutOptions = {
    horizontalGap: 60,
    verticalGap: 20,
    nodeWidth: 120,
    nodeHeight: 40,
    direction: 'right',
}

/**
 * 思维导图布局算法
 * 采用经典的分层树布局
 */
export class MindMapLayout {
    private options: LayoutOptions

    constructor(options: Partial<LayoutOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options }
    }

    /**
     * 计算节点布局
     */
    layout(root: MindMapNode, centerX: number, centerY: number): LayoutNode {
        // 第一步：构建布局树并计算每个节点的尺寸
        const layoutRoot = this.buildLayoutTree(root)

        // 第二步：计算子树高度
        this.calculateSubtreeHeight(layoutRoot)

        // 第三步：分配位置
        layoutRoot.x = centerX
        layoutRoot.y = centerY
        this.assignPositions(layoutRoot, centerX)

        return layoutRoot
    }

    /**
     * 构建布局树
     */
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

    /**
     * 计算节点高度（根据字号）
     */
    private calculateNodeHeight(node: MindMapNode): number {
        const fontSize = node.style?.fontSize || 14
        const padding = 20  // 上下内边距
        const minHeight = 36
        // 高度 = 字号 + 上下内边距
        return Math.max(minHeight, fontSize + padding)
    }

    /**
     * 计算节点宽度（根据文本长度）
     */
    private calculateNodeWidth(node: MindMapNode): number {
        // 计算字符宽度：中文约16px，英文约8px
        let textWidth = 0
        for (const char of node.text) {
            // 中文字符范围检测
            if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
                textWidth += 14  // 中文字符
            } else {
                textWidth += 8   // 英文/数字
            }
        }

        // 如果有图标，增加图标宽度
        const iconWidth = node.data?.icon ? 24 : 0

        // 如果有自定义字号，按比例调整
        const fontScale = node.style?.fontSize ? node.style.fontSize / 14 : 1
        textWidth = textWidth * fontScale

        const padding = 32
        const minWidth = 60
        const maxWidth = 300  // 增大最大宽度
        return Math.max(minWidth, Math.min(maxWidth, textWidth + padding + iconWidth))
    }

    /**
     * 计算子树高度
     */
    private calculateSubtreeHeight(node: LayoutNode): number {
        if (node.children.length === 0) {
            return node.height
        }

        let totalHeight = 0
        for (const child of node.children) {
            totalHeight += this.calculateSubtreeHeight(child)
        }
        totalHeight += (node.children.length - 1) * this.options.verticalGap

            // 存储子树高度
            ; (node as any)._subtreeHeight = Math.max(node.height, totalHeight)

        return (node as any)._subtreeHeight
    }

    /**
     * 分配节点位置
     */
    private assignPositions(node: LayoutNode, rootX: number = 0): void {
        if (node.children.length === 0) return

        const subtreeHeight = (node as any)._subtreeHeight || node.height
        let currentY = node.y - subtreeHeight / 2

        // 判断该节点是否在根节点左边（用于决定子节点展开方向）
        const isOnLeftSide = node.x < rootX

        for (const child of node.children) {
            const childSubtreeHeight = (child as any)._subtreeHeight || child.height

            // 如果节点有自定义位置，使用自定义位置
            if (child.node.position) {
                child.x = child.node.position.x
                child.y = child.node.position.y
            } else {
                // 子节点 X 位置（根据父节点位置决定方向）
                if (isOnLeftSide) {
                    // 在左边，子节点向左展开
                    child.x = node.x - node.width / 2 - this.options.horizontalGap - child.width / 2
                } else {
                    // 在右边，子节点向右展开
                    child.x = node.x + node.width / 2 + this.options.horizontalGap + child.width / 2
                }

                // 子节点 Y 位置（居中于子树高度）
                child.y = currentY + childSubtreeHeight / 2
            }

            currentY += childSubtreeHeight + this.options.verticalGap

            // 递归处理子节点，继承方向信息
            this.assignPositions(child, rootX)
        }
    }

    /**
     * 扁平化布局树
     */
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
 * 生成连线路径
 */
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
