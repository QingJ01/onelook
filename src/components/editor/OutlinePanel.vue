<template>
  <aside class="outline-panel">
    <div class="panel-header">
      <span>大纲</span>
      <button class="collapse-btn" @click="$emit('close')" title="关闭">
        <X :size="16" />
      </button>
    </div>
    
    <div class="outline-content">
      <div class="outline-tree">
        <OutlineNode 
          :node="mapStore.document.root" 
          :level="0"
          @select="handleSelect"
        />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import OutlineNode from './OutlineNode.vue'

const mapStore = useMapStore()

defineEmits<{
  close: []
}>()

function handleSelect(nodeId: string) {
  mapStore.selectNode(nodeId)
}
</script>

<style scoped>
.outline-panel {
  width: 260px;
  background: var(--color-bg);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
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
  color: var(--color-text);
}

.collapse-btn {
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

.collapse-btn:hover {
  background: var(--color-bg-secondary);
}

.outline-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.outline-tree {
  font-size: 13px;
}
</style>
