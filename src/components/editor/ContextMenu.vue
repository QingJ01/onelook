<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      tabindex="-1"
      @click.stop
      @keydown="handleMenuKeydown"
    >
      <template v-if="nodeId">
        <button class="menu-item" @click="handleEdit">
          <Edit3 :size="14" />
          <span>编辑</span>
          <span class="shortcut">F2</span>
        </button>
        <button class="menu-item" @click="handleAddChild">
          <Plus :size="14" />
          <span>添加子节点</span>
          <span class="shortcut">Tab</span>
        </button>
        <button class="menu-item" @click="handleAddSibling">
          <CornerDownRight :size="14" />
          <span>添加同级节点</span>
          <span class="shortcut">Enter</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="handleAddTable">
          <Table :size="14" />
          <span>插入表格节点</span>
        </button>
        <button class="menu-item" @click="handleAddCode">
          <Code2 :size="14" />
          <span>插入代码块节点</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="handleYankShelf">
          <Inbox :size="14" />
          <span>放入缓存栏</span>
          <span class="shortcut">y</span>
        </button>
        <button class="menu-item" @click="handleCopyRef">
          <Link :size="14" />
          <span>复制节点引用</span>
        </button>
        <button class="menu-item" @click="handlePasteRef" :disabled="!canPasteRef">
          <Link2 :size="14" />
          <span>粘贴为引用节点</span>
          <span class="shortcut" v-if="lastCopiedRefName">{{ lastCopiedRefName }}</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="handleCopy">
          <Copy :size="14" />
          <span>复制（放入缓存栏）</span>
          <span class="shortcut">Ctrl+C</span>
        </button>
        <button class="menu-item" @click="handleCut">
          <Scissors :size="14" />
          <span>剪切（放入缓存栏）</span>
          <span class="shortcut">Ctrl+X</span>
        </button>
        <button class="menu-item" @click="handlePaste">
          <Clipboard :size="14" />
          <span>粘贴</span>
          <span class="shortcut">Ctrl+V</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="handleToggleExpand" v-if="hasChildren">
          <ChevronRight :size="14" :class="{ rotated: isExpanded }" />
          <span>{{ isExpanded ? '收起' : '展开' }}</span>
        </button>
        <button class="menu-item" @click="handleAddSummary" v-if="hasChildren && !hasSummary">
          <Braces :size="14" />
          <span>添加概要</span>
        </button>
        <button class="menu-item" @click="handleRemoveSummary" v-if="hasSummary">
          <Braces :size="14" />
          <span>删除概要</span>
        </button>
        <div class="menu-divider" v-if="!isRoot"></div>
        <button class="menu-item danger" @click="handleDelete" v-if="!isRoot">
          <Trash2 :size="14" />
          <span>删除</span>
          <span class="shortcut">Del</span>
        </button>
      </template>
      <template v-else>
        <button class="menu-item" @click="handlePaste">
          <Clipboard :size="14" />
          <span>粘贴</span>
          <span class="shortcut">Ctrl+V</span>
        </button>
      </template>
    </div>
    <div v-if="isOpen" class="context-overlay" @click="close"></div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  Edit3, Plus, CornerDownRight, Copy, Clipboard,
  ChevronRight, Trash2, Braces, Table, Code2, Link, Link2, Inbox, Scissors
} from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import { defaultCodeData, defaultCodeText, defaultTableData } from '@/utils/specialNodes'
import { copyNodeRef, createRefNode, pasteNodeRef } from '@/services/vault'
import { addToShelf } from '@/services/shelf'

const mapStore = useMapStore()

const isOpen = ref(false)
const x = ref(0)
const y = ref(0)
const nodeId = ref<string | null>(null)

const targetNode = computed(() => {
  if (!nodeId.value) return null
  return mapStore.findNode(nodeId.value)
})

const isRoot = computed(() => !targetNode.value?.parentId)
const hasChildren = computed(() => (targetNode.value?.children.length || 0) > 0)
const isExpanded = computed(() => targetNode.value?.isExpanded ?? true)
const hasSummary = computed(() => !!targetNode.value?.summary)

const emit = defineEmits<{
  edit: [nodeId: string]
}>()

function open(clientX: number, clientY: number, targetNodeId?: string) {
  refreshRefClipboardState()
  x.value = clientX
  y.value = clientY
  nodeId.value = targetNodeId || null
  isOpen.value = true
  // 键盘可达：打开后聚焦菜单容器与第一个可用项（m 键入口）
  nextTick(() => {
    const el = document.querySelector('.context-menu') as HTMLElement | null
    el?.focus()
    focusMenuItem(0)
  })
}

