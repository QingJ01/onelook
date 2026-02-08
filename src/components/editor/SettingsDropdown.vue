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
    
    <div class="settings-section">
      <label class="switch-row">
        <span>彩虹分支</span>
        <input 
          type="checkbox" 
          :checked="rainbowBranch" 
          @change="toggleRainbowBranch"
        />
      </label>
    </div>
    
    <div class="settings-divider"></div>
    
    <button class="about-btn" @click="showAbout = true">
      <Info :size="16" />
      <span>关于 OneLook</span>
    </button>
  </div>
  
  <!-- 关于弹窗 -->
  <Teleport to="body">
    <div v-if="showAbout" class="about-overlay" @click.self="showAbout = false">
      <div class="about-dialog">
        <div class="about-header">
          <img src="/logo.svg" alt="OneLook" class="about-logo" />
          <h2>OneLook 一目</h2>
          <span class="about-version">v0.2.2</span>
        </div>
        
        <p class="about-tagline">一目了然，思维如流</p>
        <p class="about-desc">极简、高效、现代化的 Web 端思维导图工具。数据完全本地存储，隐私无忧。</p>
        
        <div class="about-links">
          <a href="https://github.com/QingJ01/onelook" target="_blank" rel="noopener noreferrer">
            <Github :size="18" /> GitHub
          </a>
          <a href="https://onelookdocs.byebug.cn" target="_blank" rel="noopener noreferrer">
            <BookOpen :size="18" /> 使用手册
          </a>
        </div>
        
        <div class="about-footer">
          <p>Released under the MIT License</p>
          <p>© 2026 OneLook</p>
        </div>
        
        <button class="about-close" @click="showAbout = false">
          <X :size="18" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { GitBranch, Network, Fish, Users, Info, Github, BookOpen, X } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import type { LayoutType, ThemeType, ConnectionStyle } from '@/types'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const mapStore = useMapStore()
const showAbout = ref(false)

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

const rainbowBranch = computed(() => mapStore.document.rainbowBranch ?? false)

function toggleRainbowBranch() {
  mapStore.document.rainbowBranch = !mapStore.document.rainbowBranch
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
  z-index: 2000;
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

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
}

.switch-row input[type="checkbox"] {
  width: 36px;
  height: 20px;
  appearance: none;
  background: var(--color-bg-secondary);
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.switch-row input[type="checkbox"]::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.switch-row input[type="checkbox"]:checked {
  background: var(--color-primary);
}

.switch-row input[type="checkbox"]:checked::before {
  transform: translateX(16px);
}

.settings-divider {
  height: 1px;
  background: var(--color-border);
  margin: 12px 0;
}

.about-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all 0.15s ease;
}

.about-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

/* 关于弹窗 */
.about-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.about-dialog {
  position: relative;
  background: var(--color-bg);
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
}

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.about-logo {
  width: 64px;
  height: 64px;
}

.about-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.about-version {
  font-size: 12px;
  padding: 2px 8px;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
}

.about-tagline {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-primary);
  margin: 0 0 8px;
}

.about-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 24px;
}

.about-links {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
}

.about-links a {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  text-decoration: none;
  font-size: 14px;
  color: var(--color-text);
  transition: all 0.15s ease;
}

.about-links a:hover {
  background: var(--color-primary);
  color: white;
}

.about-footer {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.about-footer p {
  margin: 4px 0;
}

.about-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.15s ease;
}

.about-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}
</style>
