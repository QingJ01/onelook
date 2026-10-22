<template>
  <aside class="side-panel">
    <div class="panel-header">
      <span>节点属性</span>
      <button class="close-btn" @click="$emit('close')">
        <X :size="16" />
      </button>
    </div>
    
    <div class="panel-content" v-if="node">
      <!-- 基本信息 -->
      <div class="property-group">
        <label>节点文本</label>
        <input 
          type="text" 
          :value="node.text"
          @input="handleTextChange"
          placeholder="输入节点内容..." 
        />
      </div>
      
      <!-- 样式设置 -->
      <div class="property-group">
        <label>节点样式</label>
        <div class="style-row">
          <div class="style-item">
            <span class="style-label">背景色</span>
            <input 
              type="color" 
              :value="node.style?.background || '#f9fafb'"
              @input="handleStyleChange('background', $event)"
            />
          </div>
          <div class="style-item">
            <span class="style-label">文字色</span>
            <input 
              type="color" 
              :value="node.style?.color || '#1f2937'"
              @input="handleStyleChange('color', $event)"
            />
          </div>
          <div class="style-item">
            <span class="style-label">边框色</span>
            <input 
              type="color" 
              :value="node.style?.borderColor || '#e5e7eb'"
              @input="handleStyleChange('borderColor', $event)"
            />
          </div>
        </div>
        
        <div class="style-row mt-8">
          <div class="style-item flex-1">
            <span class="style-label">字号</span>
            <select 
              :value="node.style?.fontSize || 14"
              @change="handleStyleChange('fontSize', $event)"
            >
              <option :value="12">12px</option>
              <option :value="14">14px</option>
              <option :value="16">16px</option>
              <option :value="18">18px</option>
              <option :value="20">20px</option>
              <option :value="24">24px</option>
              <option :value="28">28px</option>
              <option :value="32">32px</option>
            </select>
          </div>
          <div class="style-item flex-1">
            <span class="style-label">粗细</span>
            <select 
              :value="node.style?.fontWeight || 'normal'"
              @change="handleStyleChange('fontWeight', $event)"
            >
              <option value="normal">常规</option>
              <option value="bold">加粗</option>
            </select>
          </div>
        </div>

        <div class="style-row mt-8">
          <div class="style-item flex-1">
            <span class="style-label">形状</span>
            <select 
              :value="node.style?.shape || 'rect'"
              @change="handleStyleChange('shape', $event)"
            >
              <option value="rect">矩形</option>
              <option value="round">圆角矩形</option>
              <option value="ellipse">椭圆</option>
              <option value="diamond">菱形</option>
            </select>
          </div>
        </div>
        
        <button class="reset-style-btn" @click="resetStyle">
          <RotateCcw :size="12" />
          重置样式
        </button>
      </div>
      
      <!-- 图片 -->
      <div class="property-group">
        <label>节点图片</label>
        <div class="image-input">
          <input 
            type="url" 
            :value="node.data?.image || ''"
            @input="handleImageChange"
            placeholder="输入图片 URL..." 
          />
          <button 
            v-if="node.data?.image"
            class="clear-btn"
            @click="clearImage"
            title="清除图片"
          >
            <X :size="14" />
          </button>
        </div>
        <div v-if="node.data?.image" class="image-preview">
          <img 
            v-if="!imageLoadError"
            :src="node.data.image"
            :style="imagePreviewStyle"
            @error="handleImageError" 
            @load="handleImageLoad($event)"
          />
          <div v-else class="image-error">图片加载失败</div>
        </div>
        <div v-if="node.data?.image" class="image-size-control">
          <div class="size-header">
            <span class="style-label">Width</span>
            <span class="size-value">{{ nodeImageWidth }}px</span>
          </div>
          <input
            type="range"
            :min="imageWidthMin"
            :max="imageWidthMax"
            step="10"
            :value="nodeImageWidth"
            @input="handleImageWidthChange"
          />
        </div>
      </div>
      
      <!-- 图标选择 -->
      <div class="property-group">
        <label>图标</label>
        <div class="icon-grid">
          <button 
            v-for="icon in iconList" 
            :key="icon.value"
            class="icon-btn"
            :class="{ active: node.data?.icon === icon.value }"
            @click="setIcon(icon.value)"
            :title="icon.label"
          >
            {{ icon.emoji }}
          </button>
          <button 
            class="icon-btn clear"
            @click="setIcon(undefined)"
            title="清除图标"
          >
            <X :size="12" />
          </button>
        </div>
      </div>
      
      <!-- 优先级 -->
      <div class="property-group">
        <label>优先级</label>
        <div class="priority-selector">
          <button 
            v-for="p in 9" 
            :key="p"
            class="priority-btn"
            :class="{ active: node.data?.priority === p }"
            @click="setPriority(p)"
          >
            {{ p }}
          </button>
          <button 
            class="priority-btn clear"
            @click="setPriority(undefined)"
          >
            <X :size="12" />
          </button>
        </div>
      </div>
      
      <!-- 进度 -->
      <div class="property-group">
        <label>进度</label>
        <div class="progress-selector">
          <input 
            type="range" 
            min="0" 
            max="100" 
            step="10"
            :value="node.data?.progress || 0"
            @input="handleProgressChange"
          />
          <span class="progress-value">{{ node.data?.progress || 0 }}%</span>
        </div>
      </div>
      
      <!-- 超链接 -->
      <div class="property-group">
        <label>超链接</label>
        <div class="link-input">
          <input 
            type="url" 
            :value="node.data?.hyperlink || ''"
            @input="handleLinkChange"
            placeholder="https://... 或 onelook://doc/..." 
          />
          <button 
            v-if="node.data?.hyperlink"
            class="link-btn"
            @click="openLink"
          >
            <ExternalLink :size="14" />
          </button>
        </div>
      </div>
      
      <!-- 备注 (支持 Markdown) -->
      <div class="property-group">
        <div class="label-row">
          <label>备注</label>
          <div class="note-tabs">
            <button 
              class="tab-btn" 
              :class="{ active: !showNotePreview }"
              @click="showNotePreview = false"
            >编辑</button>
            <button 
              class="tab-btn" 
              :class="{ active: showNotePreview }"
              @click="showNotePreview = true"
            >预览</button>
          </div>
        </div>
        <textarea 
          v-if="!showNotePreview"
          :value="node.data?.note || ''"
          @input="handleNoteChange"
          placeholder="支持 Markdown 格式..."
        ></textarea>
        <div 
          v-else 
          class="note-preview markdown-body"
          v-html="notePreviewHtml"
        ></div>
      </div>
      
      <!-- 概要 -->
      <div class="property-group" v-if="node.children && node.children.length > 0">
        <label>概要</label>
        <div v-if="node.summary" class="summary-edit">
          <input 
            type="text"
            :value="node.summary.text"
            @input="handleSummaryTextChange"
            placeholder="概要文本..."
          />
          <button class="remove-summary-btn" @click="removeSummary" title="删除概要">
            <X :size="14" />
          </button>
        </div>
        <button v-else class="add-summary-btn" @click="addSummary">
          + 添加概要
        </button>
      </div>

      <!-- vault 引用 -->
      <div class="property-group" v-if="isVaultRef">
        <label>引用自</label>
        <div class="vault-ref-info">
          <span>{{ node.data!.ref!.docName || '未知导图' }}</span>
          <button class="vault-ref-jump" @click="jumpToSource" title="跳到源节点">
            <ExternalLink :size="12" />
            跳转
          </button>
        </div>
        <p class="vault-ref-hint">负载与源节点双向同步；子节点各自本地。</p>
      </div>

      <!-- 反向引用（谁引用了这个节点） -->
      <div class="property-group" v-if="backlinks.length > 0">
        <label>反向引用 ({{ backlinks.length }})</label>
        <div
          v-for="link in backlinks"
          :key="link.docId + ':' + link.nodeId"
          class="backlink-item"
          @click="jumpToBacklink(link)"
          :title="`${link.docName} · ${link.nodeText}`"
        >
          <span class="backlink-doc">{{ link.docName }}</span>
          <span class="backlink-text">{{ link.nodeText }}</span>
        </div>
      </div>
    </div>
    
    <!-- 未选中状态 -->
    <div v-else class="empty-state">
      <Type :size="24" />
      <span>选择节点以编辑属性</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, ExternalLink, Type, RotateCcw } from 'lucide-vue-next'
