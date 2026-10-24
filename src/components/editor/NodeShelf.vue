<template>
  <aside v-if="shelf.visible" class="node-shelf">
    <div class="shelf-header">
      <span>缓存栏</span>
      <span class="shelf-count">{{ shelf.items.length }}</span>
      <button class="shelf-clear" v-if="shelf.items.length > 0" title="清空" @click="clearShelf">✕</button>
    </div>

    <div class="shelf-body">
      <div v-if="shelf.items.length === 0" class="shelf-empty">
        布局模式下按 <kbd>y</kbd> 收集节点<br/>
        选中目标后按 <kbd>p</kbd> 依次建立绑定<br/>
        （绑定 = 实时更新的复制）
      </div>
      <div
        v-for="(item, index) in shelf.items"
        :key="item.id"
        class="shelf-item"
        :class="{ active: index === shelf.activeIndex }"
        :title="`${item.docName} · ${item.text}`"
        tabindex="0"
        @click="setActive(index)"
        @keydown.enter.prevent="setActive(index)"
      >
        <span class="shelf-text">{{ item.text }}</span>
        <span class="shelf-doc">{{ item.docName }}</span>
        <button class="shelf-remove" title="移除" @click.stop="removeFromShelf(index)">×</button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { shelf, setActive, removeFromShelf, clearShelf } from '@/services/shelf'
</script>

<style scoped>
.node-shelf {
  flex: none;
  width: 172px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.shelf-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

.shelf-count {
  display: inline-block;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  text-align: center;
  line-height: 14px;
}

.shelf-clear {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
}

.shelf-clear:hover {
  color: #dc2626;
  background: var(--color-bg-secondary);
}

.shelf-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.shelf-empty {
  padding: 14px 8px;
  font-size: 11px;
  line-height: 2;
  color: var(--color-text-secondary);
  text-align: center;
}

.shelf-empty kbd {
  display: inline-block;
  min-width: 16px;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--color-bg-secondary);
  font-family: inherit;
  font-size: 10px;
}

.shelf-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 18px 6px 8px;
  margin-bottom: 4px;
  border: 1px solid var(--color-border);
  border-left: 3px solid transparent;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}

.shelf-item:hover {
  border-color: var(--color-primary);
}

.shelf-item.active {
  border-left-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.shelf-text {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shelf-doc {
  color: var(--color-text-secondary);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shelf-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 2px;
  border-radius: 3px;
}

.shelf-remove:hover {
  color: #dc2626;
}
</style>
