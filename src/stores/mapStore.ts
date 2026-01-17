import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MindMapNode, MindMapDocument, LayoutType, ThemeType, NodeData, NodeStyle } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { history } from '@/composables/useHistory'

/**
 * 创建默认节点
 */
function createNode(text: string, parentId?: string): MindMapNode {
    return {
        id: uuidv4(),
        text,
        parentId,
        children: [],
        isExpanded: true,
    }
}

/**
 * 创建默认文档
 */
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

// 文档计数器（仅作为备用）
let docCounter = 1

// 查找最小可用的导图序号
function findNextAvailableName(existingNames: string[]): string {
    const usedNumbers = new Set<number>()
    const pattern = /^未命名导图 (\d+)$/

    for (const name of existingNames) {
        const match = name.match(pattern)
        if (match) {
            usedNumbers.add(parseInt(match[1], 10))
        }
    }

    // 找最小的未使用序号
    let num = 1
    while (usedNumbers.has(num)) {
        num++
    }

    return `未命名导图 ${num}`
}

export const useMapStore = defineStore('map', () => {
    // 当前文档
    const document = ref<MindMapDocument>(createDefaultDocument())

    // 选中的节点 ID 列表
    const selectedIds = ref<string[]>([])

    // 当前聚焦的节点 ID
    const focusedId = ref<string | undefined>(undefined)

    // 视图状态
    const zoom = ref(100)
    const panX = ref(0)
    const panY = ref(0)

    // 剪贴板
    const clipboard = ref<MindMapNode | null>(null)

    // 是否正在应用历史记录（避免重复记录）
    let isApplyingHistory = false

    // 计算属性
    const fileName = computed(() => document.value.name)
    const layout = computed(() => document.value.layout)
    const theme = computed(() => document.value.theme)

    // 统计节点数量
    const nodeCount = computed(() => {
        let count = 0
        const traverse = (node: MindMapNode) => {
            count++
            node.children.forEach(traverse)
        }
        traverse(document.value.root)
        return count
    })

    // 可以撤销/重做
    const canUndo = computed(() => history.canUndo())
    const canRedo = computed(() => history.canRedo())

    // 查找节点
    function findNode(id: string, node: MindMapNode = document.value.root): MindMapNode | null {
        if (node.id === id) return node
        for (const child of node.children) {
            const found = findNode(id, child)
            if (found) return found
        }
        return null
    }

    // 查找节点及其父节点
    function findNodeWithParent(id: string, node: MindMapNode = document.value.root, parent: MindMapNode | null = null): { node: MindMapNode; parent: MindMapNode | null } | null {
        if (node.id === id) return { node, parent }
        for (const child of node.children) {
            const found = findNodeWithParent(id, child, node)
            if (found) return found
        }
        return null
    }

    // 选中节点
    function selectNode(id: string, append = false) {
        if (append) {
            // Ctrl+点击：切换选中状态
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

    // 清除选中
    function clearSelection() {
        selectedIds.value = []
        focusedId.value = undefined
    }

    // 记录历史
    function recordHistory() {
        if (!isApplyingHistory) {
            history.record(JSON.parse(JSON.stringify(document.value)))
        }
    }

    // 添加子节点
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

    // 添加同级节点
    function addSibling(nodeId: string, text = '新节点') {
        const node = findNode(nodeId)
        if (!node) return null

        // 如果是根节点，改为添加子节点
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

    // 删除节点
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
                    // 选择父节点或兄弟节点
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

    // 批量删除选中的节点
    function deleteSelectedNodes() {
        if (selectedIds.value.length === 0) return

        recordHistory()

        // 过滤掉根节点，按深度排序（先删深的再删浅的，避免父节点被删后子节点找不到）
        const nodesToDelete = selectedIds.value
            .filter(id => {
                const node = findNode(id)
                return node && node.parentId // 不能删除根节点
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

    // 获取节点深度
    function getNodeDepth(nodeId: string): number {
        let depth = 0
        let node = findNode(nodeId)
        while (node && node.parentId) {
            depth++
            node = findNode(node.parentId)
        }
        return depth
    }

    // 更新节点文本
    function updateNodeText(nodeId: string, text: string) {
        const node = findNode(nodeId)
        if (node && node.text !== text) {
            recordHistory()
            node.text = text
            document.value.updatedAt = Date.now()
        }
    }

    // 更新节点扩展数据
    function updateNodeData(nodeId: string, data: Partial<NodeData>) {
        const node = findNode(nodeId)
        if (node) {
            recordHistory()
            if (!node.data) {
                node.data = {}
            }
            Object.assign(node.data, data)
            // 清理 undefined 值
            Object.keys(node.data).forEach(key => {
                if ((node.data as any)[key] === undefined) {
                    delete (node.data as any)[key]
                }
            })
            document.value.updatedAt = Date.now()
        }
    }

    // 更新节点样式
    function updateNodeStyle(nodeId: string, style: Partial<NodeStyle>) {
        const node = findNode(nodeId)
        if (node) {
            recordHistory()
            if (!node.style) {
                node.style = {}
            }
            Object.assign(node.style, style)
            // 清理 undefined 值
            Object.keys(node.style).forEach(key => {
                if ((node.style as any)[key] === undefined) {
                    delete (node.style as any)[key]
                }
            })
            document.value.updatedAt = Date.now()
        }
    }

    // 更新节点位置（自由拖拽）
    function updateNodePosition(nodeId: string, x: number, y: number) {
        const node = findNode(nodeId)
        if (node) {
            recordHistory()
            node.position = { x, y }
            document.value.updatedAt = Date.now()
        }
    }

    // 添加/更新概要
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

    // 删除概要
    function removeSummary(nodeId: string) {
        const node = findNode(nodeId)
        if (node && node.summary) {
            recordHistory()
            delete node.summary
            document.value.updatedAt = Date.now()
        }
    }

    // 移动节点到新的父节点
    function moveNode(nodeId: string, newParentId: string, insertIndex?: number) {
        // 不能移动根节点
        const node = findNode(nodeId)
        if (!node || !node.parentId) return false

        // 不能移动到自己或自己的子节点
        let checkNode: MindMapNode | null = findNode(newParentId)
        while (checkNode) {
            if (checkNode.id === nodeId) return false
            checkNode = checkNode.parentId ? findNode(checkNode.parentId) : null
        }

        const oldParent = findNode(node.parentId)
        const newParent = findNode(newParentId)
        if (!oldParent || !newParent) return false

        recordHistory()

        // 从原父节点移除
        const oldIndex = oldParent.children.findIndex(c => c.id === nodeId)
        if (oldIndex !== -1) {
            oldParent.children.splice(oldIndex, 1)
        }

        // 添加到新父节点
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

    // 重新排序节点（同级）
    function reorderNode(nodeId: string, newIndex: number) {
        const node = findNode(nodeId)
        if (!node || !node.parentId) return false

        const parent = findNode(node.parentId)
        if (!parent) return false

        const currentIndex = parent.children.findIndex(c => c.id === nodeId)
        if (currentIndex === -1 || currentIndex === newIndex) return false

        recordHistory()

        // 移除并插入到新位置
        parent.children.splice(currentIndex, 1)
        parent.children.splice(newIndex, 0, node)

        document.value.updatedAt = Date.now()
        return true
    }

    // 切换节点展开/收起
    function toggleExpand(nodeId: string) {
        const node = findNode(nodeId)
        if (node && node.children.length > 0) {
            node.isExpanded = !node.isExpanded
        }
    }

    // 撤销
    function undo() {
        const prev = history.undo()
        if (prev) {
            isApplyingHistory = true
            document.value = prev
            clearSelection()
            isApplyingHistory = false
        }
    }

    // 重做
    function redo() {
        const next = history.redo()
        if (next) {
            isApplyingHistory = true
            document.value = next
            clearSelection()
            isApplyingHistory = false
        }
    }

    // 复制节点
    function copyNode(nodeId: string) {
        const node = findNode(nodeId)
        if (node) {
            clipboard.value = JSON.parse(JSON.stringify(node))
        }
    }

    // 粘贴节点
    function pasteNode(parentId: string) {
        if (!clipboard.value) return null

        const parent = findNode(parentId)
        if (!parent) return null

        recordHistory()

        // 深拷贝并重新生成 ID
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

    // 键盘导航 - 移动到父节点
    function navigateToParent() {
        if (!focusedId.value) return
        const node = findNode(focusedId.value)
        if (node?.parentId) {
            selectNode(node.parentId)
        }
    }

    // 键盘导航 - 移动到第一个子节点
    function navigateToChild() {
        if (!focusedId.value) return
        const node = findNode(focusedId.value)
        if (node && node.children.length > 0 && node.isExpanded) {
            selectNode(node.children[0].id)
        }
    }

    // 键盘导航 - 移动到上一个兄弟节点
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

    // 键盘导航 - 移动到下一个兄弟节点
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

    // 设置缩放
    function setZoom(value: number) {
        zoom.value = Math.max(25, Math.min(400, value))
    }

    // 设置布局
    function setLayout(value: LayoutType) {
        document.value.layout = value
        document.value.updatedAt = Date.now()
    }

    // 设置主题
    function setTheme(value: ThemeType) {
        document.value.theme = value
        document.value.updatedAt = Date.now()
    }

    // 新建文档
    function newDocument(customName?: string) {
        document.value = createDefaultDocument(customName)
        clearSelection()
        history.clear()
        history.record(JSON.parse(JSON.stringify(document.value)))
        zoom.value = 100
        panX.value = 0
        panY.value = 0
    }

    // 获取下一个可用的导图名称
    function getNextAvailableName(existingNames: string[]): string {
        return findNextAvailableName(existingNames)
    }

    // 加载文档
    function loadDocument(doc: MindMapDocument) {
        document.value = doc
        clearSelection()
        history.clear()
        history.record(JSON.parse(JSON.stringify(doc)))
    }

    // 初始化时记录历史
    history.record(JSON.parse(JSON.stringify(document.value)))

    return {
        // 状态
        document,
        selectedIds,
        focusedId,
        zoom,
        panX,
        panY,
        clipboard,

        // 计算属性
        fileName,
        layout,
        theme,
        nodeCount,
        canUndo,
        canRedo,

        // 方法
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
        newDocument,
        loadDocument,
        getNextAvailableName,
    }
})
