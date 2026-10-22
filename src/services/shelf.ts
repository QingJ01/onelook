import { reactive } from 'vue'

/**
 * 节点缓存栏（shelf）
 *
 * 批量建立 vault 引用的工作流：布局模式按 y 把节点（可跨导图）收集进
 * 左侧缓存栏，之后选中目标节点依次按 p —— 引用即“实时更新的复制”。
 * 活跃项制：p 消费后自动前进到下一项，支持依次建链。
 */

export interface ShelfItem {
    id: string
    docId: string
    nodeId: string
    docName: string
    text: string
}

const STORAGE_KEY = 'onelook:shelf'

function load(): { items: ShelfItem[]; activeIndex: number; visible: boolean } {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { items: [], activeIndex: 0, visible: true }
        const parsed = JSON.parse(raw)
        return {
            items: Array.isArray(parsed.items) ? parsed.items : [],
            activeIndex: Number.isFinite(parsed.activeIndex) ? parsed.activeIndex : 0,
            visible: parsed.visible !== false,
        }
    } catch {
        return { items: [], activeIndex: 0, visible: true }
    }
}

export const shelf = reactive(load())

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        items: shelf.items,
        activeIndex: shelf.activeIndex,
        visible: shelf.visible,
    }))
}

export function addToShelf(docId: string, nodeId: string, docName: string, text: string): ShelfItem {
    // 去重：同一节点不重复入栏
    const existing = shelf.items.find(i => i.docId === docId && i.nodeId === nodeId)
    if (existing) {
        shelf.activeIndex = shelf.items.indexOf(existing)
        persist()
        return existing
    }
    const item: ShelfItem = {
        id: crypto.randomUUID(),
        docId,
        nodeId,
        docName,
        text: (text || '').split('\n')[0].slice(0, 60) || '（空节点）',
    }
    shelf.items.push(item)
    shelf.activeIndex = shelf.items.length - 1
    persist()
    return item
}

export function removeFromShelf(index: number) {
    shelf.items.splice(index, 1)
    if (shelf.activeIndex >= shelf.items.length) {
        shelf.activeIndex = Math.max(0, shelf.items.length - 1)
    }
    persist()
}

export function clearShelf() {
    shelf.items = []
    shelf.activeIndex = 0
    persist()
}

export function setActive(index: number) {
    if (index >= 0 && index < shelf.items.length) {
        shelf.activeIndex = index
        persist()
    }
}

export function activeShelfItem(): ShelfItem | null {
    return shelf.items[shelf.activeIndex] ?? null
}

/** p 消费后前进：依次建立引用的队列语义 */
export function advanceShelf() {
    if (shelf.items.length === 0) return
    shelf.activeIndex = Math.min(shelf.activeIndex + 1, shelf.items.length - 1)
    persist()
}

export function toggleShelf() {
    shelf.visible = !shelf.visible
    persist()
}