import { renderMarkdown } from '@/utils/markdown'
import {
  NODE_IMAGE_WIDTH_MAX,
  NODE_IMAGE_WIDTH_MIN,
  normalizeNodeImageAspectRatio,
  normalizeNodeImageWidth,
} from '@/utils/nodeContentMetrics'
import type { MindMapNode, NodeStyle } from '@/types'
import { useMapStore } from '@/stores/mapStore'
import { isInternalReference, openInternalReference, makeInternalReference } from '@/services/references'
import { backlinksOf, refOf, type Backlink } from '@/services/vault'

const props = defineProps<{
  node: MindMapNode | null
}>()

defineEmits<{
  close: []
}>()

const mapStore = useMapStore()

// 备注预览状态
const showNotePreview = ref(false)
const imageLoadError = ref(false)

// ---------- vault 引用 / 反向引用 ----------

const isVaultRef = computed(() => (props.node ? refOf(props.node) !== null : false))
const backlinks = ref<Backlink[]>([])

watch(
  () => [props.node?.id, mapStore.document.id, mapStore.document.updatedAt],
  async () => {
    if (!props.node) {
      backlinks.value = []
      return
    }
    backlinks.value = await backlinksOf(mapStore.document.id, props.node.id)
  },
  { immediate: true },
)

