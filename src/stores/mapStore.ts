import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MindMapNode, MindMapDocument, LayoutType, ThemeType, NodeData, NodeStyle } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { history } from '@/composables/useHistory'

function createNode(text: string, parentId?: string): MindMapNode {
    return {
        id: uuidv4(),
        text,
        parentId,
        children: [],
        isExpanded: true,
    }
}

function createDefaultDocument(customName?: string): MindMapDocument {
    const root = createNode('中心主题')
    root.children = [
        createNode('分支主题 1', root.id),
        createNode('分支主题 2', root.id),
        createNode('分支主题 3', root.id),
    ]

    return {
        id: uuidv4(),
        name: customName || `未命名导图 ${docCounter++}`,
        root,
        layout: 'mind',
        theme: 'light',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '0.1.0',
    }
}

let docCounter = 1

function findNextAvailableName(existingNames: string[]): string {
    const usedNumbers = new Set<number>()
    const pattern = /^未命名导图 (\d+)$/

    for (const name of existingNames) {
        const match = name.match(pattern)
        if (match) {
            usedNumbers.add(parseInt(match[1], 10))
        }
    }

    let num = 1
    while (usedNumbers.has(num)) {
        num++
    }

    return `未命名导图 ${num}`
}

type ZenLevel = 'lite' | 'deep'
type ZenFocusMode = 'branch' | 'path' | 'highlight'

