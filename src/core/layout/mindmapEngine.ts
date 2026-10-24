import type { MindMapNode, LayoutType } from '@/types'
import type { LayoutNode, LayoutOptions } from './mindLayout'
import { MindMapLayout, generateConnectionPath } from './mindLayout'
import { TreeLayout, OrgLayout, FishboneLayout } from './layouts'
import {
    routeHorizontalCurve,
    type GraphLayoutResult,
    type LayoutEdgeInput,
    type LayoutNodeInput,
} from './graph'

/**
 * 导图布局器（树 → 统一图结果）
 *
 * 树是图的特例：parent 边构成有向树。本适配器复用既有四种树布局，
 * 同时输出统一的「节点坐标 + 连线路径」图结果，供画布与后续视图消费。
 */

export interface MindMapGraphNode extends LayoutNodeInput {
    node: MindMapNode
}

export interface MindMapGraphEdge extends LayoutEdgeInput {
    fromId: string
    toId: string
}

export interface MindMapLayoutResult {
    tree: LayoutNode
    flat: LayoutNode[]
    graph: GraphLayoutResult<MindMapGraphNode, MindMapGraphEdge>
}

export type MindMapConnectionStyle = 'curve' | 'straight' | 'polyline'

interface TreeLayoutInstance {
    layout(root: MindMapNode, centerX: number, centerY: number): LayoutNode
    flatten(root: LayoutNode): LayoutNode[]
}

function createTreeLayout(layoutType: LayoutType, options: Partial<LayoutOptions>): TreeLayoutInstance {
    switch (layoutType) {
        case 'tree':
            return new TreeLayout(options)
        case 'org':
            return new OrgLayout(options)
        case 'fishbone':
            return new FishboneLayout(options)
        default:
            return new MindMapLayout(options)
    }
}

export function layoutMindMap(
    root: MindMapNode,
    layoutType: LayoutType,
    options: Partial<LayoutOptions>,
    connectionStyle: MindMapConnectionStyle = 'curve',
): MindMapLayoutResult {
    const instance = createTreeLayout(layoutType, options)
    const tree = instance.layout(root, 0, 0)
    const flat = instance.flatten(tree)

    // 坐标放到统一结果里（节点输入本身不带坐标）
    const positioned = flat.map((ln): GraphLayoutResult<MindMapGraphNode, MindMapGraphEdge>['nodes'][number] => ({
        node: { id: ln.id, width: ln.width, height: ln.height, node: ln.node },
        x: ln.x,
        y: ln.y,
        width: ln.width,
        height: ln.height,
    }))

    const edges: GraphLayoutResult<MindMapGraphNode, MindMapGraphEdge>['edges'] = []
    const traverse = (parent: LayoutNode) => {
        for (const child of parent.children) {
            edges.push({
                edge: { id: `${parent.id}-${child.id}`, from: parent.id, to: child.id, fromId: parent.id, toId: child.id },
                path: generateConnectionPath(
                    { x: parent.x, y: parent.y, width: parent.width },
                    { x: child.x, y: child.y, width: child.width },
                    connectionStyle,
                ),
                midX: (parent.x + child.x) / 2,
                midY: (parent.y + child.y) / 2,
            })
            traverse(child)
        }
    }
    traverse(tree)

    return { tree, flat, graph: { nodes: positioned, edges } }
}

export { routeHorizontalCurve }