async function jumpToSource() {
  const ref = props.node ? refOf(props.node) : null
  if (!ref) return
  await openInternalReference(makeInternalReference(ref.docId, ref.nodeId), mapStore)
}

async function jumpToBacklink(link: Backlink) {
  await openInternalReference(makeInternalReference(link.docId, link.nodeId), mapStore)
}

watch(
  () => props.node?.data?.image,
  () => {
    imageLoadError.value = false
  }
)

// Markdown 预览 HTML
const notePreviewHtml = computed(() => {
  if (!props.node?.data?.note) return '<p style="color: var(--color-text-secondary)">暂无备注</p>'
  return renderMarkdown(props.node.data.note)
})

// 图标列表
const nodeImageWidth = computed(() => normalizeNodeImageWidth(props.node?.data?.imageWidth))
const imagePreviewStyle = computed(() => ({
  width: `${nodeImageWidth.value}px`,
  maxWidth: '100%',
  objectFit: 'contain' as const,
}))
const imageWidthMin = NODE_IMAGE_WIDTH_MIN
const imageWidthMax = NODE_IMAGE_WIDTH_MAX

const iconList = [
  // 进度/状态
  { value: 'priority-1', emoji: '🔴', label: '最高优先级' },
  { value: 'priority-2', emoji: '🟠', label: '高优先级' },
  { value: 'priority-3', emoji: '🟡', label: '中优先级' },
  { value: 'check', emoji: '✅', label: '已完成' },
  { value: 'cross', emoji: '❌', label: '失败/拒绝' },
  { value: 'warning', emoji: '⚠️', label: '警告/注意' },
  
  // 标记
  { value: 'star', emoji: '⭐', label: '重点' },
  { value: 'flag', emoji: '🚩', label: '里程碑' },
  { value: 'fire', emoji: '🔥', label: '紧急' },
  { value: 'idea', emoji: '💡', label: '想法' },
  { value: 'question', emoji: '❓', label: '疑问' },
  { value: 'heart', emoji: '❤️', label: '喜爱' },

  // 办公/其它
  { value: 'calendar', emoji: '📅', label: '日程' },
  { value: 'time', emoji: '⏰', label: '截止时间' },
  { value: 'person', emoji: '👤', label: '负责人' },
  { value: 'group', emoji: '👥', label: '团队' },
  { value: 'link', emoji: '🔗', label: '链接' },
  { value: 'attach', emoji: '📎', label: '附件' },
  { value: 'chart', emoji: '📊', label: '数据' },
  { value: 'money', emoji: '💰', label: '预算/成本' },
  { value: 'search', emoji: '🔍', label: '调研' },
  { value: 'lock', emoji: '🔒', label: '锁定/隐私' },
  { value: 'tool', emoji: '🛠️', label: '工具/开发' },
  { value: 'bug', emoji: '🐛', label: 'Bug/问题' },
]

function handleTextChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (props.node) {
    mapStore.updateNodeText(props.node.id, target.value)
  }
}

function handleStyleChange(key: keyof NodeStyle, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  if (props.node) {
    let value: string | number = target.value
    if (key === 'fontSize') {
      value = parseInt(target.value)
    }
    mapStore.updateNodeStyle(props.node.id, { [key]: value })
  }
}

function resetStyle() {
  if (props.node) {
    mapStore.updateNodeStyle(props.node.id, {
      background: undefined,
      color: undefined,
      fontSize: undefined,
      fontWeight: undefined,
      shape: undefined,
      borderColor: undefined,
    })
  }
}

function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  const nextImage = target.value || undefined
  if (props.node) {
    mapStore.updateNodeData(props.node.id, {
      image: nextImage,
      imageAspectRatio: undefined,
    })
  }
}

function clearImage() {
  if (props.node) {
    mapStore.updateNodeData(props.node.id, {
      image: undefined,
      imageWidth: undefined,
      imageAspectRatio: undefined,
    })
  }
}

function handleImageError() {
  imageLoadError.value = true
}

function handleImageLoad(event: Event) {
  imageLoadError.value = false
  if (!props.node) return

  const target = event.target as HTMLImageElement | null
  if (!target || target.naturalWidth <= 0 || target.naturalHeight <= 0) return

  const ratio = Number(
    normalizeNodeImageAspectRatio(target.naturalHeight / target.naturalWidth).toFixed(3)
  )

  if (props.node.data?.imageAspectRatio !== ratio) {
    mapStore.updateNodeData(props.node.id, { imageAspectRatio: ratio })
  }
}

function handleImageWidthChange(event: Event) {
  const target = event.target as HTMLInputElement
  const width = normalizeNodeImageWidth(parseInt(target.value, 10))
  if (props.node) {
    mapStore.updateNodeData(props.node.id, { imageWidth: width })
  }
}

function setIcon(icon: string | undefined) {
  if (props.node) {
    mapStore.updateNodeData(props.node.id, { icon })
  }
}

function setPriority(priority: number | undefined) {
  if (props.node) {
    mapStore.updateNodeData(props.node.id, { priority })
  }
}

function handleProgressChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (props.node) {
    mapStore.updateNodeData(props.node.id, { progress: parseInt(target.value) })
  }
}

function handleLinkChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (props.node) {
    mapStore.updateNodeData(props.node.id, { hyperlink: target.value || undefined })
  }
}

function handleNoteChange(event: Event) {
  const target = event.target as HTMLTextAreaElement
  if (props.node) {
    mapStore.updateNodeData(props.node.id, { note: target.value || undefined })
  }
}

async function openLink() {
  const href = props.node?.data?.hyperlink
  if (!href) return

  if (isInternalReference(href)) {
    const result = await openInternalReference(href, mapStore)
    if (result !== 'ok') {
      window.alert(
        result === 'missing-document'
          ? '目标导图尚未导入到当前浏览器。请先导入被引用的 .olook 文件。'
          : '引用无效或目标节点不存在。',
      )
    }
    return
  }

  window.open(href, '_blank')
}

function addSummary() {
  if (props.node && props.node.children.length > 0) {
    mapStore.setSummary(props.node.id, '概要', 0, props.node.children.length - 1)
  }
}

function removeSummary() {
  if (props.node) {
    mapStore.removeSummary(props.node.id)
  }
}

function handleSummaryTextChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (props.node && props.node.summary) {
    mapStore.setSummary(
      props.node.id, 
      target.value || '概要', 
      0, 
      props.node.children.length - 1
    )
  }
}
</script>

<style scoped>
.side-panel {
  width: 300px;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
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
  flex-shrink: 0;
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
  margin-bottom: 20px;
}

