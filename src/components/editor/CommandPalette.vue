<template>
  <Teleport to="body">
    <div v-if="isOpen" class="command-overlay" @click.self="close">
      <div class="command-panel">
        <div class="command-header">
          <Search :size="18" class="search-icon" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="输入命令或搜索..."
            @keydown="handleKeyDown"
          />
        </div>
        
        <div class="command-list">
          <div v-if="filteredCommands.length === 0" class="empty">
            未找到匹配的命令
          </div>
          <button
            v-for="(cmd, index) in filteredCommands"
            :key="cmd.id"
            class="command-item"
            :class="{ active: index === selectedIndex }"
            @click="executeCommand(cmd)"
            @mouseenter="selectedIndex = index"
          >
            <component :is="cmd.icon" :size="16" class="cmd-icon" />
            <div class="cmd-info">
              <span class="cmd-name">{{ cmd.name }}</span>
              <span class="cmd-desc" v-if="cmd.description">{{ cmd.description }}</span>
            </div>
            <span class="cmd-shortcut" v-if="cmd.shortcut">{{ cmd.shortcut }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { 
  Search, Plus, Trash2, Undo2, Redo2, Copy, Clipboard,
  Download, Upload, FilePlus, Maximize, Moon, Sun,
  CornerDownRight, ZoomIn, ZoomOut, GitBranch, Network
} from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import { exportService } from '@/services/export'

interface Command {
  id: string
  name: string
  description?: string
  shortcut?: string
  icon: Component
  action: () => void
  category: string
}

const mapStore = useMapStore()

const isOpen = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const emit = defineEmits<{
  'new-document': []
  'toggle-theme': []
}>()

const commands = computed<Command[]>(() => [
  {
    id: 'add-child',
    name: '添加子节点',
    shortcut: 'Tab',
    icon: markRaw(Plus),
    action: () => {
      if (mapStore.focusedId) mapStore.addChild(mapStore.focusedId)
    },
    category: '节点',
  },
  {
    id: 'add-sibling',
    name: '添加同级节点',
    shortcut: 'Enter',
    icon: markRaw(CornerDownRight),
    action: () => {
      if (mapStore.focusedId) mapStore.addSibling(mapStore.focusedId)
    },
    category: '节点',
  },
  {
    id: 'delete-node',
    name: '删除节点',
    shortcut: 'Delete',
    icon: markRaw(Trash2),
    action: () => {
      if (mapStore.focusedId) mapStore.deleteNode(mapStore.focusedId)
    },
    category: '节点',
  },
  {
    id: 'undo',
    name: '撤销',
    shortcut: 'Ctrl+Z',
    icon: markRaw(Undo2),
    action: () => mapStore.undo(),
    category: '编辑',
  },
  {
    id: 'redo',
    name: '重做',
    shortcut: 'Ctrl+Y',
    icon: markRaw(Redo2),
    action: () => mapStore.redo(),
    category: '编辑',
  },
  {
    id: 'copy',
    name: '复制节点',
    shortcut: 'Ctrl+C',
    icon: markRaw(Copy),
    action: () => {
      if (mapStore.focusedId) mapStore.copyNode(mapStore.focusedId)
    },
    category: '编辑',
  },
  {
    id: 'paste',
    name: '粘贴节点',
    shortcut: 'Ctrl+V',
    icon: markRaw(Clipboard),
    action: () => {
      if (mapStore.focusedId) mapStore.pasteNode(mapStore.focusedId)
    },
    category: '编辑',
  },
  {
    id: 'new-doc',
    name: '新建文档',
    icon: markRaw(FilePlus),
    action: () => emit('new-document'),
    category: '文件',
  },
  {
    id: 'export-json',
    name: '导出 JSON',
    icon: markRaw(Download),
    action: () => exportService.exportJSON(mapStore.document),
    category: '文件',
  },
  {
    id: 'export-md',
    name: '导出 Markdown',
    icon: markRaw(Download),
    action: () => exportService.exportMarkdown(mapStore.document),
    category: '文件',
  },
  {
    id: 'zoom-in',
    name: '放大',
    shortcut: '滚轮',
    icon: markRaw(ZoomIn),
    action: () => mapStore.setZoom(mapStore.zoom + 10),
    category: '视图',
  },
  {
    id: 'zoom-out',
    name: '缩小',
    shortcut: '滚轮',
    icon: markRaw(ZoomOut),
    action: () => mapStore.setZoom(mapStore.zoom - 10),
    category: '视图',
  },
  {
    id: 'fullscreen',
    name: '全屏模式',
    icon: markRaw(Maximize),
    action: () => {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        document.documentElement.requestFullscreen()
      }
    },
    category: '视图',
  },
  {
    id: 'layout-mind',
    name: '思维导图布局',
    icon: markRaw(Network),
    action: () => mapStore.setLayout('mind'),
    category: '布局',
  },
  {
    id: 'layout-tree',
    name: '树形布局',
    icon: markRaw(GitBranch),
    action: () => mapStore.setLayout('tree'),
    category: '布局',
  },
  {
    id: 'theme-light',
    name: '亮色主题',
    icon: markRaw(Sun),
    action: () => {
      mapStore.setTheme('light')
      document.documentElement.setAttribute('data-theme', 'light')
    },
    category: '主题',
  },
  {
    id: 'theme-dark',
    name: '暗色主题',
    icon: markRaw(Moon),
    action: () => {
      mapStore.setTheme('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    },
    category: '主题',
  },
])

const filteredCommands = computed(() => {
  if (!query.value.trim()) return commands.value
  const q = query.value.toLowerCase()
  return commands.value.filter(
    cmd => cmd.name.toLowerCase().includes(q) || 
           cmd.category.toLowerCase().includes(q)
  )
})

function open() {
  isOpen.value = true
  query.value = ''
  selectedIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}

function close() {
  isOpen.value = false
}

function executeCommand(cmd: Command) {
  cmd.action()
  close()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredCommands.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (filteredCommands.value[selectedIndex.value]) {
      executeCommand(filteredCommands.value[selectedIndex.value])
    }
  } else if (event.key === 'Escape') {
    close()
  }
}

function handleGlobalKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === 'k') {
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

defineExpose({ open, close })
</script>

<style scoped>
.command-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 1000;
}

.command-panel {
  width: 100%;
  max-width: 520px;
  background: var(--color-bg);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.command-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
}

.search-icon {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.command-header input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--color-text);
  outline: none;
}

.command-header input::placeholder {
  color: var(--color-text-secondary);
}

.command-list {
  max-height: 360px;
  overflow-y: auto;
  padding: 8px;
}

.empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.command-item:hover,
.command-item.active {
  background: var(--color-bg-secondary);
}

.cmd-icon {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.cmd-info {
  flex: 1;
  min-width: 0;
}

.cmd-name {
  display: block;
  font-size: 14px;
  color: var(--color-text);
}

.cmd-desc {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.cmd-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
}
</style>
