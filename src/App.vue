<template>
  <div class="app-container">
    <!-- 多选项卡 -->
    <TabBar />
    
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="logo">
          <img src="/logo.svg" alt="Logo" width="28" height="28" class="logo-img" />
          <span class="logo-text">OneLook</span>
        </div>
        <div class="divider"></div>
        <FileManager />
      </div>
      
      <div class="toolbar-center">
        <button class="tool-btn" :class="{ disabled: !mapStore.canUndo }" title="撤销 (Ctrl+Z)" @click="handleUndo" :disabled="!mapStore.canUndo">
          <Undo2 :size="18" />
        </button>
        <button class="tool-btn" :class="{ disabled: !mapStore.canRedo }" title="重做 (Ctrl+Y)" @click="handleRedo" :disabled="!mapStore.canRedo">
          <Redo2 :size="18" />
        </button>
        <div class="divider"></div>
        <button class="tool-btn" title="添加子节点 (Tab)" @click="handleAddChild">
          <Plus :size="18" />
        </button>
        <button class="tool-btn" title="添加同级节点 (Enter)" @click="handleAddSibling">
          <CornerDownRight :size="18" />
        </button>
        <button class="tool-btn" title="删除节点 (Delete)" @click="handleDelete">
          <Trash2 :size="18" />
        </button>
        <div class="divider"></div>
        <button class="tool-btn" title="缩小" @click="handleZoomOut">
          <ZoomOut :size="18" />
        </button>
        <span class="zoom-level">{{ mapStore.zoom }}%</span>
        <button class="tool-btn" title="放大" @click="handleZoomIn">
          <ZoomIn :size="18" />
        </button>
        <button class="tool-btn" title="重置缩放" @click="handleZoomReset">
          <Maximize2 :size="18" />
        </button>
      </div>
      
      <div class="toolbar-right">
        <button class="tool-btn" title="新建文档" @click="handleNewDocument">
          <FilePlus :size="18" />
        </button>
        <button class="tool-btn" title="导入" @click="handleImport">
          <Upload :size="18" />
        </button>
        <div class="export-menu">
          <button class="tool-btn" title="导出" @click="showExportMenu = !showExportMenu">
            <Download :size="18" />
          </button>
          <div v-if="showExportMenu" class="dropdown-menu">
            <button @click="handleExportOLook">导出 OneLook (.olook)</button>
            <button @click="handleExportJSON">导出 JSON</button>
            <button @click="handleExportMarkdown">导出 Markdown</button>
            <button @click="handleExportPNG">导出 PNG</button>
            <button @click="handleExportSVG">导出 SVG</button>
          </div>
        </div>
        <div class="divider"></div>
        <button class="tool-btn" title="搜索 (Ctrl+F)" @click="openSearch">
          <Search :size="18" />
        </button>
        <button class="tool-btn" title="全屏" @click="toggleFullscreen">
          <Maximize :size="18" />
        </button>
        <div class="divider"></div>
        <button 
          class="tool-btn" 
          :class="{ active: showOutlinePanel }"
          title="大纲面板"
          @click="showOutlinePanel = !showOutlinePanel"
        >
          <List :size="18" />
        </button>
        <button 
          class="tool-btn" 
          :class="{ active: showSidePanel }"
          title="属性面板"
          @click="showSidePanel = !showSidePanel"
        >
          <PanelRight :size="18" />
        </button>
        <div class="settings-menu">
          <button 
            class="tool-btn" 
            :class="{ active: showSettingsMenu }"
            title="设置"
            @click="showSettingsMenu = !showSettingsMenu"
          >
            <Settings :size="18" />
          </button>
          <SettingsDropdown 
            :is-open="showSettingsMenu"
            @close="showSettingsMenu = false"
          />
        </div>
      </div>
    </header>
    
    <!-- 主编辑区域 -->
    <main class="editor-area">
      <!-- 大纲面板 -->
      <OutlinePanel v-if="showOutlinePanel" @close="showOutlinePanel = false" />
      
      <div class="canvas-container">
        <MindMapCanvas />
      </div>
      
      <!-- 右侧面板 -->
      <NodeProperties 
        v-if="showSidePanel"
        :node="selectedNode"
        @close="showSidePanel = false"
      />
    </main>
    
    <!-- 底部状态栏 -->
    <footer class="status-bar">
      <span class="status-item">节点数: {{ mapStore.nodeCount }}</span>
      <span class="status-item">布局: {{ layoutLabel }}</span>
      <span class="status-item">
        <button class="status-btn" @click="showShortcutsHelp?.open()" title="快捷键帮助">
          <Keyboard :size="14" />
        </button>
      </span>
      <span class="status-item status-saved">
        <Check :size="14" />
        就绪
      </span>
    </footer>
    
    <!-- 搜索对话框 -->
    <SearchDialog ref="searchDialogRef" />
    
    <!-- 命令面板 -->
    <CommandPalette ref="commandPaletteRef" @new-document="handleNewDocument" />
    
    <!-- 快捷键帮助 -->
    <ShortcutsHelp ref="showShortcutsHelp" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  Undo2, 
  Redo2, 
  Plus, 
  CornerDownRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Maximize,
  Search,
  Settings,
  Check,
  Trash2,
  FilePlus,
  Download,
  Upload,
  PanelRight,
  Keyboard,
  List
} from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import { exportService, importService } from '@/services/export'
import MindMapCanvas from '@/components/editor/MindMapCanvas.vue'
import NodeProperties from '@/components/editor/NodeProperties.vue'
import SearchDialog from '@/components/editor/SearchDialog.vue'
import SettingsDropdown from '@/components/editor/SettingsDropdown.vue'
import FileManager from '@/components/editor/FileManager.vue'
import CommandPalette from '@/components/editor/CommandPalette.vue'
import ShortcutsHelp from '@/components/editor/ShortcutsHelp.vue'
import OutlinePanel from '@/components/editor/OutlinePanel.vue'
import TabBar from '@/components/editor/TabBar.vue'