.property-group label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.property-group input[type="text"],
.property-group input[type="url"],
.property-group textarea,
.property-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  transition: border-color 0.15s ease;
  font-family: inherit;
}

.property-group input:focus,
.property-group textarea:focus,
.property-group select:focus {
  border-color: var(--color-primary);
}

.property-group textarea {
  min-height: 80px;
  resize: vertical;
}

/* 样式编辑器 */
.style-row {
  display: flex;
  gap: 8px;
}

.style-row.mt-8 {
  margin-top: 8px;
}

.style-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.style-item.flex-1 {
  flex: 1;
}

.style-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.style-item input[type="color"] {
  width: 40px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  background: var(--color-bg);
}

.style-item select {
  padding: 6px 8px;
  font-size: 12px;
}

.reset-style-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  background: transparent;
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.reset-style-btn:hover {
  background: var(--color-bg-secondary);
}

/* 图片 */
.image-input {
  display: flex;
  gap: 8px;
}

.image-input input {
  flex: 1;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.clear-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.image-preview {
  margin-top: 8px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.image-preview img {
  display: block;
  max-height: 180px;
  margin: 0 auto;
  object-fit: contain;
}

.image-error {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.image-size-control {
  margin-top: 8px;
}

.size-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.size-value {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.image-size-control input[type="range"] {
  width: 100%;
  height: 4px;
  appearance: none;
  background: var(--color-border);
  border-radius: 2px;
  outline: none;
}

.image-size-control input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
}

/* 图标选择器 */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.05);
}

.icon-btn.active {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.1);
}

.icon-btn.clear {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* 优先级选择器 */
.priority-selector {
  display: flex;
  gap: 4px;
}

.priority-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.priority-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.priority-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.priority-btn.clear {
  margin-left: 4px;
}

/* 进度选择器 */
.progress-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-selector input[type="range"] {
  flex: 1;
  height: 4px;
  appearance: none;
  background: var(--color-border);
  border-radius: 2px;
  outline: none;
}

.progress-selector input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--color-primary);
  border-radius: 50%;
  cursor: pointer;
}

.progress-value {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 36px;
}

/* 链接输入 */
.link-input {
  display: flex;
  gap: 8px;
}

.link-input input {
  flex: 1;
}

.link-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.link-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* 空状态 */
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

/* 概要编辑 */
.summary-edit {
  display: flex;
  gap: 8px;
  align-items: center;
}

.summary-edit input {
  flex: 1;
}

.remove-summary-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #ef4444;
  background: #fef2f2;
  border-radius: 6px;
  color: #ef4444;
  cursor: pointer;
  transition: all 0.15s;
}

.remove-summary-btn:hover {
  background: #ef4444;
  color: white;
}

.add-summary-btn {
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--color-border);
  background: transparent;
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.add-summary-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: rgba(59, 130, 246, 0.05);
}

/* 备注标签切换 */
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.note-tabs {
  display: flex;
  gap: 4px;
}

.tab-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  background: transparent;
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.tab-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* Markdown 预览 */
.note-preview {
  min-height: 100px;
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.note-preview :deep(h1),
.note-preview :deep(h2),
.note-preview :deep(h3) {
  margin-top: 0.5em;
  margin-bottom: 0.3em;
  font-weight: 600;
}

.note-preview :deep(p) {
  margin: 0.5em 0;
}

.note-preview :deep(ul),
.note-preview :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.note-preview :deep(code) {
  background: rgba(0,0,0,0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.note-preview :deep(pre) {
  background: rgba(0,0,0,0.05);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}

.note-preview :deep(blockquote) {
  border-left: 3px solid var(--color-primary);
  padding-left: 12px;
  margin: 0.5em 0;
  color: var(--color-text-secondary);
}

/* ---------- vault 引用 / 反向引用 ---------- */

.vault-ref-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  font-size: 12px;
}

.vault-ref-jump {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-primary);
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
}

.vault-ref-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.backlink-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  margin-bottom: 4px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  overflow: hidden;
}

.backlink-item:hover {
  border-color: var(--color-primary);
}

.backlink-doc {
  flex: none;
  color: var(--color-primary);
  font-weight: 600;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backlink-text {
  flex: 1;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
