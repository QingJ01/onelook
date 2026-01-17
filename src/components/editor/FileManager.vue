<template>
  <div class="file-manager">
    <!-- 文件列表按钮 -->
    <button 
      class="file-list-btn"
      :class="{ active: isOpen }"
      @click="togglePanel"
      @contextmenu.prevent="handleHeaderContextMenu"
    >
      <FolderOpen :size="18" />
      <span class="file-name">{{ currentFileName }}</span>
      <ChevronDown :size="14" :class="{ rotated: isOpen }" />
    </button>
    
    <!-- 下拉面板 -->
    <div v-if="isOpen" class="file-panel">
      <div class="panel-header">
        <span>我的导图</span>
        <button class="new-btn" @click="handleNewDocument" title="新建导图">
          <Plus :size="16" />
        </button>
      </div>
      
      <div class="file-list">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="documents.length === 0" class="empty">
          暂无保存的导图
        </div>
        <div
          v-else
          v-for="doc in documents"
          :key="doc.id"
          class="file-item"
          :class="{ active: doc.id === currentDocId }"
          @click="handleSelectDocument(doc)"
          @contextmenu.prevent="handleItemContextMenu($event, doc)"
        >
          <div class="file-info">
            <span class="file-title">{{ doc.name }}</span>
            <span class="file-date">{{ formatDate(doc.updatedAt) }}</span>
          </div>
          <div class="file-actions">
            <button 
              class="action-btn"
              @click.stop="startRename(doc)"
              title="重命名"
            >
              <Edit3 :size="14" />
            </button>
            <button 
              class="action-btn danger"
              @click.stop="handleDeleteDocument(doc.id)"
              title="删除"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
      
      <!-- 当前导图名称编辑 -->
      <div class="current-doc-editor">
        <label>当前导图名称</label>
        <input 
          type="text" 
          :value="mapStore.document.name"
          @input="handleNameChange"
          @blur="handleSave"
          placeholder="输入导图名称..."
        />
      </div>
      
      <div class="panel-footer">
        <button class="save-btn" @click="handleSave">
          <Save :size="16" />
          <span>保存 (Ctrl+S)</span>
        </button>
      </div>
    </div>
    
    <!-- 右键菜单 -->
    <div 
      v-if="showContextMenu" 
      class="context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
    >
      <button @click="startRenameFromContext">
        <Edit3 :size="14" />
        <span>重命名</span>
      </button>
      <button @click="handleDuplicateDocument">
        <Copy :size="14" />
        <span>复制</span>
      </button>
      <div class="menu-divider"></div>
      <button class="danger" @click="handleDeleteFromContext">
        <Trash2 :size="14" />
        <span>删除</span>
      </button>
    </div>
    <div v-if="showContextMenu" class="context-overlay" @click="closeContextMenu"></div>
    
    <!-- 重命名对话框 -->
    <Teleport to="body">
      <div v-if="showRenameDialog" class="rename-overlay" @click.self="cancelRename">
        <div class="rename-dialog">
          <h4>重命名导图</h4>
          <input 
            ref="renameInputRef"
            v-model="renameValue"
            type="text"
            @keydown.enter="confirmRename"
            @keydown.escape="cancelRename"
          />
          <div class="rename-actions">
            <button class="cancel-btn" @click="cancelRename">取消</button>
            <button class="confirm-btn" @click="confirmRename">确定</button>
          </div>
        </div>
      </div>
      
      <!-- 删除确认对话框 -->
      <div v-if="showDeleteDialog" class="delete-overlay" @click.self="cancelDelete">
        <div class="delete-dialog">
          <div class="delete-icon">
            <Trash2 :size="32" />
          </div>
          <h4>删除导图</h4>
          <p class="delete-message">确定要删除 "<strong>{{ deleteDocName }}</strong>" 吗？此操作无法撤销。</p>
          <div class="delete-actions">
            <button class="dialog-cancel-btn" @click="cancelDelete">取消</button>
            <button 
              class="dialog-delete-btn" 
              @click="confirmDelete"
              style="padding: 10px 24px; border: none; background: #ef4444; border-radius: 8px; font-size: 14px; font-weight: 500; color: white; cursor: pointer;"
            >删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { FolderOpen, ChevronDown, Plus, Trash2, Save, Edit3, Copy } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import { documentService } from '@/services/db'
