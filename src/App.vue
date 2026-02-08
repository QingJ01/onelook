<template>
  <div
    class="app-container"
    :class="{
      'zen-active': mapStore.zenMode,
      'zen-lite': isZenLite,
      'zen-deep': isZenDeep
    }"
  >
    
    <div class="tab-bar">
      <TabBar />
    </div>
    
    
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="logo" v-if="!isZenLite">
          <img src="/logo.svg" alt="Logo" width="28" height="28" class="logo-img" />
          <span class="logo-text">OneLook</span>
        </div>
        <div class="divider" v-if="!isZenLite"></div>
        <FileManager v-if="!isZenLite" />
      </div>
      
      <div class="toolbar-center">
        <template v-if="!isZenLite">
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
        </template>
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
        <template v-if="!isZenLite">
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
            <div class="menu-section-title">OneLook 格式</div>
            <button @click="handleExportOLook">导出 OneLook (.olook)</button>
            <div class="menu-section-title">通用格式</div>
            <button @click="handleExportJSON">导出 JSON</button>
            <button @click="handleExportMarkdown">导出 Markdown</button>
            <div class="menu-section-title">图片格式</div>
            <button @click="handleExportPNG">导出 PNG</button>
            <button @click="handleExportSVG">导出 SVG</button>
            <div class="menu-section-title">第三方格式</div>
            <button @click="handleExportXMind">导出 XMind (.xmind)</button>
            <button @click="handleExportFreeMind">导出 FreeMind (.mm)</button>
            <button @click="handleExportOPML">导出 OPML (.opml)</button>
          </div>
        </div>
        </template>
        <div class="divider" v-if="!isZenLite"></div>
        <button class="tool-btn" title="搜索 (Ctrl+F)" @click="openSearch">
          <Search :size="18" />
        </button>
        <button class="tool-btn" title="全屏" @click="toggleFullscreen">
          <Maximize :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: mapStore.zenMode }"
          title="禅模式 (Esc 退出)"
          aria-label="禅模式开关"
          @click="handleToggleZenMode"
        >
          <Eye :size="18" />
        </button>
        <button
          v-if="mapStore.zenMode"
          class="tool-btn"
          :title="`切换禅模式层级（当前：${zenLevelLabel}）`"
          aria-label="切换禅模式层级"
          @click="cycleZenLevel"
        >
          <Layers :size="18" />
        </button>
        <button
          v-if="mapStore.zenMode"
          class="tool-btn"
          :title="`切换聚焦模式（当前：${zenFocusModeLabel}）`"
          aria-label="切换聚焦模式"
          @click="cycleZenFocusMode"
        >
          <GitBranch :size="18" />
        </button>
        <button v-if="!isZenLite" class="tool-btn pitch-btn" title="演说模式" @click="showPitchMode = true">
          <Presentation :size="18" />
        </button>
        <div class="divider" v-if="!isZenLite"></div>
        <button 
          v-if="!isZenLite"
          class="tool-btn" 
          :class="{ active: showOutlinePanel }"
          title="大纲面板"
          @click="showOutlinePanel = !showOutlinePanel"
        >
          <List :size="18" />
        </button>
        <button 
          v-if="!isZenLite"
          class="tool-btn" 
          :class="{ active: showSidePanel }"
          title="属性面板"
          @click="showSidePanel = !showSidePanel"
        >
          <PanelRight :size="18" />
        </button>
        <div v-if="!isZenLite" class="settings-menu">
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
    
    
    <main class="editor-area">
      
      <OutlinePanel
        v-if="showOutlinePanel && !(mapStore.zenMode && mapStore.zenLevel === 'deep')"
        @close="showOutlinePanel = false"
      />
      
      <div class="canvas-container">
        <MindMapCanvas />
      </div>
      
      
      <NodeProperties 
        v-if="showSidePanel && !(mapStore.zenMode && mapStore.zenLevel === 'deep')"
        :node="selectedNode"
        @close="showSidePanel = false"
      />
    </main>
    
    
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
    <Transition name="zen-float">
      <div v-if="mapStore.zenMode" class="zen-floating-controls">
        <span class="zen-badge">禅 · {{ zenLevelLabel }} · {{ zenFocusModeLabel }}</span>
        <button class="zen-action-btn" @click="cycleZenLevel">层级</button>
        <button class="zen-action-btn" @click="cycleZenFocusMode">聚焦</button>
        <button class="zen-action-btn" @click="openSearch">搜索</button>
        <button class="zen-action-btn" @click="handleZoomReset">归中</button>
        <button class="zen-action-btn zen-exit-btn" @click="exitZenMode">退出</button>
      </div>
    </Transition>
    
    
    <SearchDialog ref="searchDialogRef" />
    
    
    <CommandPalette ref="commandPaletteRef" @new-document="handleNewDocument" />
    
    
    <ShortcutsHelp ref="showShortcutsHelp" />
    
    
    <Transition name="toast">
      <div v-if="showToast" class="toast" :class="toastType">
        {{ toastMessage }}
      </div>
    </Transition>
    
    
    <div v-if="isExporting" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>正在导出...</span>
    </div>
    
    
    <PitchMode :is-active="showPitchMode" @exit="showPitchMode = false" />
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
  List,
  Presentation,
  Eye,
  Layers,
  GitBranch
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
import PitchMode from '@/components/editor/PitchMode.vue'

