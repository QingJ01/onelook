<template>
  <Teleport to="body">
    <div v-if="isActive" class="pitch-mode" :class="pitchTheme" @keydown="handleKeyDown" tabindex="0" ref="containerRef">
      <!-- 画布容器 -->
      <svg 
        class="pitch-canvas"
        :viewBox="viewBox"
        ref="svgRef"
        @click="handleCanvasClick"
      >
        <defs>
          <filter id="pitch-shadow-dark" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.3"/>
          </filter>
          <filter id="pitch-shadow-light" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#94a3b8" flood-opacity="0.15"/>
          </filter>
        </defs>
        
        <g :transform="`translate(${cameraX}, ${cameraY}) scale(${cameraScale})`" class="camera-group">
          <!-- 连接线 -->
          <g class="connections">
            <path
              v-for="conn in connections"
              :key="conn.id"
              :d="conn.path"
              class="connection"
              :class="{ dimmed: !isNodeVisible(conn.toId) }"
              :stroke="conn.color"
            />
          </g>
          
          <!-- 节点 -->
          <g 
            v-for="node in layoutNodes" 
            :key="node.id"
            class="pitch-node"
            :class="{ 
              active: node.id === currentStep?.nodeId,
              dimmed: !isNodeVisible(node.id),
              visible: isNodeVisible(node.id)
            }"
            :transform="`translate(${node.x}, ${node.y})`"
          >
            <rect 
              :x="-node.width / 2" 
              :y="-node.height / 2"
              :width="node.width" 
              :height="node.height"
              rx="8"
              class="node-bg"
              :style="getNodeStyle(node)"
              :filter="mapStore.theme === 'dark' ? 'url(#pitch-shadow-dark)' : 'url(#pitch-shadow-light)'"
            />
            <foreignObject
              :x="-node.width / 2"
              :y="-node.height / 2"
              :width="node.width"
              :height="node.height"
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                class="node-content"
                :style="getNodeTextStyle(node)"
                v-html="renderMarkdown(node.node.text)"
              ></div>
            </foreignObject>
          </g>
        </g>
      </svg>
      
      <!-- 激光笔 -->
      <div 
        v-if="laserEnabled" 
        class="laser-pointer"
        :style="{ left: laserPos.x + 'px', top: laserPos.y + 'px' }"
      ></div>
      
      <!-- HUD 控制台 -->
      <Transition name="fade">
        <div v-show="showHUD" class="pitch-hud">
          <div class="hud-left">
            <span class="timer">{{ formattedTime }}</span>
          </div>
          <div class="hud-center">
            <button class="hud-btn" @click="prevStep" :disabled="stepIndex <= 0">
              <ChevronLeft :size="24" />
            </button>
            <span class="step-indicator">{{ stepIndex + 1 }} / {{ steps.length }}</span>
            <button class="hud-btn" @click="nextStep" :disabled="stepIndex >= steps.length - 1">
              <ChevronRight :size="24" />
            </button>
          </div>
          <div class="hud-right">
            <button class="hud-btn hud-toggle" @click="toggleRevealMode" :title="revealModeTitle">
              {{ revealModeLabel }}
            </button>
            <button 
              class="hud-btn" 
              :class="{ active: laserEnabled }"
              @click="laserEnabled = !laserEnabled"
              title="激光笔"
            >
              <Pointer :size="20" />
            </button>
            <button class="hud-btn" @click="exitPitch" title="退出 (Esc)">
              <X :size="20" />
            </button>
          </div>
        </div>
      </Transition>
      
      <!-- 进度条 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ChevronLeft, ChevronRight, X, Pointer } from 'lucide-vue-next'
import { useMapStore } from '@/stores/mapStore'
import { MindMapLayout, generateConnectionPath, type LayoutNode } from '@/core/layout/mindLayout'
import { TreeLayout, OrgLayout, FishboneLayout } from '@/core/layout/layouts'
import { renderMarkdown } from '@/utils/markdown'

interface SlideStep {
  nodeId: string
  type: 'overviewAll' | 'focus'
  visibleIds: string[]
}

const props = defineProps<{
  isActive: boolean
}>()

const emit = defineEmits<{
  exit: []
}>()

const mapStore = useMapStore()
const containerRef = ref<HTMLDivElement>()
const svgRef = ref<SVGSVGElement>()

// 状态
const stepIndex = ref(0)
const showHUD = ref(true)
const laserEnabled = ref(false)
const laserPos = ref({ x: 0, y: 0 })
const revealMode = ref<'progressive' | 'all'>('progressive')
const startTime = ref(0)
const elapsedTime = ref(0)
let timerInterval: number | null = null
let hudTimeout: number | null = null

