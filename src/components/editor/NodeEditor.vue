<template>
  <div
    v-if="isEditing"
    class="node-editor"
    :class="{ 'node-editor-code': mode === 'code' }"
    :style="editorStyle"
  >
    <!-- Markdown 工具栏 / 代码块语言栏 -->
    <div v-if="mode === 'code'" class="md-toolbar code-toolbar" @mousedown.prevent>
      <select
        class="lang-select"
        :value="language"
        @change="$emit('update:language', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="lang in CODE_LANGUAGES" :key="lang.value" :value="lang.value">
          {{ lang.label }}
        </option>
      </select>
      <span class="code-hint">⌘/Ctrl + Enter 保存</span>
    </div>
    <div v-else class="md-toolbar" @mousedown.prevent>
      <button class="toolbar-btn" @click="insertFormat('**', '**', '加粗')" title="加粗 (Ctrl+B)">B</button>
      <button class="toolbar-btn" @click="insertFormat('*', '*', '斜体')" title="斜体 (Ctrl+I)"><i>I</i></button>
      <button class="toolbar-btn" @click="insertFormat('~~', '~~', '删除线')" title="删除线">S̶</button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" @click="insertFormat('$', '$', 'x')" title="行内公式">∑</button>
      <button class="toolbar-btn" @click="showFormulaPanel = !showFormulaPanel" title="公式模板">f(x)</button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" @click="insertFormat('[', '](https://example.com)', '链接文字')" title="链接">🔗</button>
    </div>
    
    <!-- 公式模板面板 -->
    <div v-if="showFormulaPanel" class="formula-panel">
      <!-- 常用结构 -->
      <div class="formula-section">
        <div class="formula-title">常用结构</div>
        <div class="formula-grid">
          <button @click="insertFormula('\\frac{a}{b}')" title="分数">a/b</button>
          <button @click="insertFormula('\\sqrt{x}')" title="平方根">√x</button>
          <button @click="insertFormula('\\sqrt[n]{x}')" title="n次根">ⁿ√x</button>
          <button @click="insertFormula('x^{n}')" title="上标/指数">xⁿ</button>
          <button @click="insertFormula('x_{n}')" title="下标">xₙ</button>
          <button @click="insertFormula('x^{a}_{b}')" title="上下标">x_b^a</button>
        </div>
      </div>
      
      <!-- 求和与积分 -->
      <div class="formula-section">
        <div class="formula-title">求和 / 积分 / 极限</div>
        <div class="formula-grid">
          <button @click="insertFormula('\\sum_{i=1}^{n}')" title="求和">∑</button>
          <button @click="insertFormula('\\prod_{i=1}^{n}')" title="连乘">∏</button>
          <button @click="insertFormula('\\int_{a}^{b}')" title="定积分">∫</button>
          <button @click="insertFormula('\\iint')" title="二重积分">∬</button>
          <button @click="insertFormula('\\lim_{x \\to \\infty}')" title="极限">lim</button>
          <button @click="insertFormula('\\infty')" title="无穷">∞</button>
        </div>
      </div>
      
      <!-- 希腊字母 -->
      <div class="formula-section">
        <div class="formula-title">希腊字母</div>
        <div class="formula-grid small">
          <button @click="insertFormula('\\alpha')">α</button>
          <button @click="insertFormula('\\beta')">β</button>
          <button @click="insertFormula('\\gamma')">γ</button>
          <button @click="insertFormula('\\delta')">δ</button>
          <button @click="insertFormula('\\epsilon')">ε</button>
          <button @click="insertFormula('\\theta')">θ</button>
          <button @click="insertFormula('\\lambda')">λ</button>
          <button @click="insertFormula('\\mu')">μ</button>
          <button @click="insertFormula('\\pi')">π</button>
          <button @click="insertFormula('\\sigma')">σ</button>
          <button @click="insertFormula('\\omega')">ω</button>
          <button @click="insertFormula('\\Delta')">Δ</button>
        </div>
      </div>
      
      <!-- 运算符与关系 -->
      <div class="formula-section">
        <div class="formula-title">运算符 / 关系</div>
        <div class="formula-grid small">
          <button @click="insertFormula('\\pm')">±</button>
          <button @click="insertFormula('\\times')">×</button>
          <button @click="insertFormula('\\div')">÷</button>
          <button @click="insertFormula('\\cdot')">·</button>
          <button @click="insertFormula('\\neq')">≠</button>
          <button @click="insertFormula('\\leq')">≤</button>
          <button @click="insertFormula('\\geq')">≥</button>
          <button @click="insertFormula('\\approx')">≈</button>
          <button @click="insertFormula('\\equiv')">≡</button>
          <button @click="insertFormula('\\in')">∈</button>
          <button @click="insertFormula('\\subset')">⊂</button>
          <button @click="insertFormula('\\cup')">∪</button>
        </div>
      </div>
      
      <!-- 常用公式 -->
      <div class="formula-section">
        <div class="formula-title">常用公式模板</div>
        <div class="formula-list">
          <button @click="insertFormula('E = mc^2')">质能方程</button>
          <button @click="insertFormula('a^2 + b^2 = c^2')">勾股定理</button>
          <button @click="insertFormula('\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}')">求根公式</button>
          <button @click="insertFormula('f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}')">导数定义</button>
        </div>
      </div>
    </div>
    
    <!-- 编辑区 -->
    <textarea
      ref="textareaRef"
      v-model="editText"
      @blur="handleBlur"
      @keydown="handleKeyDown"
      :style="textareaStyle"
      placeholder="支持 Markdown 和 $LaTeX$"
    ></textarea>
    
    <!-- 实时预览 -->
    <div 
      v-if="editText && hasSpecialFormat"
      class="preview-hint"
      v-html="previewHtml"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { CODE_LANGUAGES } from '@/utils/highlight'

