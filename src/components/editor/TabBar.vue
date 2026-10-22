<template>
  <div class="tab-bar">
    <div class="tabs-container">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeTabId }"
        @click="selectTab(tab.id)"
      >
        <span class="tab-name">{{ tab.name }}</span>
        <button 
          class="tab-close"
          @click.stop="closeTab(tab.id)"
          v-if="tabs.length > 1"
        >
          <X :size="12" />
        </button>
      </div>
      <button class="new-tab-btn" @click="addNewTab" title="新建导图">
        <Plus :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { X, Plus } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import { documentService } from '@/services/db'
import type { MindMapDocument } from '@/types'

interface Tab {
  id: string
  name: string
  document: MindMapDocument
}

const mapStore = useMapStore()

const tabs = ref<Tab[]>([])
const activeTabId = ref<string>('')

// 记录组件挂载时间
const mountedTime = Date.now()

// 监听文档变化（包括初始加载和切换）
watch(() => mapStore.document.id, (newId, _oldId) => {
  if (!newId) return
  
  // 首次初始化或文档切换
  const existingTab = tabs.value.find(t => t.id === newId)
  
  if (existingTab) {
    // 已有标签，只切换激活状态
    activeTabId.value = newId
  } else {
    // 检查是否是初始化加载（页面刷新后的自动加载）
    // 如果当前只有一个标签，且距离挂载时间很短（<1000ms），则认为是自动加载替换
    if (tabs.value.length === 1 && Date.now() - mountedTime < 1000) {
      const currentTab = tabs.value[0]
      // 替换当前标签
      currentTab.id = newId
      currentTab.name = mapStore.document.name
      currentTab.document = JSON.parse(JSON.stringify(mapStore.document))
      activeTabId.value = newId
    } else {
      // 正常的新文档，添加标签
      const newDoc = JSON.parse(JSON.stringify(mapStore.document))
      tabs.value.push({
        id: newDoc.id,
        name: newDoc.name,
        document: newDoc
      })
      activeTabId.value = newId
    }
  }
}, { immediate: true })

// 监听文档名称变化
watch(() => mapStore.document.name, (newName) => {
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  if (tab) {
    tab.name = newName
  }
})

async function selectTab(tabId: string) {
  if (tabId === activeTabId.value) return
  
  // 保存当前文档到当前标签
  const currentTab = tabs.value.find(t => t.id === activeTabId.value)
  if (currentTab) {
    currentTab.document = JSON.parse(JSON.stringify(mapStore.document))
  }
  
  // 切换到新标签
  const newTab = tabs.value.find(t => t.id === tabId)
  if (newTab) {
    activeTabId.value = tabId
    let docToLoad = newTab.document
    try {
      const latest = await documentService.get(tabId)
      if (latest) {
        const latestUpdatedAt = latest.updatedAt || 0
        const tabUpdatedAt = newTab.document?.updatedAt || 0
        if (!newTab.document || latestUpdatedAt >= tabUpdatedAt) {
          newTab.name = latest.name
          newTab.document = JSON.parse(JSON.stringify(latest))
          docToLoad = newTab.document
        }
      }
    } catch (e) {
      console.warn('Load tab document failed, fallback to cached snapshot.', e)
    }
    if (docToLoad && activeTabId.value === tabId) {
      mapStore.loadDocument(JSON.parse(JSON.stringify(docToLoad)))
    }
  }
}

// ---------- 全键盘：Ctrl+Alt+←/→ 切换标签，Alt+数字直达 ----------
function handleTabKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  const activeElement = document.activeElement
  const isInputFocused = activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement as HTMLElement | null)?.isContentEditable
  if (isInputFocused) return

  if (event.ctrlKey && event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
    event.preventDefault()
    if (tabs.value.length < 2) return
    const current = tabs.value.findIndex(t => t.id === activeTabId.value)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = ((current + delta) % tabs.value.length + tabs.value.length) % tabs.value.length
    selectTab(tabs.value[next].id)
    return
  }

  if (event.altKey && !event.ctrlKey && /^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1
    if (index < tabs.value.length) {
      event.preventDefault()
      selectTab(tabs.value[index].id)
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleTabKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleTabKeydown)
})

async function addNewTab() {
  try {
    // 保存当前文档到当前标签
    const currentTab = tabs.value.find(t => t.id === activeTabId.value)
    if (currentTab) {
      currentTab.document = JSON.parse(JSON.stringify(mapStore.document))
      // 同时保存到数据库
      await documentService.save(JSON.parse(JSON.stringify(currentTab.document)))
    }

    // 创建新文档：命名避开存储里已有名字（会话内计数器会与旧文档撞名）
    const allDocs = await documentService.getAll()
    const newName = mapStore.getNextAvailableName(allDocs.map(d => d.name))
    mapStore.newDocument(newName)
    // 下方 document.id 的 watch 会推入并激活新标签；这里不再手动 push，
    // 否则同一文档入列两次（同名标签 + v-for 重复 key）
    await nextTick()
  } catch (e) {
    console.error('Add new tab error:', e)
  }
}

async function closeTab(tabId: string) {
  if (tabs.value.length <= 1) return
  
  try {
    const tabIndex = tabs.value.findIndex(t => t.id === tabId)
    if (tabIndex === -1) return
    
    // 保存要关闭的文档（避免缓存比数据库更新时丢失）
    const closingTab = tabs.value[tabIndex]
    if (tabId === activeTabId.value) {
      closingTab.document = JSON.parse(JSON.stringify(mapStore.document))
    }
    if (closingTab.document) {
      const latest = await documentService.get(tabId)
      const latestUpdatedAt = latest?.updatedAt || 0
      const tabUpdatedAt = closingTab.document.updatedAt || 0
      if (!latest || tabUpdatedAt > latestUpdatedAt) {
        await documentService.save(JSON.parse(JSON.stringify(closingTab.document)))
      }
    }
    
    // 移除标签
    tabs.value.splice(tabIndex, 1)
    
    // 如果关闭的是当前标签，切换到相邻标签
    if (tabId === activeTabId.value) {
      const newIndex = Math.min(tabIndex, tabs.value.length - 1)
      const newTab = tabs.value[newIndex]
      activeTabId.value = newTab.id
      mapStore.loadDocument(JSON.parse(JSON.stringify(newTab.document)))
    }
  } catch (e) {
    console.error('Close tab error:', e)
  }
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  padding: 0 8px;
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: all 0.15s ease;
  max-width: 160px;
  min-width: 80px;
}

.tab:hover {
  background: var(--color-bg);
}

.tab.active {
  background: var(--color-bg);
  box-shadow: 0 1px 0 var(--color-bg), inset 0 2px 0 var(--color-primary);
  position: relative;
}

.tab-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.tab.active .tab-name {
  color: var(--color-text);
  font-weight: 500;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  border-radius: 3px;
  color: var(--color-text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: all 0.1s ease;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.new-tab-btn:hover {
  background: var(--color-bg);
  color: var(--color-text);
}
</style>