const mapStore = useMapStore()

const searchDialogRef = ref<InstanceType<typeof SearchDialog> | null>(null)
const commandPaletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)
const showShortcutsHelp = ref<InstanceType<typeof ShortcutsHelp> | null>(null)

const showExportMenu = ref(false)
const showSidePanel = ref(false)
const showSettingsMenu = ref(false)
const showOutlinePanel = ref(false)
const showPitchMode = ref(false)

const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('info')
const showToast = ref(false)
const isExporting = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (toastTimer) clearTimeout(toastTimer)
  toastMessage.value = message
  toastType.value = type
  showToast.value = true
  toastTimer = setTimeout(() => showToast.value = false, 3000)
}

const layoutLabels: Record<string, string> = {
  mind: '思维导图',
  tree: '树形',
  fishbone: '鱼骨图',
  org: '组织架构'
}
const layoutLabel = computed(() => layoutLabels[mapStore.document.layout] || 'Mind Map')

const selectedNode = computed(() => {
  if (mapStore.focusedId) {
    return mapStore.findNode(mapStore.focusedId)
  }
  return null
})

const isZenLite = computed(() => mapStore.zenMode && mapStore.zenLevel === 'lite')
const isZenDeep = computed(() => mapStore.zenMode && mapStore.zenLevel === 'deep')

const zenLevelLabels: Record<string, string> = {
  lite: '轻量',
  deep: '深度',
}
const zenFocusModeLabels: Record<string, string> = {
  branch: '分支',
  path: '路径',
  highlight: '高亮',
}

const zenLevelLabel = computed(() => zenLevelLabels[mapStore.zenLevel] || 'Lite')
const zenFocusModeLabel = computed(() => zenFocusModeLabels[mapStore.zenFocusMode] || 'Branch')

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

function handleToggleZenMode() {
  const nextMode = !mapStore.zenMode
  mapStore.setZenMode(nextMode)
  if (nextMode) {
    showNotification(`禅模式已开启 (${zenLevelLabel.value})，按 Esc 退出`, 'info')
  }
}

function exitZenMode() {
  if (!mapStore.zenMode) return
  mapStore.setZenMode(false)
  showNotification('禅模式已关闭', 'info')
}

function cycleZenLevel() {
  mapStore.cycleZenLevel()
  showNotification(`禅模式层级：${zenLevelLabel.value}`, 'info')
}

function cycleZenFocusMode() {
  mapStore.cycleZenFocusMode()
  showNotification(`聚焦模式：${zenFocusModeLabel.value}`, 'info')
}

