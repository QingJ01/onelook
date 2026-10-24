import type { MindMapDocument, MindMapNode, NodeData } from '@/types'
import { isMindMapDocument } from '@/types'
import { documentService } from './db'
import { applyClusterState, computeClusterGroups } from './clusters'

/**
 * vault 引用（节点级共享镜像）
 *
 * 语义：引用节点 x'（data.ref 指向源 (docId, nodeId)）与源节点 x
 * 共享「负载」（text / data / style），双向同步；children/summary/
 * position 等结构信息各自本地，互不继承。
 *
 * 同步策略（挂在 documentService.save 上，单跳、防循环）：
 * - 写穿：保存 X 时，X 内引用节点的负载写回各自的源文档；
 * - 传播：保存 X 时，其它文档中指向 X 节点的引用快照被刷新并回存。
 * 引用节点自身保存负载快照，文档文件保持自包含（源被删后仍可读，
 * 徽标显示已断链）。
 */

export interface NodeRef {
    docId: string
    nodeId: string
    docName?: string
}

export interface Backlink {
    docId: string
    docName: string
    nodeId: string
    nodeText: string
}

// ---------- 引用判定与负载 ----------

export function refOf(node: MindMapNode): NodeRef | null {
    const ref = node.data?.ref
    if (!ref || !ref.docId || !ref.nodeId) return null
    return ref
}

export function isRefNode(node: MindMapNode): boolean {
    return refOf(node) !== null
}

/** 引用同步的负载字段：内容随源走，结构留在本地 */
function copyPayload(source: MindMapNode, target: MindMapNode): boolean {
    let changed = false
    if (source.text !== target.text) {
        target.text = source.text
        changed = true
    }
    const sourceData = source.data ?? {}
    const targetData = (target.data ?? {})
    for (const key of ['note', 'hyperlink', 'image', 'imageWidth', 'imageAspectRatio', 'icon', 'priority', 'progress', 'tags', 'code', 'table'] as const) {
        if (JSON.stringify(sourceData[key]) !== JSON.stringify(targetData[key])) {
            if (sourceData[key] === undefined) delete targetData[key]
            else targetData[key] = sourceData[key] as never
            changed = true
        }
    }
    if (target.data === undefined && Object.keys(targetData).length > 0) target.data = targetData
    if (source.style && JSON.stringify(source.style) !== JSON.stringify(target.style)) {
        target.style = JSON.parse(JSON.stringify(source.style))
        changed = true
    }
    return changed
}

// ---------- 同步钩子（由 db.ts 的 save 调用） ----------

const syncing = new Set<string>()

/** 保存 doc 后执行：cluster 内负载扇出（写穿 + 传播统一为一次） */
export async function syncVaultReferences(doc: MindMapDocument): Promise<void> {
    // 防御：流程图文档不参与绑定（调用方已按类型过滤）
    if (!isMindMapDocument(doc)) return
    if (syncing.has(doc.id)) return
    syncing.add(doc.id)
    try {
        const all = await documentService.getAll()
        const docs = all.filter(d => isMindMapDocument(d) && d.id !== doc.id) as MindMapDocument[]
        docs.push(doc) // 以刚保存的副本为准
        applyClusterState(docs)
        await fanOutClusters(docs, doc.id)
    } catch (err) {
        console.warn('[vault] 引用同步失败（不影响本文档保存）', err)
    } finally {
        syncing.delete(doc.id)
    }
}

/** 供 UI 启动/切换文档时刷新 cluster 着色 */
export async function refreshClusters(): Promise<void> {
    try {
        const docs = (await documentService.getAll()).filter(d => isMindMapDocument(d)) as MindMapDocument[]
        applyClusterState(docs)
    } catch (err) {
        console.warn('[vault] cluster 刷新失败', err)
    }
}

function nodeAt(docs: MindMapDocument[], key: string): MindMapNode | null {
    const sep = key.lastIndexOf(':')
    if (sep <= 0) return null
    const docId = key.slice(0, sep)
    const nodeId = key.slice(sep + 1)
    const doc = docs.find(d => d.id === docId)
    return doc ? findNodeIn(doc, nodeId) : null
}

function payloadSignature(node: MindMapNode): string {
    const data = node.data ?? {}
    return JSON.stringify([
        node.text,
        data.note, data.hyperlink, data.image, data.imageWidth, data.imageAspectRatio,
        data.icon, data.priority, data.progress, data.tags, data.code, data.table,
        node.style,
    ])
}

/**
 * 在作者的 cluster 内选权威节点：
 * - 作者文档内该分量只有 1 个成员 → 它；
 * - 多个成员（同文档自引用）→ 选「与其它成员不同」的那个（被编辑的一方）；
 *   都相同/都不同时优先非引用节点（原始源）。
 */
function pickAuthoritative(members: string[], authorDocId: string, docs: MindMapDocument[]): string | null {
    const inAuthor = members.filter(m => m.startsWith(`${authorDocId}:`))
    if (inAuthor.length === 0) return null
    if (inAuthor.length === 1) return inAuthor[0]

    const nodes = inAuthor.map(k => nodeAt(docs, k))
    const sigs = nodes.map(n => (n ? payloadSignature(n) : ''))
    for (let i = 0; i < nodes.length; i++) {
        if (!nodes[i]) continue
        const sameAsMe = sigs.filter((sig, j) => j !== i && sig === sigs[i]).length
        if (sameAsMe === 0 && new Set(sigs).size > 1) return inAuthor[i]
    }
    const nonRefIndex = nodes.findIndex(n => n && !n.data?.ref)
    return nonRefIndex >= 0 ? inAuthor[nonRefIndex] : inAuthor[0]
}

