import { ref } from 'vue'
import type { MindMapDocument } from '@/types'

/**
 * 历史记录管理器
 * 实现撤销/重做功能
 */
export function useHistory(maxHistory = 50) {
    // 历史记录栈
    const undoStack = ref<string[]>([])
    const redoStack = ref<string[]>([])

    // 是否可以撤销/重做
    const canUndo = () => undoStack.value.length > 1
    const canRedo = () => redoStack.value.length > 0

    // 记录当前状态
    function record(doc: MindMapDocument) {
        const snapshot = JSON.stringify(doc)

        // 如果和最后一个快照相同，不记录
        if (undoStack.value.length > 0 && undoStack.value[undoStack.value.length - 1] === snapshot) {
            return
        }

        undoStack.value.push(snapshot)

        // 限制历史记录数量
        if (undoStack.value.length > maxHistory) {
            undoStack.value.shift()
        }

        // 新操作清空重做栈
        redoStack.value = []
    }

    // 撤销
    function undo(): MindMapDocument | null {
        if (!canUndo()) return null

        // 当前状态移到重做栈
        const current = undoStack.value.pop()!
        redoStack.value.push(current)

        // 返回上一个状态
        const prev = undoStack.value[undoStack.value.length - 1]
        return JSON.parse(prev)
    }

    // 重做
    function redo(): MindMapDocument | null {
        if (!canRedo()) return null

        const next = redoStack.value.pop()!
        undoStack.value.push(next)

        return JSON.parse(next)
    }

    // 清空历史
    function clear() {
        undoStack.value = []
        redoStack.value = []
    }

    // 获取历史记录长度
    function getUndoCount() {
        return undoStack.value.length - 1
    }

    function getRedoCount() {
        return redoStack.value.length
    }

    return {
        canUndo,
        canRedo,
        record,
        undo,
        redo,
        clear,
        getUndoCount,
        getRedoCount,
    }
}

// 全局历史记录实例
export const history = useHistory()
