import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { FlowDocument, FlowEdge, FlowNode, FlowNodeKind } from '@/types'
import { documentService } from '@/services/db'

/**
 * 流程图 store
 *
 * 与 mapStore（导图）完全独立：不同的文档模型、不同的布局器、
 * 不同的交互集合。两者不共享节点、不互相转换、不参与绑定。
 */

const DEFAULT_TEXT: Record<FlowNodeKind, string> = {
    start: '开始',
    end: '结束',
    process: '处理',
    decision: '判断？',
    io: '输入/输出',
    note: '说明',
}

export function createFlowDocument(name: string): FlowDocument {
    const start: FlowNode = { id: uuidv4(), kind: 'start', text: '开始' }
    const end: FlowNode = { id: uuidv4(), kind: 'end', text: '结束' }
    const edge: FlowEdge = { id: uuidv4(), from: start.id, to: end.id }
    return {
        id: uuidv4(),
        type: 'flowchart',
        name,
        nodes: [start, end],
        edges: [edge],
        theme: 'light',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '0.1.0',
    }
}

export const useFlowStore = defineStore('flow', () => {
    const document = ref<FlowDocument | null>(null)
    const selectedNodeId = ref<string | null>(null)
    const selectedEdgeId = ref<string | null>(null)

    const past: string[] = []
    const future: string[] = []

    const canUndo = computed(() => past.length > 0)
    const canRedo = computed(() => future.length > 0)
    const nodeById = (id: string) => document.value?.nodes.find(n => n.id === id) ?? null
    const selectedNode = computed(() => (selectedNodeId.value ? nodeById(selectedNodeId.value) : null))

    function snapshot() {
        if (!document.value) return
        past.push(JSON.stringify(document.value))
        if (past.length > 100) past.shift()
        future.length = 0
    }

    function restore(json: string) {
        document.value = JSON.parse(json)
    }

    function undo() {
        const prev = past.pop()
        if (!prev || !document.value) return
        future.push(JSON.stringify(document.value))
        restore(prev)
    }

    function redo() {
        const next = future.pop()
        if (!next || !document.value) return
        past.push(JSON.stringify(document.value))
        restore(next)
    }

    function newDocument(name: string) {
        document.value = createFlowDocument(name)
        selectedNodeId.value = null
        selectedEdgeId.value = null
        past.length = 0
        future.length = 0
    }

    function loadDocument(doc: FlowDocument) {
        document.value = JSON.parse(JSON.stringify(doc))
        selectedNodeId.value = null
        selectedEdgeId.value = null
        past.length = 0
        future.length = 0
    }

    function addNode(kind: FlowNodeKind, position?: { x: number; y: number }): FlowNode | null {
        if (!document.value) return null
        snapshot()
        const node: FlowNode = {
            id: uuidv4(),
            kind,
            text: DEFAULT_TEXT[kind],
            ...(position ? { position } : {}),
        }
        document.value.nodes.push(node)
        document.value.updatedAt = Date.now()
        selectNode(node.id)
        return node
    }

    function updateNodeText(id: string, text: string) {
        const node = nodeById(id)
        if (!node || !document.value) return
        snapshot()
        node.text = text
        document.value.updatedAt = Date.now()
    }

    function updateNodeKind(id: string, kind: FlowNodeKind) {
        const node = nodeById(id)
        if (!node || !document.value) return
        snapshot()
        node.kind = kind
        document.value.updatedAt = Date.now()
    }

    function moveNode(id: string, x: number, y: number) {
        const node = nodeById(id)
        if (!node || !document.value) return
        node.position = { x, y }
        document.value.updatedAt = Date.now()
    }

    function connect(from: string, to: string): boolean {
        if (!document.value || from === to) return false
        if (!nodeById(from) || !nodeById(to)) return false
        const exists = document.value.edges.some(e => e.from === from && e.to === to)
        if (exists) return false
        snapshot()
        document.value.edges.push({ id: uuidv4(), from, to })
        document.value.updatedAt = Date.now()
        return true
    }

    function deleteEdge(id: string) {
        if (!document.value) return
        const index = document.value.edges.findIndex(e => e.id === id)
        if (index < 0) return
        snapshot()
        document.value.edges.splice(index, 1)
        if (selectedEdgeId.value === id) selectedEdgeId.value = null
        document.value.updatedAt = Date.now()
    }

    function deleteNode(id: string) {
        if (!document.value) return
        const index = document.value.nodes.findIndex(n => n.id === id)
        if (index < 0) return
        snapshot()
        document.value.nodes.splice(index, 1)
        document.value.edges = document.value.edges.filter(e => e.from !== id && e.to !== id)
        if (selectedNodeId.value === id) selectedNodeId.value = null
        document.value.updatedAt = Date.now()
    }

    function selectNode(id: string | null) {
        selectedNodeId.value = id
        if (id) selectedEdgeId.value = null
    }

    function selectEdge(id: string | null) {
        selectedEdgeId.value = id
        if (id) selectedNodeId.value = null
    }

    function deleteSelection() {
        if (selectedNodeId.value) deleteNode(selectedNodeId.value)
        else if (selectedEdgeId.value) deleteEdge(selectedEdgeId.value)
    }

    async function save(): Promise<void> {
        if (!document.value) return
        document.value.updatedAt = Date.now()
        await documentService.save(JSON.parse(JSON.stringify(document.value)))
    }

    return {
        document,
        selectedNodeId,
        selectedEdgeId,
        selectedNode,
        canUndo,
        canRedo,
        nodeById,
        newDocument,
        loadDocument,
        addNode,
        updateNodeText,
        updateNodeKind,
        moveNode,
        connect,
        deleteNode,
        deleteEdge,
        selectNode,
        selectEdge,
        deleteSelection,
        undo,
        redo,
        save,
    }
})
