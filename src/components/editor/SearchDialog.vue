<template>
  <Teleport to="body">
    <div v-if="isOpen" class="search-overlay" @click.self="close">
      <div class="search-dialog">
        <div class="search-header">
          <Search :size="18" class="search-icon" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="搜索节点..."
            @input="handleSearch"
            @keydown="handleKeyDown"
          />
          <span v-if="results.length > 0" class="result-count">
            {{ currentIndex + 1 }} / {{ results.length }}
          </span>
          <button class="close-btn" @click="close">
            <X :size="16" />
          </button>
        </div>
        
        <!-- 替换区域 -->
        <div class="replace-section">
          <div class="replace-input">
            <Replace :size="18" class="replace-icon" />
            <input
              v-model="replaceText"
              type="text"
              placeholder="替换为..."
              @keydown.enter="handleReplace"
            />
          </div>
          <div class="replace-actions">
            <button 
              class="action-btn"
              @click="handleReplace"
              :disabled="results.length === 0"
              title="替换当前"
            >
              替换
            </button>
            <button 
              class="action-btn"
              @click="handleReplaceAll"
              :disabled="results.length === 0"
              title="替换全部"
            >
              全部替换
            </button>
          </div>
        </div>
        
        <div v-if="results.length > 0" class="search-results">
          <button
            v-for="(node, index) in results"
            :key="node.id"
            class="result-item"
            :class="{ active: index === currentIndex }"
            @click="selectResult(index)"
          >
            <span class="result-text">{{ node.text }}</span>
            <span class="result-path">{{ getNodePath(node) }}</span>
          </button>
        </div>
        
        <div v-else-if="query.length > 0" class="no-results">
          未找到匹配的节点
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { Search, X, Replace } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import type { MindMapNode } from '@/types'

const mapStore = useMapStore()

const isOpen = ref(false)
const query = ref('')
const replaceText = ref('')
const results = ref<MindMapNode[]>([])
const currentIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 搜索节点
function handleSearch() {
  if (query.value.trim().length === 0) {
    results.value = []
    return
  }
  
  const searchTerm = query.value.toLowerCase()
  const found: MindMapNode[] = []
  
  const traverse = (node: MindMapNode) => {
    if (node.text.toLowerCase().includes(searchTerm)) {
      found.push(node)
    }
    node.children.forEach(traverse)
  }
  
  traverse(mapStore.document.root)
  results.value = found
  currentIndex.value = 0
  
  if (found.length > 0) {
    mapStore.selectNode(found[0].id)
  }
}

// 获取节点路径
function getNodePath(node: MindMapNode): string {
  const path: string[] = []
  let current: MindMapNode | null = node
  
  while (current && current.parentId) {
    current = mapStore.findNode(current.parentId)
    if (current) {
      path.unshift(current.text)
    }
  }
  
  return path.length > 0 ? path.join(' > ') : '根节点'
}

// 选择搜索结果
function selectResult(index: number) {
  currentIndex.value = index
  const node = results.value[index]
  if (node) {
    mapStore.selectNode(node.id)
  }
}

// 替换当前
function handleReplace() {
  if (results.value.length === 0 || !replaceText.value) return
  if (!query.value) return
  
  const node = results.value[currentIndex.value]
  if (node) {
    const regex = new RegExp(escapeRegExp(query.value), 'gi')
    const newText = node.text.replace(regex, replaceText.value)
    mapStore.updateNodeText(node.id, newText)
    
    // 重新搜索
    handleSearch()
  }
}

// 替换全部
function handleReplaceAll() {
  if (results.value.length === 0 || !replaceText.value) return
  if (!query.value) return
  
  const regex = new RegExp(escapeRegExp(query.value), 'gi')
  
  for (const node of results.value) {
    const newText = node.text.replace(regex, replaceText.value)
    mapStore.updateNodeText(node.id, newText)
  }
  
  // 清空结果
  results.value = []
  currentIndex.value = 0
}

// 键盘导航
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    if (results.value.length > 0) {
      // 跳转到下一个
      currentIndex.value = (currentIndex.value + 1) % results.value.length
      selectResult(currentIndex.value)
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (results.value.length > 0) {
      currentIndex.value = (currentIndex.value + 1) % results.value.length
      selectResult(currentIndex.value)
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (results.value.length > 0) {
      currentIndex.value = (currentIndex.value - 1 + results.value.length) % results.value.length
      selectResult(currentIndex.value)
    }
  } else if (event.key === 'Escape') {
    close()
  }
}

// 打开搜索
function open() {
  isOpen.value = true
  query.value = ''
  replaceText.value = ''
  results.value = []
  currentIndex.value = 0
  nextTick(() => {
    inputRef.value?.focus()
  })
}

// 关闭搜索
function close() {
  isOpen.value = false
}

// 全局快捷键
function handleGlobalKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === 'f') {
    event.preventDefault()
    open()
  }
  if (event.ctrlKey && event.key === 'h') {
    event.preventDefault()
    open()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
})

// 暴露方法供外部调用
defineExpose({ open, close })
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 1000;
}

.search-dialog {
  width: 100%;
  max-width: 500px;
  background: var(--color-bg);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.search-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
}

.search-icon, .replace-icon {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.search-header input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--color-text);
  outline: none;
}

.search-header input::placeholder {
  color: var(--color-text-secondary);
}

.result-count {
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.close-btn:hover {
  background: var(--color-bg-secondary);
}

/* 替换区域 */
.replace-section {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  gap: 12px;
  border-bottom: 1px solid var(--color-border);
}

.replace-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.replace-input input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--color-text);
  outline: none;
}

.replace-input input::placeholder {
  color: var(--color-text-secondary);
}

.replace-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-results {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
}

.result-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.result-item:hover,
.result-item.active {
  background: var(--color-bg-secondary);
}

.result-item.active {
  background: rgba(59, 130, 246, 0.1);
}

.result-text {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
}

.result-path {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.no-results {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}
</style>
