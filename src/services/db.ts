import Dexie, { type Table } from 'dexie'
import type { MindMapDocument } from '@/types'
import { tripleVol } from './tripleVol'
import { syncVaultReferences } from './vault'

/**
 * OneLook 数据库（浏览器本地后端）
 */
class OneLookDB extends Dexie {
    documents!: Table<MindMapDocument, string>

    constructor() {
        super('OneLookDB')

        this.version(1).stores({
            documents: 'id, name, updatedAt',
        })
    }
}

export const db = new OneLookDB()

/**
 * triple 卷后端激活探测：宿主（如 Triple.app）声明了 org.star.vol 时启用，
 * 文档以 .olook 文件写入宿主卷目录；否则维持 IndexedDB。失败静默回落。
 */
let backendReady: Promise<void> | null = null

async function useVol(): Promise<boolean> {
    if (!backendReady) {
        backendReady = (async () => {
            if (await tripleVol.probe()) {
                await migrateFromDexie()
            }
        })()
    }
    await backendReady
    return tripleVol.active
}

/** 卷首次激活时把 IndexedDB 里的文档搬进卷（原库保留作备份） */
async function migrateFromDexie(): Promise<void> {
    try {
        const local = await db.documents.toArray()
        if (local.length === 0) return
        const index = await tripleVol.index()
        let moved = 0
        for (const doc of local) {
            if (!index.byId.has(doc.id)) {
                await tripleVol.write(doc)
                index.byId.set(doc.id, doc)
                moved += 1
            }
        }
        if (moved > 0) {
            console.info(`[onelook] triple 卷已激活，迁移 ${moved} 篇本地文档（IndexedDB 原样保留）`)
        }
    } catch (err) {
        console.warn('[onelook] triple 卷迁移失败，本地文档不受影响', err)
    }
}

/**
 * 文档存储服务
 */
export const documentService = {
    /**
     * 保存文档
     */
    async save(doc: MindMapDocument): Promise<void> {
        doc.updatedAt = Date.now()
        try {
            if (await useVol()) {
                await tripleVol.write(doc)
            } else {
                await db.documents.put(doc)
            }
        } catch (err) {
            console.error('[onelook] 保存失败', err)
            await db.documents.put(doc)
        }
        // vault 引用同步：写穿本图引用负载 + 刷新他图快照（内部防循环）
        await syncVaultReferences(doc)
    },

    /**
     * 获取文档
     */
    async get(id: string): Promise<MindMapDocument | undefined> {
        try {
            if (await useVol()) {
                const doc = await tripleVol.get(id)
                if (doc) return doc
            }
        } catch (err) {
            console.error('[onelook] 卷读取失败，回落 IndexedDB', err)
        }
        return await db.documents.get(id)
    },

    /**
     * 获取所有文档
     */
    async getAll(): Promise<MindMapDocument[]> {
        try {
            if (await useVol()) {
                return await tripleVol.getAll()
            }
        } catch (err) {
            console.error('[onelook] 卷列表失败，回落 IndexedDB', err)
        }
        return await db.documents.orderBy('updatedAt').reverse().toArray()
    },

    /**
     * 删除文档
     */
    async delete(id: string): Promise<void> {
        try {
            if (await useVol()) {
                await tripleVol.delete(id)
                return
            }
        } catch (err) {
            console.error('[onelook] 卷删除失败，回落 IndexedDB', err)
        }
        await db.documents.delete(id)
    },

    /**
     * 获取最近的文档
     */
    async getRecent(limit = 10): Promise<MindMapDocument[]> {
        const all = await this.getAll()
        return all.slice(0, limit)
    },

    /**
     * 导出为 JSON
     */
    exportToJSON(doc: MindMapDocument): string {
        return JSON.stringify(doc, null, 2)
    },

    /**
     * 从 JSON 导入
     */
    importFromJSON(json: string): MindMapDocument {
        return JSON.parse(json)
    },
}
