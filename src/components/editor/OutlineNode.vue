<template>
  <div class="outline-node" :style="{ paddingLeft: level * 16 + 'px' }">
    <div 
      class="node-row"
      :class="{ 
        selected: isSelected,
        root: level === 0 
      }"
      @click="$emit('select', node.id)"
      @dblclick.stop="startEdit"
    >
      <button 
        v-if="hasChildren"
        class="expand-btn"
        @click.stop="toggleExpand"
      >
        <ChevronRight :size="12" :class="{ rotated: node.isExpanded }" />
      </button>
      <span v-else class="expand-placeholder"></span>
      
      <!-- 编辑状态 -->
      <input 
        v-if="isEditing"
        ref="editInputRef"
        v-model="editText"
        class="edit-input"
        @blur="saveEdit"
        @keydown.enter="saveEdit"
        @keydown.esc="cancelEdit"
        @click.stop
      />
      <!-- 显示状态 -->
      <span v-else class="node-text" :title="node.text">{{ node.text }}</span>
      
      <span v-if="hasChildren && !isEditing" class="children-count">{{ node.children.length }}</span>
    </div>
    
    <template v-if="node.isExpanded && hasChildren">
      <OutlineNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        @select="$emit('select', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import type { MindMapNode } from '@/types'

const props = defineProps<{
  node: MindMapNode
  level: number
}>()

defineEmits<{
  select: [nodeId: string]
}>()

const mapStore = useMapStore()

const isSelected = computed(() => mapStore.focusedId === props.node.id)
const hasChildren = computed(() => props.node.children.length > 0)

// 编辑状态
const isEditing = ref(false)
const editText = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

function toggleExpand() {
  mapStore.toggleExpand(props.node.id)
}

function startEdit() {
  editText.value = props.node.text
  isEditing.value = true
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function saveEdit() {
  if (editText.value.trim() && editText.value !== props.node.text) {
    mapStore.updateNodeText(props.node.id, editText.value.trim())
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}
</script>

<style scoped>
.outline-node {
  user-select: none;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.node-row:hover {
  background: var(--color-bg-secondary);
}

.node-row.selected {
  background: rgba(59, 130, 246, 0.1);
}

.node-row.root .node-text {
  font-weight: 600;
  color: var(--color-primary);
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.expand-btn svg {
  transition: transform 0.15s ease;
}

.expand-btn svg.rotated {
  transform: rotate(90deg);
}

.expand-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.node-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.children-count {
  font-size: 10px;
  padding: 1px 5px;
  background: var(--color-bg-secondary);
  border-radius: 10px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.edit-input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: inherit;
  outline: none;
}
</style>