function handleNewDocument() {
  if (confirm('创建新文档？未保存的更改将丢失。')) {
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

async function handleExportPNG() {
  const svg = document.querySelector('.mindmap-canvas') as SVGSVGElement
  if (!svg) return
  
  showExportMenu.value = false
  isExporting.value = true
  try {
    await exportService.exportPNG(svg, mapStore.document.name)
    showNotification('PNG 导出成功', 'success')
  } catch (err) {
    const msg = err instanceof Error ? err.message : '导出失败'
    showNotification(msg, 'error')
  } finally {
    isExporting.value = false
  }
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

async function handleExportXMind() {
  try {
    await exportService.exportXMind(mapStore.document)
    showNotification('已导出为 XMind 格式', 'success')
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    showNotification(`导出失败：${errorMessage}`, 'error')
  }
  showExportMenu.value = false
}

async function handleExportFreeMind() {
  try {
    await exportService.exportFreeMind(mapStore.document)
    showNotification('已导出为 FreeMind 格式', 'success')
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    showNotification(`Export failed: ${errorMessage}`, 'error')
  }
  showExportMenu.value = false
}

async function handleExportOPML() {
  try {
    await exportService.exportOPML(mapStore.document)
    showNotification('已导出为 OPML 格式', 'success')
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    showNotification(`Export failed: ${errorMessage}`, 'error')
  }
  showExportMenu.value = false
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.md,.olook,.xmind,.mm,.opml'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const doc = await importService.importAuto(file)
      mapStore.loadDocument(doc)
      showNotification(`成功导入: ${doc.name}`, 'success')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      showNotification(`导入失败：${errorMessage}`, 'error')
      console.error('导入错误:', err)
    }
  }
  input.click()
}

function openSearch() {
  searchDialogRef.value?.open()
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen()
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return

  const activeElement = document.activeElement
  const isInputFocused = activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    activeElement?.hasAttribute('contenteditable')

  if (isInputFocused) return

  if (showExportMenu.value) {
    showExportMenu.value = false
    return
  }

  if (showSettingsMenu.value) {
    showSettingsMenu.value = false
    return
  }

  if (showPitchMode.value) {
    showPitchMode.value = false
    return
  }

  if (mapStore.zenMode) {
    mapStore.clearSelection()
    exitZenMode()
    return
  }

  if (mapStore.selectedIds.length > 0 || mapStore.focusedId) {
    mapStore.clearSelection()
  }
}

function handleGlobalClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (showExportMenu.value && !target.closest('.export-menu')) {
    showExportMenu.value = false
  }
  if (showSettingsMenu.value && !target.closest('.settings-menu')) {
    showSettingsMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

.tab-bar {
  flex-shrink: 0;
  overflow: hidden;
  max-height: 56px;
  transition: max-height 0.3s ease, opacity 0.25s ease, transform 0.25s ease;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 16px;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  overflow: hidden;
  max-height: 52px;
  transition: max-height 0.3s ease, opacity 0.25s ease, transform 0.25s ease, border-width 0.25s ease;
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

.editor-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  transition: height 0.3s ease;
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
  overflow: hidden;
  max-height: 28px;
  transition: max-height 0.3s ease, opacity 0.25s ease, transform 0.25s ease, border-width 0.25s ease;
}

.zen-active .tab-bar,
.zen-active .status-bar {
  opacity: 0;
  pointer-events: none;
  max-height: 0;
  transform: translateY(-8px);
  border-width: 0;
}

.zen-active.zen-deep .toolbar {
  opacity: 0;
  pointer-events: none;
  max-height: 0;
  transform: translateY(-8px);
  border-width: 0;
}

.zen-active.zen-deep .editor-area {
  height: 100vh;
}

.zen-active.zen-lite .toolbar {
  height: 46px;
  max-height: 46px;
  padding: 0 10px;
}

.zen-active.zen-lite .toolbar-left,
.zen-active.zen-lite .toolbar-center,
.zen-active.zen-lite .toolbar-right {
  gap: 2px;
}

.zen-floating-controls {
  position: fixed;
  right: 16px;
  top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(17, 24, 39, 0.78);
  color: #e5e7eb;
  backdrop-filter: blur(8px);
  z-index: 1001;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

.zen-badge {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: #cbd5e1;
}

.zen-action-btn {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(30, 41, 59, 0.6);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.zen-action-btn:hover {
  background: rgba(51, 65, 85, 0.9);
  border-color: rgba(148, 163, 184, 0.7);
}

.zen-exit-btn {
  border-color: rgba(248, 113, 113, 0.55);
  color: #fecaca;
}

.zen-float-enter-active,
.zen-float-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.zen-float-enter-from,
.zen-float-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 900px) {
  .zen-floating-controls {
    left: 12px;
    right: 12px;
    top: 10px;
    justify-content: space-between;
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toolbar,
  .tab-bar,
  .status-bar,
  .editor-area,
  .tool-btn,
  .zen-action-btn,
  .zen-float-enter-active,
  .zen-float-leave-active {
    transition: none !important;
  }
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-saved {
  color: #10b981;
}

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

.menu-section-title {
  padding: 6px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.menu-section-title:not(:first-child) {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.settings-menu {
  position: relative;
}

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

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toast.success {
  background: #10b981;
  color: white;
}

.toast.error {
  background: #ef4444;
  color: white;
}

.toast.info {
  background: #3b82f6;
  color: white;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 9998;
  color: white;
  font-size: 14px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