// 相机状态
const cameraX = ref(0)
const cameraY = ref(0)
const cameraScale = ref(1)

// 布局数据
const layoutRoot = ref<LayoutNode | null>(null)
const layoutNodes = ref<LayoutNode[]>([])

// 彩虹色板
const RAINBOW_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'
]

// 计算布局
const layoutOptions = { horizontalGap: 100, verticalGap: 32 }

function getLayoutInstance() {
  const layoutType = mapStore.document.layout
  switch (layoutType) {
    case 'tree':
      return new TreeLayout(layoutOptions)
    case 'org':
      return new OrgLayout(layoutOptions)
    case 'fishbone':
      return new FishboneLayout(layoutOptions)
    default:
      return new MindMapLayout(layoutOptions)
  }
}

function computeLayout() {
  const layout = getLayoutInstance()
  layoutRoot.value = layout.layout(mapStore.document.root, 0, 0)
  layoutNodes.value = layoutRoot.value ? layout.flatten(layoutRoot.value) : []
}

// 生成演示步骤
const steps = computed<SlideStep[]>(() => {
  if (!layoutRoot.value) return []
  
  const result: SlideStep[] = []
  const root = layoutRoot.value
  const allIds = layoutNodes.value.map(node => node.id)
  
  // 首图：显示全部
  result.push({
    nodeId: root.id,
    type: 'overviewAll',
    visibleIds: allIds
  })

  if (revealMode.value === 'all') {
    return result
  }

  // 之后从中心主题开始
  result.push({
    nodeId: root.id,
    type: 'focus',
    visibleIds: [root.id]
  })

  // 按分支优先逐个展示（先子节点后同级）
  const order: LayoutNode[] = []
  const traverse = (node: LayoutNode) => {
    for (const child of node.children) {
      order.push(child)
      traverse(child)
    }
  }
  traverse(root)

  const visible = new Set<string>([root.id])
  for (const node of order) {
    visible.add(node.id)
    result.push({
      nodeId: node.id,
      type: 'focus',
      visibleIds: Array.from(visible)
    })
  }

  return result
})

const currentStep = computed(() => steps.value[stepIndex.value])

const revealModeLabel = computed(() => revealMode.value === 'progressive' ? '逐步' : '全图')
const revealModeTitle = computed(() => revealMode.value === 'progressive' ? '逐步演示' : '全图浏览')
const pitchTheme = computed(() => mapStore.theme === 'dark' ? 'pitch-dark' : 'pitch-light')

// 连接线数据 + 节点分支颜色映射
const nodeBranchColors = ref<Map<string, string>>(new Map())

const connections = computed(() => {
  const result: { id: string; path: string; color: string; toId: string }[] = []
  const colorMap = new Map<string, string>()
  const useRainbow = mapStore.document.rainbowBranch ?? false
  
  const traverse = (node: LayoutNode, branchColor: string) => {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      const color = useRainbow
        ? (!node.node.parentId ? RAINBOW_COLORS[i % RAINBOW_COLORS.length] : branchColor)
        : '#64748b'
      colorMap.set(child.id, color)
      result.push({
        id: `${node.id}-${child.id}`,
        path: generateConnectionPath(
          { x: node.x, y: node.y, width: node.width },
          { x: child.x, y: child.y, width: child.width },
          'curve'
        ),
        color,
        toId: child.id
      })
      traverse(child, color)
    }
  }
  
  if (layoutRoot.value) traverse(layoutRoot.value, RAINBOW_COLORS[0])
  nodeBranchColors.value = colorMap
  return result
})

function getNodeTextStyle(node: LayoutNode): Record<string, string> {
  const style: Record<string, string> = {}
  if (node.node.style?.fontSize) {
    style.fontSize = `${node.node.style.fontSize}px`
  }
  if (node.node.style?.fontWeight === 'bold') {
    style.fontWeight = '700'
  }
  if (node.node.style?.color) {
    style.color = node.node.style.color
  }
  return style
}

function getNodeStyle(node: LayoutNode): Record<string, string> {
  const style: Record<string, string> = {}
  // 优先使用用户自定义边框色，其次使用彩虹分支色
  if (node.node.style?.borderColor) {
    style.stroke = node.node.style.borderColor
  } else if (mapStore.document.rainbowBranch && nodeBranchColors.value.has(node.id)) {
    style.stroke = nodeBranchColors.value.get(node.id)!
  }
  if (node.node.style?.background) {
    style.fill = node.node.style.background
  }
  return style
}

// 判断节点是否可见
function isNodeVisible(nodeId: string): boolean {
  return currentStep.value?.visibleIds.includes(nodeId) ?? false
}

