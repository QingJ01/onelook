<template>
  <Teleport to="body">
    <div v-if="isOpen" class="shortcuts-overlay" @click.self="close">
      <div class="shortcuts-panel">
        <div class="panel-header">
          <h3>快捷键</h3>
          <button class="close-btn" @click="close">
            <X :size="18" />
          </button>
        </div>
        
        <div class="shortcuts-content">
          <div v-for="group in shortcutGroups" :key="group.title" class="shortcut-group">
            <h4>{{ group.title }}</h4>
            <div class="shortcut-list">
              <div v-for="s in group.shortcuts" :key="s.keys" class="shortcut-item">
                <span class="shortcut-desc">{{ s.description }}</span>
                <span class="shortcut-keys">
                  <kbd v-for="(key, i) in s.keys.split('+')" :key="i">{{ key }}</kbd>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

const isOpen = ref(false)

const shortcutGroups = [
  {
    title: '通用',
    shortcuts: [
      { keys: 'Ctrl+K', description: '命令面板' },
      { keys: 'Ctrl+F', description: '搜索节点' },
      { keys: 'Ctrl+S', description: '保存文档' },
      { keys: 'Ctrl+Z', description: '撤销' },
      { keys: 'Ctrl+Y', description: '重做' },
    ],
  },
  {
    title: '节点操作',
    shortcuts: [
      { keys: 'Tab', description: '添加子节点' },
      { keys: 'Enter', description: '添加同级节点' },
      { keys: 'Delete', description: '删除节点' },
      { keys: 'F2', description: '编辑节点' },
      { keys: 'Space', description: '编辑节点' },
    ],
  },
  {
    title: '导航',
    shortcuts: [
      { keys: '↑', description: '上一个同级节点' },
      { keys: '↓', description: '下一个同级节点' },
      { keys: '←', description: '父节点' },
      { keys: '→', description: '第一个子节点' },
    ],
  },
  {
    title: '剪贴板',
    shortcuts: [
      { keys: 'Ctrl+C', description: '复制节点' },
      { keys: 'Ctrl+V', description: '粘贴节点' },
    ],
  },
]

function open() {
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

// 监听 ? 键打开面板，Esc 键关闭
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
    // 不在输入框中时才响应
    const target = event.target as HTMLElement
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
      event.preventDefault()
      open()
    }
  } else if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

defineExpose({ open, close })
</script>

<style scoped>
.shortcuts-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.shortcuts-panel {
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  background: var(--color-bg);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.panel-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.close-btn {
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
}

.close-btn:hover {
  background: var(--color-bg-secondary);
}

.shortcuts-content {
  padding: 16px 20px;
  overflow-y: auto;
  max-height: calc(80vh - 60px);
}

.shortcut-group {
  margin-bottom: 20px;
}

.shortcut-group:last-child {
  margin-bottom: 0;
}

.shortcut-group h4 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  margin: 0 0 10px 0;
  letter-spacing: 0.5px;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shortcut-desc {
  font-size: 14px;
  color: var(--color-text);
}

.shortcut-keys {
  display: flex;
  gap: 4px;
}

.shortcut-keys kbd {
  display: inline-block;
  padding: 3px 8px;
  font-size: 11px;
  font-family: inherit;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
}
</style>