import type { MindMapDocument } from '@/types'

const mapStore = useMapStore()

const isOpen = ref(false)
const loading = ref(false)
const documents = ref<MindMapDocument[]>([])

// 右键菜单状态
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuDoc = ref<MindMapDocument | null>(null)

// 重命名对话框
const showRenameDialog = ref(false)
const renameValue = ref('')
const renameDocId = ref<string | null>(null)
const renameInputRef = ref<HTMLInputElement | null>(null)

// 删除对话框
const showDeleteDialog = ref(false)
const deleteDocId = ref<string | null>(null)
const deleteDocName = ref('')

const currentFileName = computed(() => mapStore.fileName)
const currentDocId = computed(() => mapStore.document.id)

// 加载文档列表
async function loadDocuments() {
  loading.value = true
  try {
    documents.value = await documentService.getAll()
  } finally {
    loading.value = false
  }
}

// 切换面板
function togglePanel() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    loadDocuments()
  }
}

// 格式化日期
function formatDate(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  
  return date.toLocaleDateString('zh-CN')
}

// 新建文档
async function handleNewDocument() {
  // 保存当前文档
  await handleSave()
  // 获取所有文档名称，找到最小可用序号
  const allDocs = await documentService.getAll()
  const existingNames = allDocs.map(d => d.name)
  const newName = mapStore.getNextAvailableName(existingNames)
  // 新建文档
  mapStore.newDocument(newName)
  // 立即保存新文档到数据库
  const newDoc = JSON.parse(JSON.stringify(mapStore.document))
  await documentService.save(newDoc)
  // 刷新列表
  await loadDocuments()
  isOpen.value = false
}

// 选择文档
async function handleSelectDocument(doc: MindMapDocument) {
  if (doc.id === currentDocId.value) {
    isOpen.value = false
    return
  }
  
  await handleSave()
  mapStore.loadDocument(doc)
  isOpen.value = false
}

// 删除文档 - 显示确认对话框
function handleDeleteDocument(docId: string, docName?: string) {
  deleteDocId.value = docId
  deleteDocName.value = docName || documents.value.find(d => d.id === docId)?.name || '未命名导图'
  showDeleteDialog.value = true
}

// 确认删除
async function confirmDelete() {
  if (!deleteDocId.value) return
  
  try {
    const deletingCurrentDoc = deleteDocId.value === currentDocId.value
    
    await documentService.delete(deleteDocId.value)
    await loadDocuments()
    
    // 如果删除的是当前导图，需要切换
    if (deletingCurrentDoc) {
      if (documents.value.length > 0) {
        // 还有其他导图，切换到第一个
        mapStore.loadDocument(JSON.parse(JSON.stringify(documents.value[0])))
      } else {
        // 所有导图都删完了，新建一个
        const newName = mapStore.getNextAvailableName([])
        mapStore.newDocument(newName)
        // 保存新文档
        const newDoc = JSON.parse(JSON.stringify(mapStore.document))
        await documentService.save(newDoc)
        await loadDocuments()
      }
    }
  } finally {
    cancelDelete()
  }
}

// 取消删除
function cancelDelete() {
  showDeleteDialog.value = false
  deleteDocId.value = null
  deleteDocName.value = ''
}

// 手动保存
async function handleSave() {
  const docToSave = JSON.parse(JSON.stringify(mapStore.document))
  await documentService.save(docToSave)
  await loadDocuments()
}

// 处理名称变更
function handleNameChange(event: Event) {
  const target = event.target as HTMLInputElement
  mapStore.document.name = target.value
  mapStore.document.updatedAt = Date.now()
}

// 右键菜单
function handleHeaderContextMenu(event: MouseEvent) {
  contextMenuDoc.value = null
  startRename({ id: currentDocId.value, name: mapStore.document.name } as MindMapDocument)
}

function handleItemContextMenu(event: MouseEvent, doc: MindMapDocument) {
  showContextMenu.value = true
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuDoc.value = doc
}

function closeContextMenu() {
  showContextMenu.value = false
  contextMenuDoc.value = null
}

