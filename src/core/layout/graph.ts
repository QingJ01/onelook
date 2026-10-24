/**
 * 图布局器抽象
 *
 * 布局器统一输入「节点 + 边」的图，输出带坐标的节点与已路由的连线路径。
 * 两种实现：
 * - TreeGraphLayoutEngine（导图）：树是图的特例，由 parent 边构造树后复用
 *   现有的 mind/tree/org/fishbone 布局，再输出统一结果；
 * - FlowLayoutEngine（流程图）：有向图分层布局（Sugiyama 简化版）。
 *
 * 节点/边均为类型化对象（T / E 扩展基础字段），布局器不关心业务语义。
 */

export interface LayoutNodeInput {
    id: string
    width: number
    height: number
    /** 手动位置（可选）；给出时布局器优先采用 */
    position?: { x: number; y: number }
}

export interface LayoutEdgeInput {
    id: string
    from: string
    to: string
}

export interface PositionedGraphNode<T> {
    node: T
    x: number
    y: number
    width: number
    height: number
}

export interface RoutedGraphEdge<E> {
    edge: E
    /** SVG path d */
    path: string
    /** 用于标签定位的中点 */
    midX: number
    midY: number
}

export interface GraphLayoutResult<T, E> {
    nodes: Array<PositionedGraphNode<T>>
    edges: Array<RoutedGraphEdge<E>>
}

export interface GraphLayoutEngine<T extends LayoutNodeInput, E extends LayoutEdgeInput> {
    readonly name: string
    layout(nodes: T[], edges: E[], origin?: { x: number; y: number }): GraphLayoutResult<T, E>
}

// ---------- 路由工具（两模式共用） ----------

/** 纵向正交路由：从源底边中点出发，经中间水平线到目标顶边中点 */
export function routeVertical(
    from: { x: number; y: number; height: number },
    to: { x: number; y: number; height: number },
): string {
    const sx = from.x
    const sy = from.y + from.height / 2
    const tx = to.x
    const ty = to.y - to.height / 2
    if (ty > sy) {
        const midY = (sy + ty) / 2
        return `M ${sx} ${sy} V ${midY} H ${tx} V ${ty}`
    }
    // 回边（目标在上方）：从右侧绕行
    const offset = 40
    const sx2 = sx + offset
    const tx2 = tx + offset
    return `M ${sx} ${sy} H ${sx2} V ${ty - offset} H ${tx2} V ${ty}`
}

/** 横向贝塞尔路由（导图父子连线） */
export function routeHorizontalCurve(
    from: { x: number; y: number; width: number },
    to: { x: number; y: number; width: number },
    style: 'curve' | 'straight' | 'polyline' = 'curve',
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
        default: {
            const controlOffset = (endX - startX) / 2
            return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`
        }
    }
}