function focusMenuItem(index: number) {
  const items = Array.from(
    document.querySelectorAll('.context-menu .menu-item:not([disabled])')
  ) as HTMLElement[]
  if (items.length === 0) return
  const clamped = ((index % items.length) + items.length) % items.length
  items[clamped].focus()
}

function handleMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    const items = Array.from(
      document.querySelectorAll('.context-menu .menu-item:not([disabled])')
    ) as HTMLElement[]
    const current = items.indexOf(document.activeElement as HTMLElement)
    focusMenuItem(current + (event.key === 'ArrowDown' ? 1 : -1))
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
}

function close() {
  isOpen.value = false
  nodeId.value = null
}

function handleEdit() {
  if (nodeId.value) {
    emit('edit', nodeId.value)
  }
  close()
}

function handleAddChild() {
  if (nodeId.value) {
    mapStore.addChild(nodeId.value)
  }
  close()
}

function handleAddSibling() {
  if (nodeId.value) {
    mapStore.addSibling(nodeId.value)
  }
  close()
}

function handleAddTable() {
  if (nodeId.value) {
    const child = mapStore.addChild(nodeId.value, '表格')
    if (child) {
      child.data = { ...(child.data || {}), table: defaultTableData() }
      child.text = '表格'
    }
  }
  close()
}

function handleAddCode() {
  if (nodeId.value) {
    const child = mapStore.addChild(nodeId.value, defaultCodeText())
    if (child) {
      child.data = { ...(child.data || {}), code: defaultCodeData() }
    }
  }
  close()
}

// ---------- vault 引用 ----------

const canPasteRef = ref(false)
const lastCopiedRefName = ref('')

function refreshRefClipboardState() {
  const ref = pasteNodeRef()
  canPasteRef.value = ref !== null
  lastCopiedRefName.value = ref?.docName || ''
}

function handleYankShelf() {
  if (nodeId.value) {
    const node = mapStore.findNode(nodeId.value)
    if (node) {
      addToShelf(mapStore.document.id, node.id, mapStore.document.name, node.text)
    }
  }
  close()
}

function handleCopyRef() {
  if (nodeId.value) {
    const node = mapStore.findNode(nodeId.value)
    if (node) {
      copyNodeRef(mapStore.document, node)
    }
  }
  close()
}

async function handlePasteRef() {
  const targetId = nodeId.value
  close()
  const ref = pasteNodeRef()
  if (!targetId || !ref) return
  const created = await createRefNode(ref, targetId)
  if (!created) return
  const parent = mapStore.findNode(targetId)
  if (!parent) return
  parent.children.push(created.node)
  parent.isExpanded = true
  mapStore.document.updatedAt = Date.now()
}

function handleCopy() {
  if (nodeId.value) {
    mapStore.copyNode(nodeId.value)
    const node = mapStore.findNode(nodeId.value)
    if (node) addToShelf(mapStore.document.id, node.id, mapStore.document.name, node.text)
  }
  close()
}

function handleCut() {
  if (nodeId.value) {
    const node = mapStore.findNode(nodeId.value)
    if (node && node.parentId) {
      mapStore.copyNode(nodeId.value)
      addToShelf(mapStore.document.id, node.id, mapStore.document.name, node.text)
      mapStore.deleteNode(nodeId.value)
    }
  }
  close()
}

function handlePaste() {
  const targetId = nodeId.value || mapStore.document.root.id
  mapStore.pasteNode(targetId)
  close()
}

function handleToggleExpand() {
  if (nodeId.value) {
    mapStore.toggleExpand(nodeId.value)
  }
  close()
}

function handleDelete() {
  if (nodeId.value) {
    mapStore.deleteNode(nodeId.value)
  }
  close()
}

function handleAddSummary() {
  if (nodeId.value && targetNode.value) {
    const childCount = targetNode.value.children.length
    if (childCount > 0) {
      mapStore.setSummary(nodeId.value, '概要', 0, childCount - 1)
    }
  }
  close()
}

function handleRemoveSummary() {
  if (nodeId.value) {
    mapStore.removeSummary(nodeId.value)
  }
  close()
}

defineExpose({ open, close })
</script>

<style scoped>
.context-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 4px;
  animation: slideIn 0.1s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.menu-item {
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
  transition: background 0.1s ease;
}

.menu-item:hover {
  background: var(--color-bg-secondary);
}

.menu-item.danger {
  color: #ef4444;
}

.menu-item.danger:hover {
  background: #fef2f2;
}

.menu-item .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 8px;
}

.menu-item svg.rotated {
  transform: rotate(90deg);
}

.context-menu:focus,
.context-menu:focus-visible {
  outline: none;
}

.context-menu .menu-item:focus-visible {
  background: var(--color-bg-secondary);
}
</style>
