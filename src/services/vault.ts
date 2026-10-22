import type { MindMapDocument, MindMapNode, NodeData } from '@/types'
import { documentService } from './db'

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
    for (const key of ['note', 'hyperlink', 'image', 'imageWidth', 'imageAspectRatio', 'icon', 'code', 'table'] as const) {
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

/** 保存 doc 后执行：写穿本图引用 + 刷新他图快照。单跳，防循环。 */
export async function syncVaultReferences(doc: MindMapDocument): Promise<void> {
    if (syncing.has(doc.id)) return
    syncing.add(doc.id)
    try {
        await writeThrough(doc)
        await propagateToReferrers(doc)
    } catch (err) {
        console.warn('[vault] 引用同步失败（不影响本文档保存）', err)
    } finally {
        syncing.delete(doc.id)
    }
}

/** 写穿：本文档中引用节点的最新负载写回源文档 */
async function writeThrough(doc: MindMapDocument): Promise<void> {
    const refNodes = collectRefNodes(doc)
    if (refNodes.length === 0) return

    const dirtyDocs = new Map<string, MindMapDocument>()
    for (const { node } of refNodes) {
        const ref = refOf(node)!
        if (ref.docId === doc.id) {
            // 同文档引用：直接写回本文档内的源节点
            const source = findNodeIn(doc, ref.nodeId)
            if (source && copyPayload(node, source)) doc.updatedAt = Date.now()
            continue
        }
        const sourceDoc = dirtyDocs.get(ref.docId) ?? (await documentService.get(ref.docId))
        if (!sourceDoc) continue // 源文档已删除：快照保留，徽标显示断链
        const source = findNodeIn(sourceDoc, ref.nodeId)
        if (source && copyPayload(node, source)) {
            sourceDoc.updatedAt = Date.now()
            dirtyDocs.set(ref.docId, sourceDoc)
        }
    }
    for (const sourceDoc of dirtyDocs.values()) {
        await documentService.save(sourceDoc)
    }
}

/** 传播：其它文档中指向本文档节点的引用快照刷新并回存 */
async function propagateToReferrers(doc: MindMapDocument): Promise<void> {
    const others = (await documentService.getAll()).filter(d => d.id !== doc.id)
    for (const other of others) {
        let changed = false
        for (const { node } of collectRefNodes(other)) {
            const ref = refOf(node)!
            if (ref.docId !== doc.id) continue
            const source = findNodeIn(doc, ref.nodeId)
            if (!source) continue // 源节点已删除
            if (copyPayload(source, node)) {
                ref.docName = doc.name
                changed = true
            }
        }
        if (changed) {
            other.updatedAt = Date.now()
            await documentService.save(other) // syncing 守卫阻断级联
        }
    }
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
    const docs = await documentService.getAll()
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
    if (!doc) return false
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
    const sourceDoc = await documentService.get(ref.docId)
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
