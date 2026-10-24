import { reactive } from 'vue'
import type { MindMapDocument, MindMapNode } from '@/types'

/**
 * 引用集群（cluster）
 *
 * 引用关系按无向边处理：节点 x' 的 data.ref 指向 (docId, nodeId) 后，
 * x' 与源节点 x 属于同一 cluster；引用可链式叠加（x''→x'→x），整个
 * 连通分量是一个逻辑 cluster——成员之间的负载全部双向同步。
 *
 * 存储仍是单向的（只有引用节点记录 ref），cluster 是派生结构：
 * 每次文档变化时对全部文档做一次并查集，按分量给成员分配颜色。
 */

export const CLUSTER_PALETTE = [
    '#2563eb', // blue
    '#059669', // emerald
    '#d97706', // amber
    '#7c3aed', // violet
    '#db2777', // pink
    '#0891b2', // cyan
    '#65a30d', // lime
    '#dc2626', // red
    '#4f46e5', // indigo
    '#0d9488', // teal
]

export const clusterState = reactive<{
    colors: Record<string, string>
    sizes: Record<string, number>
}>({
    colors: {},
    sizes: {},
})

export function clusterKey(docId: string, nodeId: string): string {
    return `${docId}:${nodeId}`
}

export function clusterColor(docId: string, nodeId: string): string | undefined {
    return clusterState.colors[clusterKey(docId, nodeId)]
}

export function clusterSize(docId: string, nodeId: string): number {
    return clusterState.sizes[clusterKey(docId, nodeId)] ?? 0
}

function hashString(input: string): number {
    let h = 5381
    for (let i = 0; i < input.length; i++) {
        h = ((h << 5) + h + input.charCodeAt(i)) | 0
    }
    return Math.abs(h)
}

/** 连通分量：root（字典序最小成员 key）→ 成员 key 列表 */
export function computeClusterGroups(docs: MindMapDocument[]): Map<string, string[]> {
    const parent = new Map<string, string>()

    const ensure = (key: string) => {
        if (!parent.has(key)) parent.set(key, key)
    }
    const find = (key: string): string => {
        let root = key
        while (parent.get(root) !== root) {
            root = parent.get(root) as string
        }
        let cursor = key
        while (parent.get(cursor) !== root) {
            const next = parent.get(cursor) as string
            parent.set(cursor, root)
            cursor = next
        }
        return root
    }
    const union = (a: string, b: string) => {
        const ra = find(a)
        const rb = find(b)
        if (ra === rb) return
        // 以字典序较小者为根：分量 id 与遍历顺序无关
        if (ra < rb) parent.set(rb, ra)
        else parent.set(ra, rb)
    }

    for (const doc of docs) {
        const walk = (node: MindMapNode) => {
            const key = clusterKey(doc.id, node.id)
            ensure(key)
            const ref = node.data?.ref
            if (ref?.docId && ref?.nodeId) {
                ensure(clusterKey(ref.docId, ref.nodeId))
                union(key, clusterKey(ref.docId, ref.nodeId))
            }
            node.children.forEach(walk)
        }
        walk(doc.root)
    }

    const groups = new Map<string, string[]>()
    for (const key of parent.keys()) {
        const root = find(key)
        const list = groups.get(root)
        if (list) list.push(key)
        else groups.set(root, [key])
    }
    return groups
}

/** 由文档集合刷新颜色/规模（成员数 <2 的分量不算 cluster） */
export function applyClusterState(docs: MindMapDocument[]): void {
    const groups = computeClusterGroups(docs)
    const colors: Record<string, string> = {}
    const sizes: Record<string, number> = {}

    for (const [root, members] of groups) {
        if (members.length < 2) continue
        const color = CLUSTER_PALETTE[hashString(root) % CLUSTER_PALETTE.length]
        for (const member of members) {
            colors[member] = color
            sizes[member] = members.length
        }
    }

    clusterState.colors = colors
    clusterState.sizes = sizes
}
