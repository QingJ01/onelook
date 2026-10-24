import type { FlowEdge, FlowNode, FlowNodeKind } from '@/types'
import {
    routeVertical,
    type GraphLayoutEngine,
    type GraphLayoutResult,
    type LayoutEdgeInput,
    type LayoutNodeInput,
} from './graph'

/**
 * 流程图布局器：有向图分层布局（Sugiyama 简化版）
 *
 * - 分层：Kahn 拓扑推进（入度为 0 的节点置第 0 层，后继取 max(pred)+1）；
 *   存在环时，剩余节点统一放到最深层（不阻塞渲染）。
 * - 层内排序：按前驱平均位置做一次重心排序，减少交叉。
 * - 定位：每层水平居中；纵向按层累加（层高取该层最高节点）。
 * - 手动位置：node.position 优先（拖拽后的节点不再被自动覆盖）。
 * - 连线：纵向正交路由；回边从右侧绕行。
 *
 * 与导图布局器实现同一个 GraphLayoutEngine 接口，但两者独立使用：
 * 流程图文档不含导图节点，也不参与绑定。
 */

export interface FlowLayoutNode extends FlowNode, LayoutNodeInput {
    /** 尺寸（由布局器填充） */
    width: number
    height: number
}

export interface FlowLayoutEdge extends LayoutEdgeInput {
    edge: FlowEdge
}

const KIND_SIZE: Record<FlowNodeKind, { width: number; height: number }> = {
    start: { width: 120, height: 44 },
    end: { width: 120, height: 44 },
    process: { width: 168, height: 60 },
    decision: { width: 184, height: 96 },
    io: { width: 176, height: 56 },
    note: { width: 168, height: 60 },
}

export function flowNodeSize(node: FlowNode): { width: number; height: number } {
    const base = KIND_SIZE[node.kind] ?? KIND_SIZE.process
    const text = node.text || ''
    // 粗略按文本长度加宽，避免文字溢出
    let textWidth = 0
    for (const ch of text.split('\n')[0]) {
        textWidth += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 14 : 8
    }
    return {
        width: Math.max(base.width, Math.min(320, textWidth + 48)),
        height: Math.max(base.height, 24 * (text.split('\n').length || 1) + 28),
    }
}

const LAYER_GAP = 92
const NODE_GAP = 44

export class FlowLayoutEngine implements GraphLayoutEngine<FlowLayoutNode, FlowLayoutEdge> {
    readonly name = 'flow-layered'

    layout(
        nodes: FlowLayoutNode[],
        edges: FlowLayoutEdge[],
        origin: { x: number; y: number } = { x: 0, y: 0 },
    ): GraphLayoutResult<FlowLayoutNode, FlowLayoutEdge> {
        if (nodes.length === 0) return { nodes: [], edges: [] }

        const byId = new Map(nodes.map(n => [n.id, n]))
        const outgoing = new Map<string, string[]>()
        const incoming = new Map<string, string[]>()
        const indeg = new Map<string, number>()
        for (const n of nodes) {
            outgoing.set(n.id, [])
            incoming.set(n.id, [])
            indeg.set(n.id, 0)
        }
        for (const e of edges) {
            if (!byId.has(e.from) || !byId.has(e.to) || e.from === e.to) continue
            outgoing.get(e.from)!.push(e.to)
            incoming.get(e.to)!.push(e.from)
            indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
        }

        // ---------- 分层（Kahn） ----------
        const layer = new Map<string, number>()
        const queue: string[] = []
        for (const n of nodes) {
            if ((indeg.get(n.id) ?? 0) === 0) {
                layer.set(n.id, 0)
                queue.push(n.id)
            }
        }
        const deg = new Map(indeg)
        let head = 0
        while (head < queue.length) {
            const id = queue[head++]
            for (const next of outgoing.get(id) ?? []) {
                layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(id) ?? 0) + 1))
                deg.set(next, (deg.get(next) ?? 0) - 1)
                if ((deg.get(next) ?? 0) === 0) queue.push(next)
            }
        }
        // 环内节点：放到最深层
        let maxLayer = 0
        for (const value of layer.values()) maxLayer = Math.max(maxLayer, value)
        for (const n of nodes) {
            if (!layer.has(n.id)) layer.set(n.id, maxLayer + 1)
        }

        // ---------- 层内排序（一次重心近似） ----------
        const layers: string[][] = []
        for (const n of nodes) {
            const l = layer.get(n.id) ?? 0
            if (!layers[l]) layers[l] = []
            layers[l].push(n.id)
        }
        const orderIndex = new Map<string, number>()
        layers.forEach(list => list.forEach((id, i) => orderIndex.set(id, i)))
        for (let l = 1; l < layers.length; l++) {
            const list = layers[l] ?? []
            const bary = (id: string) => {
                const preds = (incoming.get(id) ?? []).filter(p => (layer.get(p) ?? 0) === l - 1)
                if (preds.length === 0) return orderIndex.get(id) ?? 0
                return preds.reduce((sum, p) => sum + (orderIndex.get(p) ?? 0), 0) / preds.length
            }
            list.sort((a, b) => bary(a) - bary(b))
            list.forEach((id, i) => orderIndex.set(id, i))
        }

        // ---------- 定位 ----------
        const positioned = new Map<string, { x: number; y: number }>()
        let y = origin.y
        for (let l = 0; l < layers.length; l++) {
            const list = layers[l] ?? []
            if (list.length === 0) continue
            const sizes = list.map(id => {
                const input = byId.get(id)!
                return { id, ...flowNodeSize(input) }
            })
            const layerHeight = Math.max(...sizes.map(s => s.height))
            const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0) + NODE_GAP * (sizes.length - 1)
            let x = origin.x - totalWidth / 2
            for (const s of sizes) {
                positioned.set(s.id, { x: x + s.width / 2, y: y + layerHeight / 2 })
                x += s.width + NODE_GAP
            }
            y += layerHeight + LAYER_GAP
        }

        const resultNodes: GraphLayoutResult<FlowLayoutNode, FlowLayoutEdge>['nodes'] = nodes.map(input => {
            const explicit = input.position
            const size = flowNodeSize(input)
            const auto = positioned.get(input.id) ?? { x: origin.x, y: origin.y }
            return {
                node: input,
                x: explicit?.x ?? auto.x,
                y: explicit?.y ?? auto.y,
                width: size.width,
                height: size.height,
            }
        })

        const posById = new Map(resultNodes.map(n => [n.node.id, n]))
        const resultEdges: GraphLayoutResult<FlowLayoutNode, FlowLayoutEdge>['edges'] = []
        for (const e of edges) {
            const from = posById.get(e.from)
            const to = posById.get(e.to)
            if (!from || !to) continue
            resultEdges.push({
                edge: e,
                path: routeVertical(from, to),
                midX: (from.x + to.x) / 2,
                midY: (from.y + from.height / 2 + to.y - to.height / 2) / 2,
            })
        }

        return { nodes: resultNodes, edges: resultEdges }
    }
}