function toggleRevealMode() {
  revealMode.value = revealMode.value === 'progressive' ? 'all' : 'progressive'
  stepIndex.value = 0
}

// 相机变换
const viewBox = ref('0 0 1920 1080')

// 计算布局边界并设置 viewBox
function updateViewBox() {
  if (layoutNodes.value.length === 0) return
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of layoutNodes.value) {
    minX = Math.min(minX, node.x - node.width / 2)
    maxX = Math.max(maxX, node.x + node.width / 2)
    minY = Math.min(minY, node.y - node.height / 2)
    maxY = Math.max(maxY, node.y + node.height / 2)
  }
  
  const padding = 200
  const w = maxX - minX + padding * 2
  const h = maxY - minY + padding * 2
  
  viewBox.value = `${minX - padding} ${minY - padding} ${w} ${h}`
}

// 飞向节点
function flyToNode(nodeId: string) {
  const node = layoutNodes.value.find(n => n.id === nodeId)
  if (!node || !svgRef.value) return
  
  // 获取 SVG 实际尺寸
  const rect = svgRef.value.getBoundingClientRect()
  const svgWidth = rect.width
  const svgHeight = rect.height
  
  // 解析当前 viewBox
  const vbParts = viewBox.value.split(' ').map(Number)
  const vbX = vbParts[0], vbY = vbParts[1], vbW = vbParts[2], vbH = vbParts[3]
  
  // 计算缩放：让节点占据视图的合适比例
  const nodeSize = Math.max(node.width, node.height)
  const targetScale = Math.min(3, Math.max(0.8, Math.min(svgWidth, svgHeight) * 0.3 / nodeSize))
  
  // 计算平移：将节点居中（在 viewBox 坐标系中）
  const centerX = vbX + vbW / 2
  const centerY = vbY + vbH / 2
  // 简化：直接计算将节点移到中心的偏移
  cameraScale.value = targetScale
  cameraX.value = centerX - node.x * targetScale
  cameraY.value = centerY - node.y * targetScale
}

function flyToStep(step: SlideStep | undefined) {
  if (!step) return
  if (step.type === 'overviewAll') {
    // 全图模式：重置相机到中心，缩放适配
    const vbParts = viewBox.value.split(' ').map(Number)
    const vbX = vbParts[0], vbY = vbParts[1], vbW = vbParts[2], vbH = vbParts[3]
    cameraX.value = vbX + vbW / 2
    cameraY.value = vbY + vbH / 2
    cameraScale.value = 1
    return
  }
  flyToNode(step.nodeId)
}

// 导航
function nextStep() {
  if (stepIndex.value < steps.value.length - 1) {
    stepIndex.value++
  }
}

function prevStep() {
  if (stepIndex.value > 0) {
    stepIndex.value--
  }
}

function exitPitch() {
  emit('exit')
}

// 点击画布翻页
function handleCanvasClick(e: MouseEvent) {
  // 避免与 HUD 按钮冲突
  if ((e.target as HTMLElement).closest('.pitch-hud')) return
  nextStep()
}

// 键盘事件
function handleKeyDown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowRight':
    case ' ':
    case 'Enter':
      e.preventDefault()
      nextStep()
      break
    case 'ArrowLeft':
    case 'Backspace':
      e.preventDefault()
      prevStep()
      break
    case 'Escape':
      e.preventDefault()
      exitPitch()
      break
    case 'Home':
      e.preventDefault()
      stepIndex.value = 0
      break
    case 'End':
      e.preventDefault()
      stepIndex.value = steps.value.length - 1
      break
  }
}

// 鼠标事件（激光笔 + HUD 显隐）
function handleMouseMove(e: MouseEvent) {
  laserPos.value = { x: e.clientX, y: e.clientY }
  
  showHUD.value = true
  if (hudTimeout) clearTimeout(hudTimeout)
  hudTimeout = window.setTimeout(() => {
    showHUD.value = false
  }, 3000)
}

