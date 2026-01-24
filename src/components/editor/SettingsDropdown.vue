<template>
  <div class="settings-dropdown" v-if="isOpen">
    <div class="settings-section">
      <div class="section-title">主题</div>
      <div class="theme-options">
        <button 
          v-for="t in themes" 
          :key="t.value"
          class="theme-btn"
          :class="{ active: currentTheme === t.value }"
          @click="setTheme(t.value)"
        >
          <span class="theme-preview" :style="{ background: t.color }"></span>
          <span>{{ t.label }}</span>
        </button>
      </div>
    </div>
    
    <div class="settings-section">
      <div class="section-title">布局</div>
      <div class="layout-options">
        <button 
          v-for="l in layouts" 
          :key="l.value"
          class="layout-btn"
          :class="{ active: currentLayout === l.value }"
          @click="setLayout(l.value)"
        >
          <component :is="l.icon" :size="18" />
          <span>{{ l.label }}</span>
        </button>
      </div>
    </div>
    
    <div class="settings-section">
      <div class="section-title">连线样式</div>
      <div class="layout-options">
        <button 
          v-for="c in connectionStyles" 
          :key="c.value"
          class="layout-btn"
          :class="{ active: currentConnectionStyle === c.value }"
          @click="setConnectionStyle(c.value)"
        >
          <span>{{ c.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { GitBranch, Network, Fish, Users } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import type { LayoutType, ThemeType, ConnectionStyle } from '@/types'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const mapStore = useMapStore()

const themes = [
  { value: 'light' as ThemeType, label: '亮色', color: '#ffffff' },
  { value: 'dark' as ThemeType, label: '暗色', color: '#1e1e2e' },
  { value: 'fresh' as ThemeType, label: '清新', color: '#10b981' },
]

const layouts = [
  { value: 'mind' as LayoutType, label: '思维导图', icon: Network },
  { value: 'tree' as LayoutType, label: '树形', icon: GitBranch },
  { value: 'fishbone' as LayoutType, label: '鱼骨图', icon: Fish },
  { value: 'org' as LayoutType, label: '组织架构', icon: Users },
]

const connectionStyles = [
  { value: 'curve' as ConnectionStyle, label: '曲线' },
  { value: 'straight' as ConnectionStyle, label: '直线' },
  { value: 'polyline' as ConnectionStyle, label: '折线' },
]

const currentTheme = computed(() => mapStore.theme)
const currentLayout = computed(() => mapStore.layout)
const currentConnectionStyle = computed(() => mapStore.document.connectionStyle || 'curve')

function setTheme(theme: ThemeType) {
  mapStore.setTheme(theme)
  document.documentElement.setAttribute('data-theme', theme)
}

function setLayout(layout: LayoutType) {
  mapStore.setLayout(layout)
  emit('close')
}

function setConnectionStyle(style: ConnectionStyle) {
  mapStore.document.connectionStyle = style
  mapStore.document.updatedAt = Date.now()
}

// 初始化主题
watch(() => mapStore.theme, (theme) => {
  document.documentElement.setAttribute('data-theme', theme)
}, { immediate: true })
</script>

<style scoped>
.settings-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  padding: 12px;
  min-width: 200px;
  z-index: 100;
}

.settings-section {
  margin-bottom: 12px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.theme-options {
  display: flex;
  gap: 6px;
}

.theme-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.theme-btn:hover {
  border-color: var(--color-primary);
}

.theme-btn.active {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.05);
  color: var(--color-primary);
}

.theme-preview {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
}

.layout-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.layout-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  transition: all 0.15s ease;
}

.layout-btn:hover {
  background: var(--color-bg-secondary);
}

.layout-btn.active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary);
}
</style>
