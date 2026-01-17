<template>
  <Teleport to="body">
    <div 
      v-if="isOpen"
      class="context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @click.stop
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
        <button class="menu-item" @click="handleCopy">
          <Copy :size="14" />
          <span>复制</span>
          <span class="shortcut">Ctrl+C</span>
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
import { ref, computed } from 'vue'
import { 
  Edit3, Plus, CornerDownRight, Copy, Clipboard, 
  ChevronRight, Trash2, Braces 
} from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'

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
  x.value = clientX
  y.value = clientY
  nodeId.value = targetNodeId || null
  isOpen.value = true
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

function handleCopy() {
  if (nodeId.value) {
    mapStore.copyNode(nodeId.value)
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
</style>