export const useMapStore = defineStore('map', () => {
    const document = ref<MindMapDocument>(createDefaultDocument())

    const selectedIds = ref<string[]>([])

    const focusedId = ref<string | undefined>(undefined)

    const zoom = ref(100)
    const panX = ref(0)
    const panY = ref(0)

    const clipboard = ref<MindMapNode | null>(null)
    const zenMode = ref(false)
    const zenLevel = ref<ZenLevel>('lite')
    const zenFocusMode = ref<ZenFocusMode>('branch')

    let isApplyingHistory = false

    const fileName = computed(() => document.value.name)
    const layout = computed(() => document.value.layout)
    const theme = computed(() => document.value.theme)

    const nodeCount = computed(() => {
        let count = 0
        const traverse = (node: MindMapNode) => {
            count++
            node.children.forEach(traverse)
        }
        traverse(document.value.root)
        return count
    })

    const canUndo = computed(() => history.canUndo())
    const canRedo = computed(() => history.canRedo())

    function findNode(id: string, node: MindMapNode = document.value.root): MindMapNode | null {
        if (node.id === id) return node
        for (const child of node.children) {
            const found = findNode(id, child)
            if (found) return found
        }
        return null
    }

    function findNodeWithParent(id: string, node: MindMapNode = document.value.root, parent: MindMapNode | null = null): { node: MindMapNode; parent: MindMapNode | null } | null {
        if (node.id === id) return { node, parent }
        for (const child of node.children) {
            const found = findNodeWithParent(id, child, node)
            if (found) return found
        }
        return null
    }

    function selectNode(id: string, append = false) {
        if (append) {
            const index = selectedIds.value.indexOf(id)
            if (index === -1) {
                selectedIds.value.push(id)
            } else {
                selectedIds.value.splice(index, 1)
            }
        } else {
            selectedIds.value = [id]
        }
        focusedId.value = id
    }

    function clearSelection() {
        selectedIds.value = []
        focusedId.value = undefined
    }

    function recordHistory() {
        if (!isApplyingHistory) {
            history.record(JSON.parse(JSON.stringify(document.value)))
        }
    }

    function addChild(parentId: string, text = '新节点') {
        const parent = findNode(parentId)
        if (parent) {
            recordHistory()
            const newNode = createNode(text, parentId)
            parent.children.push(newNode)
            parent.isExpanded = true
            document.value.updatedAt = Date.now()
            selectNode(newNode.id)
            return newNode
        }
        return null
    }

    function addSibling(nodeId: string, text = '新节点') {
        const node = findNode(nodeId)
        if (!node) return null

        if (!node.parentId) {
            return addChild(nodeId, text)
        }

        const parent = findNode(node.parentId)
        if (parent) {
            recordHistory()
            const index = parent.children.findIndex(c => c.id === nodeId)
            const newNode = createNode(text, node.parentId)
            parent.children.splice(index + 1, 0, newNode)
            document.value.updatedAt = Date.now()
            selectNode(newNode.id)
            return newNode
        }
        return null
    }

    function deleteNode(nodeId: string) {
        const node = findNode(nodeId)
        if (node && node.parentId) {
            const parent = findNode(node.parentId)
            if (parent) {
                recordHistory()
                const index = parent.children.findIndex(c => c.id === nodeId)
                if (index !== -1) {
                    parent.children.splice(index, 1)
                    document.value.updatedAt = Date.now()
                    if (parent.children.length > 0) {
                        const nextIndex = Math.min(index, parent.children.length - 1)
                        selectNode(parent.children[nextIndex].id)
                    } else {
                        selectNode(parent.id)
                    }
                }
            }
        }
    }

    function deleteSelectedNodes() {
        if (selectedIds.value.length === 0) return

        recordHistory()

        const nodesToDelete = selectedIds.value
            .filter(id => {
                const node = findNode(id)
                return node && node.parentId
            })
            .sort((a, b) => {
                const depthA = getNodeDepth(a)
                const depthB = getNodeDepth(b)
                return depthB - depthA
            })

        for (const nodeId of nodesToDelete) {
            const node = findNode(nodeId)
            if (node && node.parentId) {
                const parent = findNode(node.parentId)
                if (parent) {
                    const index = parent.children.findIndex(c => c.id === nodeId)
                    if (index !== -1) {
                        parent.children.splice(index, 1)
                    }
                }
            }
        }

        document.value.updatedAt = Date.now()
        clearSelection()
        selectNode(document.value.root.id)
    }

    function getNodeDepth(nodeId: string): number {
        let depth = 0
        let node = findNode(nodeId)
        while (node && node.parentId) {
            depth++
            node = findNode(node.parentId)
        }
        return depth
    }

    function updateNodeText(nodeId: string, text: string) {
        const node = findNode(nodeId)
        if (node && node.text !== text) {
            recordHistory()
            node.text = text
            document.value.updatedAt = Date.now()
        }
    }

    function updateNodeData(nodeId: string, data: Partial<NodeData>) {
        const node = findNode(nodeId)
        if (node) {
            recordHistory()
            if (!node.data) {
                node.data = {}
            }
            Object.assign(node.data, data)
            Object.keys(node.data).forEach(key => {
                if ((node.data as any)[key] === undefined) {
                    delete (node.data as any)[key]
                }
            })
            document.value.updatedAt = Date.now()
        }
    }

    function updateNodeStyle(nodeId: string, style: Partial<NodeStyle>) {
        const node = findNode(nodeId)
        if (node) {
            recordHistory()
            if (!node.style) {
                node.style = {}
            }
            Object.assign(node.style, style)
            Object.keys(node.style).forEach(key => {
                if ((node.style as any)[key] === undefined) {
                    delete (node.style as any)[key]
                }
            })
            document.value.updatedAt = Date.now()
        }
    }

    function updateNodePosition(nodeId: string, x: number, y: number) {
        const node = findNode(nodeId)
        if (node) {
            recordHistory()
            node.position = { x, y }
            document.value.updatedAt = Date.now()
        }
    }

    function setSummary(nodeId: string, text: string, startIndex: number, endIndex: number) {
        const node = findNode(nodeId)
        if (node && node.children.length > 0) {
            recordHistory()
            node.summary = {
                text,
                startIndex: Math.max(0, startIndex),
                endIndex: Math.min(node.children.length - 1, endIndex)
            }
            document.value.updatedAt = Date.now()
        }
    }

    function removeSummary(nodeId: string) {
        const node = findNode(nodeId)
        if (node && node.summary) {
            recordHistory()
            delete node.summary
            document.value.updatedAt = Date.now()
        }
    }

    function moveNode(nodeId: string, newParentId: string, insertIndex?: number) {
        const node = findNode(nodeId)
        if (!node || !node.parentId) return false

        let checkNode: MindMapNode | null = findNode(newParentId)
        while (checkNode) {
            if (checkNode.id === nodeId) return false
            checkNode = checkNode.parentId ? findNode(checkNode.parentId) : null
        }

        const oldParent = findNode(node.parentId)
        const newParent = findNode(newParentId)
        if (!oldParent || !newParent) return false

        recordHistory()
        if (node.position) {
            delete node.position
        }

        const oldIndex = oldParent.children.findIndex(c => c.id === nodeId)
        if (oldIndex !== -1) {
            oldParent.children.splice(oldIndex, 1)
        }

        node.parentId = newParentId
        if (insertIndex !== undefined && insertIndex >= 0) {
            newParent.children.splice(insertIndex, 0, node)
        } else {
            newParent.children.push(node)
        }

        newParent.isExpanded = true
        document.value.updatedAt = Date.now()
        return true
    }

    function reorderNode(nodeId: string, newIndex: number) {
        const node = findNode(nodeId)
        if (!node || !node.parentId) return false

        const parent = findNode(node.parentId)
        if (!parent) return false

        const currentIndex = parent.children.findIndex(c => c.id === nodeId)
        if (currentIndex === -1 || currentIndex === newIndex) return false

        recordHistory()
        if (node.position) {
            delete node.position
        }

        parent.children.splice(currentIndex, 1)
        parent.children.splice(newIndex, 0, node)

        document.value.updatedAt = Date.now()
        return true
    }

    function toggleExpand(nodeId: string) {
        const node = findNode(nodeId)
        if (node && node.children.length > 0) {
            recordHistory()
            node.isExpanded = !node.isExpanded
            document.value.updatedAt = Date.now()
        }
    }

    function undo() {
        const prev = history.undo()
        if (prev) {
            isApplyingHistory = true
            document.value = prev
            clearSelection()
            isApplyingHistory = false
        }
    }

    function redo() {
        const next = history.redo()
        if (next) {
            isApplyingHistory = true
            document.value = next
            clearSelection()
            isApplyingHistory = false
        }
    }

    function copyNode(nodeId: string) {
        const node = findNode(nodeId)
        if (node) {
            clipboard.value = JSON.parse(JSON.stringify(node))
        }
    }

    function pasteNode(parentId: string) {
        if (!clipboard.value) return null

        const parent = findNode(parentId)
        if (!parent) return null

        recordHistory()

        function cloneWithNewIds(node: MindMapNode, newParentId: string): MindMapNode {
            const newNode: MindMapNode = {
                ...node,
                id: uuidv4(),
                parentId: newParentId,
                children: [],
            }
            newNode.children = node.children.map(child => cloneWithNewIds(child, newNode.id))
            return newNode
        }

        const newNode = cloneWithNewIds(clipboard.value, parentId)
        parent.children.push(newNode)
        parent.isExpanded = true
        document.value.updatedAt = Date.now()
        selectNode(newNode.id)

        return newNode
    }

    function navigateToParent() {
        if (!focusedId.value) return
        const node = findNode(focusedId.value)
        if (node?.parentId) {
            selectNode(node.parentId)
        }
    }

    function navigateToChild() {
        if (!focusedId.value) return
        const node = findNode(focusedId.value)
        if (node && node.children.length > 0 && node.isExpanded) {
            selectNode(node.children[0].id)
        }
    }

    function navigateToPrevSibling() {
        if (!focusedId.value) return
        const result = findNodeWithParent(focusedId.value)
        if (result?.parent) {
            const index = result.parent.children.findIndex(c => c.id === focusedId.value)
            if (index > 0) {
                selectNode(result.parent.children[index - 1].id)
            }
        }
    }

    function navigateToNextSibling() {
        if (!focusedId.value) return
        const result = findNodeWithParent(focusedId.value)
        if (result?.parent) {
            const index = result.parent.children.findIndex(c => c.id === focusedId.value)
            if (index < result.parent.children.length - 1) {
                selectNode(result.parent.children[index + 1].id)
            }
        }
    }

    function setZoom(value: number) {
        zoom.value = Math.max(25, Math.min(400, value))
    }

    function setLayout(value: LayoutType) {
        document.value.layout = value
        document.value.updatedAt = Date.now()
    }

    function setTheme(value: ThemeType) {
        document.value.theme = value
        document.value.updatedAt = Date.now()
    }

    function setZenMode(value: boolean) {
        zenMode.value = value
    }

    function toggleZenMode() {
        setZenMode(!zenMode.value)
    }

    function setZenLevel(value: ZenLevel) {
        zenLevel.value = value
    }

    function cycleZenLevel() {
        zenLevel.value = zenLevel.value === 'lite' ? 'deep' : 'lite'
    }

    function setZenFocusMode(value: ZenFocusMode) {
        zenFocusMode.value = value
    }

    function cycleZenFocusMode() {
        const modes: ZenFocusMode[] = ['branch', 'path', 'highlight']
        const currentIndex = modes.indexOf(zenFocusMode.value)
        zenFocusMode.value = modes[(currentIndex + 1) % modes.length]
    }

    function newDocument(customName?: string) {
        document.value = createDefaultDocument(customName)
        clearSelection()
        history.clear()
        history.record(JSON.parse(JSON.stringify(document.value)))
        zoom.value = 100
        panX.value = 0
        panY.value = 0
    }

    function getNextAvailableName(existingNames: string[]): string {
        return findNextAvailableName(existingNames)
    }

    function loadDocument(doc: MindMapDocument) {
        document.value = doc
        clearSelection()
        history.clear()
        history.record(JSON.parse(JSON.stringify(doc)))
    }

    history.record(JSON.parse(JSON.stringify(document.value)))

    return {
        document,
        selectedIds,
        focusedId,
        zoom,
        panX,
        panY,
        clipboard,
        zenMode,
        zenLevel,
        zenFocusMode,

        fileName,
        layout,
        theme,
        nodeCount,
        canUndo,
        canRedo,

        findNode,
        selectNode,
        clearSelection,
        addChild,
        addSibling,
        deleteNode,
        deleteSelectedNodes,
        updateNodeText,
        updateNodeData,
        updateNodeStyle,
        updateNodePosition,
        setSummary,
        removeSummary,
        moveNode,
        reorderNode,
        toggleExpand,
        undo,
        redo,
        copyNode,
        pasteNode,
        navigateToParent,
        navigateToChild,
        navigateToPrevSibling,
        navigateToNextSibling,
        setZoom,
        setLayout,
        setTheme,
        setZenMode,
        toggleZenMode,
        setZenLevel,
        cycleZenLevel,
        setZenFocusMode,
        cycleZenFocusMode,
        newDocument,
        loadDocument,
        getNextAvailableName,
    }
})