const mapStore = useMapStore()

// 组件引用
const searchDialogRef = ref<InstanceType<typeof SearchDialog> | null>(null)
const commandPaletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)
const showShortcutsHelp = ref<InstanceType<typeof ShortcutsHelp> | null>(null)

// UI 状态
const showExportMenu = ref(false)
const showSidePanel = ref(false)
const showSettingsMenu = ref(false)
const showOutlinePanel = ref(false)

// 布局标签
const layoutLabels: Record<string, string> = {
  mind: '思维导图',
  tree: '树形',
  fishbone: '鱼骨图',
  org: '组织架构'
}
const layoutLabel = computed(() => layoutLabels[mapStore.document.layout] || '思维导图')

// 选中的节点
const selectedNode = computed(() => {
  if (mapStore.focusedId) {
    return mapStore.findNode(mapStore.focusedId)
  }
  return null
})

// 工具栏操作
function handleUndo() {
  mapStore.undo()
}

function handleRedo() {
  mapStore.redo()
}

function handleAddChild() {
  if (mapStore.focusedId) {
    mapStore.addChild(mapStore.focusedId)
  } else {
    mapStore.addChild(mapStore.document.root.id)
  }
}

function handleAddSibling() {
  if (mapStore.focusedId) {
    mapStore.addSibling(mapStore.focusedId)
  }
}

function handleDelete() {
  // 多选时批量删除，单选时删除焦点节点
  if (mapStore.selectedIds.length > 1) {
    mapStore.deleteSelectedNodes()
  } else if (mapStore.focusedId) {
    mapStore.deleteNode(mapStore.focusedId)
  }
}

function handleZoomIn() {
  mapStore.setZoom(mapStore.zoom + 10)
}

function handleZoomOut() {
  mapStore.setZoom(mapStore.zoom - 10)
}

function handleZoomReset() {
  mapStore.setZoom(100)
}

function handleNewDocument() {
  if (confirm('确定要新建文档吗？当前未保存的更改将丢失。')) {
    mapStore.newDocument()
  }
}

function handleExportJSON() {
  exportService.exportJSON(mapStore.document)
  showExportMenu.value = false
}