const props = defineProps<{
  isEditing: boolean
  text: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  panX: number
  panY: number
  mode?: 'text' | 'code'
  language?: string
}>()

const emit = defineEmits<{
  save: [text: string]
  cancel: []
  'update:language': [language: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const editText = ref('')
const showFormulaPanel = ref(false)

// 编辑器位置样式
const editorStyle = computed(() => {
  const screenX = props.x * props.scale + props.panX - (props.width * props.scale) / 2
  const screenY = props.y * props.scale + props.panY - (props.height * props.scale) / 2 - 40
  
  return {
    left: `${screenX}px`,
    top: `${screenY}px`,
    width: `${Math.max(props.width * props.scale, 220)}px`,
  }
})

// 文本框样式
const textareaStyle = computed(() => ({
  fontSize: `${14 * props.scale}px`,
  minHeight: `${Math.max(props.height * props.scale, 40)}px`,
}))

// 检查是否包含特殊格式
const hasSpecialFormat = computed(() => {
  return /\*|`|\$|~~|\[.*\]\(/.test(editText.value)
})

// 预览 HTML
const previewHtml = computed(() => {
  return renderMarkdown(editText.value)
})

// 监听编辑状态
watch(() => props.isEditing, async (isEditing) => {
  if (isEditing) {
    editText.value = props.text
    showFormulaPanel.value = false
    await nextTick()
    if (textareaRef.value) {
      textareaRef.value.focus()
      textareaRef.value.select()
    }
  }
})

// 插入格式
function insertFormat(prefix: string, suffix: string, placeholder?: string) {
  const textarea = textareaRef.value
  if (!textarea) return
  
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = editText.value
  const selected = text.substring(start, end) || placeholder || ''
  
  editText.value = text.substring(0, start) + prefix + selected + suffix + text.substring(end)
  
  nextTick(() => {
    textarea.focus()
    // 如果没有选中文本且有占位符，选中占位符
    if (start === end && placeholder) {
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length)
    } else {
      textarea.setSelectionRange(start + prefix.length + selected.length + suffix.length, start + prefix.length + selected.length + suffix.length)
    }
  })
}

// 插入公式模板（直接插入完整格式）
function insertFormula(formula: string) {
  const textarea = textareaRef.value
  if (!textarea) return
  
  const start = textarea.selectionStart
  const text = editText.value
  const fullFormula = '$' + formula + '$'
  
  editText.value = text.substring(0, start) + fullFormula + text.substring(start)
  
  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(start + fullFormula.length, start + fullFormula.length)
  })
  showFormulaPanel.value = false
}

function handleBlur(event: FocusEvent) {
  // 点击工具栏不触发保存
  const related = event.relatedTarget as HTMLElement
  if (related?.closest('.node-editor')) return
  saveAndClose()
}

function handleKeyDown(event: KeyboardEvent) {
  // IME 合成中的 Enter 是「上屏」不是「提交」；提前提交会拆掉 textarea，
  // 输入法随后补发的普通 Enter 落到 BODY，触发画布的添加同级节点
  if (event.isComposing || event.keyCode === 229) return
  const submit = props.mode === 'code'
    ? (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
    : (event.key === 'Enter' && !event.shiftKey)
  if (submit) {
    event.preventDefault()
    event.stopPropagation()
    saveAndClose()
  } else if (props.mode === 'code' && event.key === 'Enter' && !event.shiftKey) {
    // 代码模式：Enter 换行，不提交
    return
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
  } else if (event.ctrlKey && event.key === 'b') {
    event.preventDefault()
    insertFormat('**', '**')
  } else if (event.ctrlKey && event.key === 'i') {
    event.preventDefault()
    insertFormat('*', '*')
  }
}

function saveAndClose() {
  const trimmed = editText.value.trim()
  if (trimmed) {
    emit('save', trimmed)
  } else {
    emit('cancel')
  }
}
</script>

<style scoped>
.node-editor {
  position: absolute;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border: 2px solid var(--color-primary);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.25);
  overflow: visible;
}

.md-toolbar {
  display: flex;
  gap: 2px;
  padding: 6px 8px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  border-radius: 6px 6px 0 0;
}

.toolbar-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 13px;
  color: var(--color-text);
  transition: all 0.1s;
}

.toolbar-btn:hover {
  background: var(--color-primary);
  color: white;
}

.toolbar-divider {
  width: 1px;
  background: var(--color-border);
  margin: 4px 4px;
}

.formula-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  z-index: 10;
  max-height: 350px;
  overflow-y: auto;
}

.formula-section {
  margin-bottom: 12px;
}

.formula-section:last-child {
  margin-bottom: 0;
}

.formula-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.formula-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.formula-grid.small {
  grid-template-columns: repeat(6, 1fr);
}

.formula-grid button {
  padding: 6px 4px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.1s;
}

.formula-grid button:hover {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.formula-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.formula-list button {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.1s;
  text-align: left;
}

.formula-list button:hover {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.node-editor textarea {
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: 'Inter', system-ui, sans-serif;
  resize: none;
  outline: none;
}

.node-editor-code textarea {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.45;
  tab-size: 4;
  white-space: pre;
  overflow-x: auto;
}

.code-toolbar {
  justify-content: space-between;
  align-items: center;
}

.lang-select {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  outline: none;
}

.code-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.preview-hint {
  padding: 8px 12px;
  border-top: 1px dashed var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border-radius: 0 0 6px 6px;
  max-height: 60px;
  overflow: hidden;
}

.preview-hint :deep(p) {
  margin: 0;
}
</style>
