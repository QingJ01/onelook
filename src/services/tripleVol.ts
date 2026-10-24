import type { AnyDocument } from '@/types'

/**
 * triple 卷存储后端
 *
 * 当 UI 运行在 triple UI host（如 Triple.app）里且镜像声明了 org.star.vol 时，
 * 宿主会在同源暴露 /star/v1 文件 API，文档以 .olook 文件落在宿主侧卷目录
 * （~/.star/vols/<name>/）。探测失败则一切照旧（Dexie/IndexedDB）。
 */

const API_BASE = '/star/v1'
const PROBE_TIMEOUT_MS = 600

interface OLookFile {
    version: string
    app: string
    created: number
    modified: number
    document: AnyDocument
}

interface VolIndex {
    byId: Map<string, AnyDocument>
}

let active = false
let probing: Promise<boolean> | null = null
let indexPromise: Promise<VolIndex> | null = null

export const tripleVol = {
    get active(): boolean {
        return active
    },

    /** 探测宿主 vol API；结果缓存，永不抛错 */
    probe(): Promise<boolean> {
        if (probing) return probing
        probing = (async () => {
            try {
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
                const res = await fetch(`${API_BASE}/config`, { signal: controller.signal })
                clearTimeout(timer)
                if (!res.ok) return false
                const config = await res.json()
                active = config?.ok === true && typeof config.vol === 'string' && config.vol.length > 0
                return active
            } catch {
                return false
            }
        })()
        return probing
    },

    async list(): Promise<string[]> {
        const res = await fetch(`${API_BASE}/maps`)
        if (!res.ok) throw new Error(`vol list failed: ${res.status}`)
        const data = await res.json()
        return Array.isArray(data.maps) ? data.maps.map((m: { file: string }) => m.file) : []
    },

    async read(file: string): Promise<AnyDocument> {
        const res = await fetch(`${API_BASE}/maps/${encodeURIComponent(file)}`)
        if (!res.ok) throw new Error(`vol read failed: ${file} (${res.status})`)
        const wrapper: OLookFile = await res.json()
        if (wrapper.app !== 'OneLook' || !wrapper.document) {
            throw new Error(`无效的 OneLook 文件: ${file}`)
        }
        return wrapper.document
    },

    async write(doc: AnyDocument): Promise<string> {
        const file = filenameFor(doc)
        const wrapper: OLookFile = {
            version: '1.0.0',
            app: 'OneLook',
            created: doc.createdAt,
            modified: Date.now(),
            document: doc,
        }
        const res = await fetch(`${API_BASE}/maps/${encodeURIComponent(file)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(wrapper, null, 2),
        })
        if (!res.ok) throw new Error(`vol write failed: ${res.status}`)

        if (indexPromise) {
            // 增量维护索引：改名时移除旧文件
            const index = await indexPromise
            for (const [id, existing] of index.byId) {
                if (id === doc.id && filenameFor(existing) !== file) {
                    await this.removeFile(filenameFor(existing))
                }
            }
            index.byId.set(doc.id, doc)
        }
        return file
    },

    async removeFile(file: string): Promise<void> {
        const res = await fetch(`${API_BASE}/maps/${encodeURIComponent(file)}`, { method: 'DELETE' })
        if (!res.ok && res.status !== 404) throw new Error(`vol delete failed: ${res.status}`)
    },

    /** 全量读卷建索引（doc.id → document）；卷内文件数量级小，首访一次 */
    async index(): Promise<VolIndex> {
        if (!indexPromise) {
            indexPromise = (async () => {
                const byId = new Map<string, AnyDocument>()
                const files = await this.list()
                await Promise.all(files.map(async file => {
                    try {
                        const doc = await this.read(file)
                        byId.set(doc.id, doc)
                    } catch (err) {
                        console.warn(`[tripleVol] 跳过无法解析的文件: ${file}`, err)
                    }
                }))
                return { byId }
            })()
        }
        return indexPromise
    },

    async get(id: string): Promise<AnyDocument | undefined> {
        const index = await this.index()
        const doc = index.byId.get(id)
        if (doc) return doc
        // 索引可能过期（用户在外部放了新文件），刷新一次再查
        indexPromise = null
        return (await this.index()).byId.get(id)
    },

    async getAll(): Promise<AnyDocument[]> {
        const docs = Array.from((await this.index()).byId.values())
        return docs.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    },

    async delete(id: string): Promise<void> {
        const index = await this.index()
        const doc = index.byId.get(id)
        if (!doc) return
        await this.removeFile(filenameFor(doc))
        index.byId.delete(id)
    },
}

function slug(name: string): string {
    const cleaned = (name || '')
        .trim()
        .replace(/[^\p{L}\p{N}_-]+/gu, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40)
    return cleaned || 'map'
}

function filenameFor(doc: AnyDocument): string {
    const id8 = (doc.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'doc'
    return `${slug(doc.name)}-${id8}.olook`
}