function handleExportMarkdown() {
  exportService.exportMarkdown(mapStore.document)
  showExportMenu.value = false
}

function handleExportPNG() {
  const svg = document.querySelector('.mindmap-canvas') as SVGSVGElement
  if (svg) {
    exportService.exportPNG(svg, mapStore.document.name)
  }
  showExportMenu.value = false
}

function handleExportSVG() {
  const svg = document.querySelector('.mindmap-canvas') as SVGSVGElement
  if (svg) {
    exportService.exportSVG(svg, mapStore.document.name)
  }
  showExportMenu.value = false
}

function handleExportOLook() {
  exportService.exportOLook(mapStore.document)
  showExportMenu.value = false
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.md,.olook'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    
    try {
      if (file.name.endsWith('.olook')) {
        const doc = await importService.importOLook(file)
        mapStore.loadDocument(doc)
      } else if (file.name.endsWith('.json')) {
        const doc = await importService.importJSON(file)
        mapStore.loadDocument(doc)
      } else if (file.name.endsWith('.md')) {
        const root = await importService.importMarkdown(file)
        mapStore.document.root = root
        mapStore.document.name = file.name.replace('.md', '')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      alert(`导入失败：${errorMessage}\n\n请确保文件格式正确。`)
      console.error('导入错误:', err)
    }
  }
  input.click()
}

function handleTextChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (mapStore.focusedId) {
    mapStore.updateNodeText(mapStore.focusedId, target.value)
  }
}

// 打开搜索
function openSearch() {
  searchDialogRef.value?.open()
}

// 切换全屏
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen()
  }
}

// 全局点击关闭下拉菜单
function handleGlobalClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  // 点击导出菜单外部时关闭
  if (showExportMenu.value && !target.closest('.export-menu')) {
    showExportMenu.value = false
  }
  // 点击设置菜单外部时关闭
  if (showSettingsMenu.value && !target.closest('.settings-menu')) {
    showSettingsMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

/* 顶部工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 16px;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.divider {
  width: 1px;
  height: 24px;
  background: var(--color-border);
  margin: 0 8px;
}

.file-name {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.tool-btn:active {
  background: var(--color-border);
}

.tool-btn.active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary);
}

.tool-btn.disabled,
.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tool-btn.disabled:hover,
.tool-btn:disabled:hover {
  background: transparent;
  color: var(--color-text-secondary);
}

.zoom-level {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 40px;
  text-align: center;
}

/* 编辑区域 */
.editor-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  position: relative;
  background: 
    radial-gradient(circle at center, transparent 0%, var(--color-bg-secondary) 100%),
    linear-gradient(90deg, var(--color-border) 1px, transparent 1px) 0 0 / 20px 20px,
    linear-gradient(var(--color-border) 1px, transparent 1px) 0 0 / 20px 20px;
  overflow: hidden;
}

/* 侧边面板 */
.side-panel {
  width: 280px;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  font-weight: 500;
  font-size: 14px;
}

.close-btn {
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
}

.close-btn:hover {
  background: var(--color-bg-secondary);
}

.panel-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.property-group {
  margin-bottom: 16px;
}

.property-group label {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.property-group input,
.property-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  transition: border-color 0.15s ease;
  font-family: inherit;
}

.property-group input:focus,
.property-group textarea:focus {
  border-color: var(--color-primary);
}

.property-group textarea {
  min-height: 80px;
  resize: vertical;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--color-text-secondary);
  text-align: center;
  font-size: 13px;
}

/* 底部状态栏 */
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 28px;
  padding: 0 16px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-saved {
  color: #10b981;
}

/* 导出菜单 */
.export-menu {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px;
  min-width: 140px;
  z-index: 100;
}

.dropdown-menu button {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: var(--color-text);
  border-radius: 4px;
  cursor: pointer;
}

.dropdown-menu button:hover {
  background: var(--color-bg-secondary);
}

/* 设置菜单 */
.settings-menu {
  position: relative;
}

/* 状态栏按钮 */
.status-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.status-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}
</style>