/** cluster 内扇出：作者成员为权威，其余成员（同/跨文档）全部刷新 */
async function fanOutClusters(docs: MindMapDocument[], authorDocId: string): Promise<void> {
    const groups = computeClusterGroups(docs)
    const dirty = new Set<string>()

    for (const members of groups.values()) {
        if (members.length < 2) continue
        const authorKey = pickAuthoritative(members, authorDocId, docs)
        if (!authorKey) continue
        const author = nodeAt(docs, authorKey)
        if (!author) continue

        for (const memberKey of members) {
            if (memberKey === authorKey) continue
            const target = nodeAt(docs, memberKey)
            if (!target) continue
            if (!copyPayload(author, target)) continue
            const sep = memberKey.lastIndexOf(':')
            dirty.add(memberKey.slice(0, sep))
        }
        // 断链成员保留快照即可（源节点不存在时 nodeAt 返回 null）
    }

    for (const docId of dirty) {
        const target = docs.find(d => d.id === docId)
        if (!target) continue
        target.updatedAt = Date.now()
        syncing.add(docId) // 阻断扇出级联
        try {
            await documentService.save(target)
        } finally {
            syncing.delete(docId)
        }
    }

    if (dirty.size > 0) applyClusterState(docs)
}

function collectRefNodes(doc: MindMapDocument): Array<{ node: MindMapNode }> {
    const result: Array<{ node: MindMapNode }> = []
    const walk = (node: MindMapNode) => {
        if (isRefNode(node)) result.push({ node })
        node.children.forEach(walk)
    }
    walk(doc.root)
    return result
}

function findNodeIn(doc: MindMapDocument, nodeId: string): MindMapNode | null {
    let found: MindMapNode | null = null
    const walk = (node: MindMapNode) => {
        if (found) return
        if (node.id === nodeId) {
            found = node
            return
        }
        node.children.forEach(walk)
    }
    walk(doc.root)
    return found
}

// ---------- 反向引用 ----------

export async function backlinksOf(docId: string, nodeId: string): Promise<Backlink[]> {
    const result: Backlink[] = []
    const docs = (await documentService.getAll()).filter(d => isMindMapDocument(d)) as MindMapDocument[]
    for (const doc of docs) {
        for (const { node } of collectRefNodes(doc)) {
            const ref = refOf(node)!
            if (ref.docId === docId && ref.nodeId === nodeId) {
                result.push({
                    docId: doc.id,
                    docName: doc.name,
                    nodeId: node.id,
                    nodeText: (node.text || '').split('\n')[0].slice(0, 40) || '（空）',
                })
            }
        }
    }
    return result
}

/** 源是否可达（用于徽标断链态判断） */
export async function refAlive(ref: NodeRef): Promise<boolean> {
    const doc = await documentService.get(ref.docId)
    if (!doc || !isMindMapDocument(doc)) return false
    return findNodeIn(doc, ref.nodeId) !== null
}

// ---------- 引用剪贴板（跨会话留存） ----------

const REF_CLIPBOARD_KEY = 'onelook:last-node-ref'

export function copyNodeRef(doc: MindMapDocument, node: MindMapNode): NodeRef {
    const ref: NodeRef = { docId: doc.id, nodeId: node.id, docName: doc.name }
    localStorage.setItem(REF_CLIPBOARD_KEY, JSON.stringify(ref))
    return ref
}

export function pasteNodeRef(): NodeRef | null {
    try {
        const raw = localStorage.getItem(REF_CLIPBOARD_KEY)
        if (!raw) return null
        const ref = JSON.parse(raw) as NodeRef
        if (!ref?.docId || !ref?.nodeId) return null
        return ref
    } catch {
        return null
    }
}

/** 创建引用节点（负载快照取自源；children 由调用方/用户本地添加） */
export async function createRefNode(
    ref: NodeRef,
    parentId: string,
): Promise<{ node: MindMapNode; alive: boolean } | null> {
    const loaded = await documentService.get(ref.docId)
    const sourceDoc = loaded && isMindMapDocument(loaded) ? loaded : null
    const source = sourceDoc ? findNodeIn(sourceDoc, ref.nodeId) : null
    const data: NodeData = {
        ref: { ...ref, docName: sourceDoc?.name ?? ref.docName ?? '未知导图' },
    }
    // 源负载快照（断链时为空文本占位）
    if (source?.data?.table) data.table = JSON.parse(JSON.stringify(source.data.table))
    if (source?.data?.code) data.code = { ...source.data.code }
    const node: MindMapNode = {
        id: crypto.randomUUID(),
        text: source?.text ?? '（源节点不存在）',
        parentId,
        children: [],
        isExpanded: true,
        data,
        style: source?.style ? JSON.parse(JSON.stringify(source.style)) : undefined,
    }
    return { node, alive: source !== null }
}