// 计时器
const formattedTime = computed(() => {
  const mins = Math.floor(elapsedTime.value / 60)
  const secs = elapsedTime.value % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

const progressPercent = computed(() => {
  if (steps.value.length <= 1) return 0
  return (stepIndex.value / (steps.value.length - 1)) * 100
})

// 监听步骤变化
watch(stepIndex, () => {
  flyToStep(currentStep.value)
})

watch(revealMode, () => {
  stepIndex.value = 0
})

// 监听激活状态
watch(() => props.isActive, async (active) => {
  if (active) {
    computeLayout()
    updateViewBox()
    stepIndex.value = 0
    startTime.value = Date.now()
    elapsedTime.value = 0
    
    timerInterval = window.setInterval(() => {
      elapsedTime.value = Math.floor((Date.now() - startTime.value) / 1000)
    }, 1000)
    
    await nextTick()
    containerRef.value?.focus()
    flyToStep(currentStep.value)
    
    document.addEventListener('mousemove', handleMouseMove)
    document.documentElement.requestFullscreen?.()
  } else {
    if (timerInterval) clearInterval(timerInterval)
    if (hudTimeout) clearTimeout(hudTimeout)
    document.removeEventListener('mousemove', handleMouseMove)
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    }
  }
}, { immediate: true })

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
  if (hudTimeout) clearTimeout(hudTimeout)
  document.removeEventListener('mousemove', handleMouseMove)
})
</script>

<style scoped>
/* 主题变量 */
.pitch-dark {
  --pitch-bg: #0f172a;
  --pitch-node-bg: #1e293b;
  --pitch-node-border: #334155;
  --pitch-node-active-bg: #1e40af;
  --pitch-node-active-border: #3b82f6;
  --pitch-text: #f1f5f9;
  --pitch-text-secondary: #94a3b8;
  --pitch-hud-bg: rgba(15, 23, 42, 0.9);
  --pitch-hud-border: rgba(255, 255, 255, 0.1);
  --pitch-btn-bg: rgba(255, 255, 255, 0.1);
  --pitch-btn-hover: rgba(255, 255, 255, 0.2);
}

.pitch-light {
  --pitch-bg: #f8fafc;
  --pitch-node-bg: #ffffff;
  --pitch-node-border: #e2e8f0;
  --pitch-node-active-bg: #dbeafe;
  --pitch-node-active-border: #3b82f6;
  --pitch-text: #1e293b;
  --pitch-text-secondary: #64748b;
  --pitch-hud-bg: rgba(255, 255, 255, 0.95);
  --pitch-hud-border: rgba(0, 0, 0, 0.1);
  --pitch-btn-bg: rgba(0, 0, 0, 0.05);
  --pitch-btn-hover: rgba(0, 0, 0, 0.1);
}

.pitch-mode {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--pitch-bg);
  outline: none;
}

.pitch-canvas {
  width: 100%;
  height: 100%;
}

.connection {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  transition: opacity 0.5s ease;
}

.connection.dimmed {
  opacity: 0.1;
}

.camera-group {
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.pitch-node {
  transition: opacity 0.5s ease, transform 0.3s ease;
}

.pitch-node.dimmed {
  opacity: 0.1;
}

.pitch-node.visible {
  opacity: 1;
}

.pitch-node.active {
  opacity: 1;
}

.pitch-node .node-bg {
  fill: var(--pitch-node-bg);
  stroke: var(--pitch-node-border);
  stroke-width: 2;
}

.pitch-node.active .node-bg {
  fill: var(--pitch-node-active-bg);
  stroke: var(--pitch-node-active-border);
  stroke-width: 3;
}

:deep(.node-content) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  box-sizing: border-box;
  padding: 10px 16px;
  color: var(--pitch-text);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
  word-break: break-word;
}

:deep(.node-content p) {
  margin: 0;
}

:deep(.node-content ul),
:deep(.node-content ol) {
  margin: 0;
  padding-left: 1.2em;
}

:deep(.node-content li) {
  margin: 0;
}

:deep(.pitch-node.active .node-content) {
  font-weight: 600;
}

/* HUD */
.pitch-hud {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background: var(--pitch-hud-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--pitch-hud-border);
  border-radius: 16px;
}

.hud-left, .hud-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hud-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.hud-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: var(--pitch-btn-bg);
  border-radius: 8px;
  color: var(--pitch-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.hud-btn:hover:not(:disabled) {
  background: var(--pitch-btn-hover);
  color: var(--pitch-text);
}

.hud-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.hud-btn.active {
  background: #ef4444;
  color: white;
}

.hud-btn.hud-toggle {
  width: auto;
  padding: 0 10px;
  font-size: 12px;
  color: var(--pitch-text);
}

.step-indicator {
  font-size: 14px;
  color: var(--pitch-text-secondary);
  min-width: 60px;
  text-align: center;
}

.timer {
  font-size: 14px;
  font-family: 'SF Mono', monospace;
  color: var(--pitch-text-secondary);
}

/* 进度条 */
.progress-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6);
  transition: width 0.5s ease;
}

/* 激光笔 */
.laser-pointer {
  position: fixed;
  width: 12px;
  height: 12px;
  background: #ef4444;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 20px #ef4444, 0 0 40px #ef4444;
  z-index: 10000;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