// 重命名相关
function startRename(doc: MindMapDocument) {
  renameDocId.value = doc.id
  renameValue.value = doc.name
  showRenameDialog.value = true
  closeContextMenu()
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function startRenameFromContext() {
  if (contextMenuDoc.value) {
    startRename(contextMenuDoc.value)
  }
}

async function confirmRename() {
  if (!renameDocId.value || !renameValue.value.trim()) return
  
  if (renameDocId.value === currentDocId.value) {
    // 当前文档直接修改
    mapStore.document.name = renameValue.value.trim()
    await handleSave()
  } else {
    // 其他文档需要获取并修改
    const doc = documents.value.find(d => d.id === renameDocId.value)
    if (doc) {
      doc.name = renameValue.value.trim()
      doc.updatedAt = Date.now()
      await documentService.save(doc)
      await loadDocuments()
    }
  }
  
  cancelRename()
}

function cancelRename() {
  showRenameDialog.value = false
  renameDocId.value = null
  renameValue.value = ''
}

// 复制文档
async function handleDuplicateDocument() {
  if (!contextMenuDoc.value) return
  
  const doc = JSON.parse(JSON.stringify(contextMenuDoc.value))
  doc.id = crypto.randomUUID()
  doc.name = doc.name + ' (副本)'
  doc.createdAt = Date.now()
  doc.updatedAt = Date.now()
  
  await documentService.save(doc)
  await loadDocuments()
  closeContextMenu()
}

function handleDeleteFromContext() {
  if (contextMenuDoc.value) {
    handleDeleteDocument(contextMenuDoc.value.id)
  }
  closeContextMenu()
}

// 全局快捷键 Ctrl+S
function handleKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === 's') {
    event.preventDefault()
    handleSave()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.file-manager {
  position: relative;
}

.file-list-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--color-text);
  font-size: 14px;
}

.file-list-btn:hover {
  border-color: var(--color-primary);
}

.file-list-btn.active {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.05);
}

.file-list-btn .file-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-list-btn svg.rotated {
  transform: rotate(180deg);
}

.file-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 280px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  z-index: 100;
  overflow: hidden;
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

.new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-primary);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.new-btn:hover {
  background: var(--color-primary-hover);
}

.file-list {
  max-height: 240px;
  overflow-y: auto;
}

.loading,
.empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.file-item:hover {
  background: var(--color-bg-secondary);
}

.file-item.active {
  background: rgba(59, 130, 246, 0.1);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-title {
  display: block;
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-date {
  display: block;
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
}

.file-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: none;
  background: var(--color-primary);
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.save-btn:hover {
  background: var(--color-primary-hover);
}

/* 文件操作按钮 */
.file-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.file-item:hover .file-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.action-btn.danger:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* 当前导图编辑器 */
.current-doc-editor {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}

.current-doc-editor label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.current-doc-editor input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-bg);
}

.current-doc-editor input:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* 右键菜单 */
.context-overlay {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.context-menu {
  position: fixed;
  z-index: 200;
  min-width: 140px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 4px;
}

.context-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  text-align: left;
}

.context-menu button:hover {
  background: var(--color-bg-secondary);
}

.context-menu button.danger {
  color: #ef4444;
}

.context-menu button.danger:hover {
  background: #fef2f2;
}

.menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 8px;
}

/* 重命名对话框 */
.rename-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.rename-dialog {
  width: 320px;
  background: var(--color-bg);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
}

.rename-dialog h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.rename-dialog input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-bg);
}

.rename-dialog input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.cancel-btn,
.confirm-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cancel-btn {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
}

.cancel-btn:hover {
  background: var(--color-bg-secondary);
}

.confirm-btn {
  border: none;
  background: var(--color-primary);
  color: white;
}

.confirm-btn:hover {
  background: var(--color-primary-hover);
}

/* 删除确认对话框 */
.delete-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.delete-dialog {
  width: 360px;
  background: var(--color-bg);
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
  text-align: center;
  animation: scaleIn 0.2s ease;
}

@keyframes scaleIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.delete-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  background: #fef2f2;
  border-radius: 50%;
  color: #ef4444;
}

.delete-dialog h4 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.delete-message {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.delete-message strong {
  color: var(--color-text);
}

.delete-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.delete-actions .cancel-btn,
.dialog-cancel-btn {
  padding: 10px 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
}

.dialog-delete-btn:hover {
  background: #dc2626 !important;
}
</style>
