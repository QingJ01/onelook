import Dexie, { type Table } from 'dexie'
import type { MindMapDocument } from '@/types'

/**
 * OneLook 数据库
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
 * 文档存储服务
 */
export const documentService = {
    /**
     * 保存文档
     */
    async save(doc: MindMapDocument): Promise<void> {
        doc.updatedAt = Date.now()
        await db.documents.put(doc)
    },

    /**
     * 获取文档
     */
    async get(id: string): Promise<MindMapDocument | undefined> {
        return await db.documents.get(id)
    },

    /**
     * 获取所有文档
     */
    async getAll(): Promise<MindMapDocument[]> {
        return await db.documents.orderBy('updatedAt').reverse().toArray()
    },

    /**
     * 删除文档
     */
    async delete(id: string): Promise<void> {
        await db.documents.delete(id)
    },

    /**
     * 获取最近的文档
     */
    async getRecent(limit = 10): Promise<MindMapDocument[]> {
        return await db.documents.orderBy('updatedAt').reverse().limit(limit).toArray()
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
