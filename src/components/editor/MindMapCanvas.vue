<template>
  <div class="canvas-wrapper">
    <svg 
      ref="svgRef"
      class="mindmap-canvas"
      :viewBox="viewBox"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @wheel="handleWheel"
    >
      <defs>
        <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1"/>
        </filter>
      </defs>
      
      <g :transform="`translate(${panX}, ${panY}) scale(${scale})`">
        <!-- 连接线层 -->
        <g class="connections-layer">
          <path
            v-for="conn in connections"
            :key="conn.id"
            :d="conn.path"
            :stroke="conn.color"
            class="connection"
          />
        </g>
        
        <!-- 概要层 -->
        <g class="summaries-layer">
          <g
            v-for="summary in summaries"
            :key="summary.id"
            class="summary"
          >
            <path
              :d="summary.bracketPath"
              class="summary-bracket"
              fill="none"
              stroke="var(--color-primary)"
              stroke-width="2"
            />
            <text
              :x="summary.textX"
              :y="summary.textY"
              class="summary-text"
              dominant-baseline="middle"
              style="cursor: pointer"
              @click.stop="handleSummaryClick(summary)"
            >{{ summary.text }}</text>
          </g>
        </g>
        
        <!-- 节点层 -->
        <g class="nodes-layer">
          <g
            v-for="node in layoutNodes"
            :key="node.id"
            class="node"
            :class="{
              'selected': selectedIds.includes(node.id),
              'root': !node.node.parentId,
              'editing': editingNodeId === node.id,
              'dragging': draggingNodeId === node.id,
              'drop-target': dropTargetId === node.id
            }"
            :transform="`translate(${node.x}, ${node.y})`"
            @click.stop="handleNodeClick(node, $event)"
            @dblclick.stop="handleNodeDblClick(node)"
            @mousedown.stop="handleNodeMouseDown(node, $event)"
            @contextmenu.prevent="handleNodeContextMenu(node, $event)"
          >
            <rect 
              :x="-node.width / 2" 
              :y="-node.height / 2"
              :width="node.width" 
              :height="node.height"
              :rx="getNodeRadius(node)"
              class="node-bg"
              :style="getNodeStyle(node)"
              filter="url(#node-shadow)"
            />
            <!-- 图标 -->
            <text 
              v-if="node.node.data?.icon"
              :x="-node.width / 2 + 12"
              :y="0"
              class="node-icon"
              dominant-baseline="middle"
            >{{ getIconEmoji(node.node.data.icon) }}</text>
            
            <!-- Markdown/LaTeX 渲染内容 -->
            <foreignObject
              v-if="shouldRenderRichContent(node) && editingNodeId !== node.id"
              :x="-node.width / 2"
              :y="-node.height / 2"
              :width="node.width"
              :height="node.height"
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                class="md-content"
                :class="{ 'md-content-image': hasNodePhoto(node) || hasMarkdownImage(node.node.text) }"
                :style="getRichContentStyle(node)"
              >
                <img
                  v-if="hasNodePhoto(node)"
                  :src="node.node.data?.image"
                  :style="getNodeImageStyle(node)"
                  class="node-data-image"
                  alt="node image"
                />
                <div
                  v-if="hasMarkdownFormat(node.node.text)"
                  class="node-rich-text-body"
                  :class="{ 'with-image': hasNodePhoto(node) }"
                  v-html="getRenderedMarkdown(node.node.text)"
                ></div>
                <div
                  v-else-if="hasNodePhoto(node) && hasNodeText(node)"
                  class="node-rich-text-body with-image node-photo-text"
                >
                  {{ node.node.text }}
                </div>
              </div>
            </foreignObject>
            
            <!-- 纯文本 -->
            <text 
              v-else-if="editingNodeId !== node.id"
              class="node-text" 
              :x="node.node.data?.icon ? 8 : 0"
              text-anchor="middle" 
              dominant-baseline="middle"
              :style="getTextStyle(node)"
            >
              {{ node.node.text }}
            </text>
            
            <!-- 展开/收起按钮 -->
            <g 
              v-if="node.node.children.length > 0"
              class="expand-btn"
              :transform="`translate(${getExpandBtnX(node)}, 0)`"
              @click.stop="handleToggleExpand(node)"
            >
              <circle r="10" class="expand-btn-bg"/>
              <text text-anchor="middle" dominant-baseline="middle" class="expand-btn-text">
                {{ node.node.isExpanded ? '-' : '+' }}
              </text>
            </g>
          </g>
        </g>
        
        <!-- 框选矩形 -->
        <rect
          v-if="isBoxSelecting"
          :x="Math.min(boxSelectStart.x, boxSelectEnd.x)"
          :y="Math.min(boxSelectStart.y, boxSelectEnd.y)"
          :width="Math.abs(boxSelectEnd.x - boxSelectStart.x)"
          :height="Math.abs(boxSelectEnd.y - boxSelectStart.y)"
          class="box-select-rect"
          fill="rgba(59, 130, 246, 0.1)"
          stroke="var(--color-primary)"
          stroke-width="1"
          stroke-dasharray="4"
        />
      </g>
    </svg>
    
    <!-- 节点编辑器 -->
    <NodeEditor
      :is-editing="editingNodeId !== null"
      :text="editingNode?.node.text || ''"
      :x="editingNode?.x || 0"
      :y="editingNode?.y || 0"
      :width="editingNode?.width || 120"
      :height="editingNode?.height || 40"
      :scale="scale"
      :pan-x="panX"
      :pan-y="panY"
      @save="handleEditSave"
      @cancel="handleEditCancel"
    />
    
    <!-- 右键菜单 -->
    <ContextMenu ref="contextMenuRef" @edit="handleContextEdit" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMapStore } from '@/stores/mapStore'
import { MindMapLayout, generateConnectionPath, type LayoutNode } from '@/core/layout/mindLayout'
import { TreeLayout, OrgLayout, FishboneLayout } from '@/core/layout/layouts'
import { documentService } from '@/services/db'

import { renderMarkdown } from '@/utils/markdown'
import { estimateNodeImageHeight, getNodeContentSpacing, hasMarkdownImage, normalizeNodeImageWidth } from '@/utils/nodeContentMetrics'
import NodeEditor from './NodeEditor.vue'
import ContextMenu from './ContextMenu.vue'

const mapStore = useMapStore()

// 组件引用
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)

// SVG 引用
const svgRef = ref<SVGSVGElement | null>(null)

// 视图状态
const panX = ref(400)
const panY = ref(300)
const scale = computed(() => mapStore.zoom / 100)
const viewBox = ref('0 0 800 600')

// 拖拽状态
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const panStartX = ref(0)
const panStartY = ref(0)

// 编辑状态
const editingNodeId = ref<string | null>(null)

// 节点拖拽状态
const isDraggingNode = ref(false)
const draggingNodeId = ref<string | null>(null)
const dragNodeStartX = ref(0)
const dragNodeStartY = ref(0)
const dragNodeInitialX = ref(0)
const dragNodeInitialY = ref(0)
const dropTargetId = ref<string | null>(null)
const dropInsertIndex = ref<number>(-1)
const dropInsertMode = ref<'child' | 'before' | 'after'>('child')

// 框选状态
const isBoxSelecting = ref(false)
const boxSelectStart = ref({ x: 0, y: 0 })
const boxSelectEnd = ref({ x: 0, y: 0 })

// 监听选中节点变化，自动居中视图
watch(() => mapStore.focusedId, (nodeId) => {
  if (nodeId) {
    const node = layoutNodes.value.find(n => n.id === nodeId)
    if (node) {
      // 计算居中位置
      const canvasWidth = svgRef.value?.clientWidth || 800
      const canvasHeight = svgRef.value?.clientHeight || 600
      const targetX = canvasWidth / 2 - node.x * scale.value
      const targetY = canvasHeight / 2 - node.y * scale.value
      
      // 平滑动画
      const startX = panX.value
      const startY = panY.value
      const duration = 300
      const startTime = Date.now()
      
      function animate() {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
        
        panX.value = startX + (targetX - startX) * eased
        panY.value = startY + (targetY - startY) * eased
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }
      animate()
    }
  }
})

// 布局实例（根据布局类型动态创建）
const layoutOptions = { horizontalGap: 80, verticalGap: 24 }

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

// 布局节点
const layoutRoot = ref<LayoutNode | null>(null)
const layoutNodes = ref<LayoutNode[]>([])

// 选中状态
const selectedIds = computed(() => mapStore.selectedIds)

// 当前编辑的节点
const editingNode = computed(() => {
  if (!editingNodeId.value) return null
  return layoutNodes.value.find(n => n.id === editingNodeId.value)
})

// 彩虹色板
const RAINBOW_COLORS = [
  '#3b82f6', // 钃?
  '#10b981', // 缁?
  '#f59e0b', // 姗?
  '#ef4444', // 绾?
  '#8b5cf6', // 绱?
  '#ec4899', // 绮?
  '#06b6d4', // 闈?
]

// 连接线数据 + 节点分支颜色映射
const nodeBranchColors = ref<Map<string, string>>(new Map())

const connections = computed(() => {
  const result: { id: string; path: string; color: string }[] = []
  const colorMap = new Map<string, string>()
  const connectionStyle = mapStore.document.connectionStyle || 'curve'
  const useRainbow = mapStore.document.rainbowBranch ?? false
  const defaultColor = 'var(--color-border)'
  
  const traverse = (node: LayoutNode, branchColor: string) => {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      // 一级子节点时分配彩虹色，深层节点继承
      const color = useRainbow
        ? (!node.node.parentId ? RAINBOW_COLORS[i % RAINBOW_COLORS.length] : branchColor)
        : defaultColor
      colorMap.set(child.id, color)
      result.push({
        id: `${node.id}-${child.id}`,
        path: generateConnectionPath(
          { x: node.x, y: node.y, width: node.width },
          { x: child.x, y: child.y, width: child.width },
          connectionStyle
        ),
        color,
      })
      traverse(child, color)
    }
  }
  
  if (layoutRoot.value) {
    traverse(layoutRoot.value, RAINBOW_COLORS[0])
  }
  
  nodeBranchColors.value = colorMap
  return result
})

// 概要括号数据
interface SummaryData {
  id: string
  text: string
  bracketPath: string
  textX: number
  textY: number
}

const summaries = computed<SummaryData[]>(() => {
  const result: SummaryData[] = []
  
  for (const node of layoutNodes.value) {
    // 只要有概要且有子节点就显示，自动覆盖所有子节点
    if (node.node.summary && node.children.length > 0) {
      const summary = node.node.summary
      
      // 始终使用第一个和最后一个子节点（自动适应）
      const startChild = node.children[0]
      const endChild = node.children[node.children.length - 1]
        
        // 判断方向
        const rootNode = layoutNodes.value.find(n => !n.node.parentId)
        const isOnLeft = rootNode && node.x < rootNode.x
        
        // 计算括号位置
        const topY = startChild.y - startChild.height / 2
        const bottomY = endChild.y + endChild.height / 2
        const midY = (topY + bottomY) / 2
        
        let bracketX: number
        let textX: number
        
        if (isOnLeft) {
          // 左侧节点，括号在左边
          bracketX = Math.min(startChild.x, endChild.x) - Math.max(startChild.width, endChild.width) / 2 - 20
          textX = bracketX - 10
        } else {
          // 右侧节点，括号在右边
          bracketX = Math.max(startChild.x, endChild.x) + Math.max(startChild.width, endChild.width) / 2 + 20
          textX = bracketX + 10
        }
        
        // 生成括号路径 (花括号形状)
        const curveSize = 10
        const bracketPath = isOnLeft
          ? `M ${bracketX + curveSize} ${topY} 
             Q ${bracketX} ${topY} ${bracketX} ${topY + curveSize}
             L ${bracketX} ${midY - curveSize}
             Q ${bracketX} ${midY} ${bracketX - curveSize} ${midY}
             Q ${bracketX} ${midY} ${bracketX} ${midY + curveSize}
             L ${bracketX} ${bottomY - curveSize}
             Q ${bracketX} ${bottomY} ${bracketX + curveSize} ${bottomY}`
          : `M ${bracketX - curveSize} ${topY} 
             Q ${bracketX} ${topY} ${bracketX} ${topY + curveSize}
             L ${bracketX} ${midY - curveSize}
             Q ${bracketX} ${midY} ${bracketX + curveSize} ${midY}
             Q ${bracketX} ${midY} ${bracketX} ${midY + curveSize}
             L ${bracketX} ${bottomY - curveSize}
             Q ${bracketX} ${bottomY} ${bracketX - curveSize} ${bottomY}`
        
        result.push({
          id: `summary-${node.id}`,
          text: summary.text,
          bracketPath,
          textX,
          textY: midY
        })
    }
  }
  
  return result
})

// 更新布局
function updateLayout() {
  const root = mapStore.document.root
  const layoutInstance = getLayoutInstance()
  layoutRoot.value = layoutInstance.layout(root, 0, 0)
  layoutNodes.value = layoutInstance.flatten(layoutRoot.value)
}

// 自动保存（防抖）
let saveTimer: number | null = null
function scheduleAutoSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = window.setTimeout(async () => {
    // 将 Proxy 对象转换为纯 JavaScript 对象
    const docToSave = JSON.parse(JSON.stringify(mapStore.document))
    await documentService.save(docToSave)
    console.log('Auto-saved')
  }, 2000)
}

// 监听文档变化
watch(
  () => mapStore.document,
  () => {
    updateLayout()
    scheduleAutoSave()
  },
  { deep: true, immediate: true }
)

// 节点点击
function handleNodeClick(node: LayoutNode, event: MouseEvent) {
  if (editingNodeId.value) return
  mapStore.selectNode(node.id, event.ctrlKey || event.metaKey)
}

// 节点双击（编辑）
function handleNodeDblClick(node: LayoutNode) {
  editingNodeId.value = node.id
  mapStore.selectNode(node.id)
}

// 展开/收起
function handleToggleExpand(node: LayoutNode) {
  mapStore.toggleExpand(node.id)
}

// 节点拖拽开始
function handleNodeMouseDown(node: LayoutNode, event: MouseEvent) {
  // 如果在编辑模式下不启动拖拽
  if (editingNodeId.value) return
  
  isDraggingNode.value = true
  draggingNodeId.value = node.id
  dragNodeStartX.value = event.clientX
  dragNodeStartY.value = event.clientY
  // 保存节点的初始布局位置
  dragNodeInitialX.value = node.x
  dragNodeInitialY.value = node.y
  
  mapStore.selectNode(node.id)
}

// 节点右键菜单
function handleNodeContextMenu(node: LayoutNode, event: MouseEvent) {
  mapStore.selectNode(node.id)
  contextMenuRef.value?.open(event.clientX, event.clientY, node.id)
}

// 图标映射
// 图标映射
const iconEmojiMap: Record<string, string> = {
  // progress / status
  'priority-1': '🔴',
  'priority-2': '🟠',
  'priority-3': '🟡',
  check: '✅',
  cross: '❌',
  warning: '⚠️',

  // marks
  star: '⭐',
  flag: '🚩',
  fire: '🔥',
  idea: '💡',
  question: '❓',
  heart: '❤️',

  // office / others
  calendar: '📅',
  time: '⏰',
  person: '👤',
  group: '👥',
  link: '🔗',
  attach: '📎',
  chart: '📊',
  money: '💰',
  search: '🔍',
  lock: '🔒',
  tool: '🛠️',
  bug: '🐛',
}

function getIconEmoji(icon: string): string {
  return iconEmojiMap[icon] || ''
}

// 节点样式辅助函数
function getNodeRadius(node: LayoutNode): number {
  const shape = node.node.style?.shape || 'rect'
  switch (shape) {
    case 'round': return Math.min(node.width, node.height) / 2
    case 'ellipse': return Math.min(node.width, node.height) / 2
    case 'diamond': return 0
    default: return node.node.parentId ? 6 : 8
  }
}

function getNodeStyle(node: LayoutNode): Record<string, string> {
  const style: Record<string, string> = {}
  if (node.node.style?.background) {
    style.fill = node.node.style.background
  }
  // 优先使用用户自定义边框色，其次使用彩虹分支色
  if (node.node.style?.borderColor) {
    style.stroke = node.node.style.borderColor
  } else if (mapStore.document.rainbowBranch && nodeBranchColors.value.has(node.id)) {
    style.stroke = nodeBranchColors.value.get(node.id)!
  }
  return style
}

function getTextStyle(node: LayoutNode): Record<string, string> {
  const style: Record<string, string> = {}
  if (node.node.style?.color) {
    style.fill = node.node.style.color
    style.color = node.node.style.color
  }
  if (node.node.style?.fontSize) {
    style.fontSize = `${node.node.style.fontSize}px`
  }
  if (node.node.style?.fontWeight === 'bold') {
    style.fontWeight = 'bold'
  }
  return style
}

function getRichContentStyle(node: LayoutNode): Record<string, string> {
  const style = getTextStyle(node)
  const { paddingX, paddingY, imageTextGap } = getNodeContentSpacing(node.node.style?.fontSize)
  style['--node-content-pad-x'] = `${paddingX}px`
  style['--node-content-pad-y'] = `${paddingY}px`
  style['--node-content-gap'] = `${imageTextGap}px`
  return style
}

// 检查文本是否包含 Markdown/LaTeX 格式
function hasMarkdownFormat(text: string): boolean {
  if (!text) return false
  // 检查 Markdown 语法和 LaTeX
  return /\*|`|\$|~~|\[.*\]\(|^#|\n-|\n\d+\./.test(text)
}

// 渲染 Markdown + LaTeX
function hasNodePhoto(node: LayoutNode): boolean {
  const image = node.node.data?.image
  return typeof image === 'string' && image.trim().length > 0
}

function hasNodeText(node: LayoutNode): boolean {
  return typeof node.node.text === 'string' && node.node.text.trim().length > 0
}

function getNodeImageStyle(node: LayoutNode): Record<string, string> {
  const imageWidth = normalizeNodeImageWidth(node.node.data?.imageWidth)
  const imageHeight = estimateNodeImageHeight(imageWidth, node.node.data?.imageAspectRatio)
  return {
    width: `${imageWidth}px`,
    maxWidth: '100%',
    maxHeight: `${imageHeight}px`,
  }
}

function shouldRenderRichContent(node: LayoutNode): boolean {
  return hasMarkdownFormat(node.node.text) || hasNodePhoto(node)
}

function getRenderedMarkdown(text: string): string {
  return renderMarkdown(text)
}

// 获取展开按钮的 X 坐标（根据节点位置决定在左边还是右边）
function getExpandBtnX(node: LayoutNode): number {
  // 根节点的按钮在右边
  if (!node.node.parentId) {
    return node.width / 2 + 8
  }
  // 查找根节点位置
  const rootNode = layoutNodes.value.find(n => !n.node.parentId)
  if (rootNode && node.x < rootNode.x) {
    // 节点在根节点左边，按钮放左边
    return -node.width / 2 - 8
  }
  // 节点在根节点右边，按钮放右边
  return node.width / 2 + 8
}

// 从右键菜单编辑
function handleContextEdit(nodeId: string) {
  editingNodeId.value = nodeId
}

// 编辑保存
function handleEditSave(text: string) {
  if (editingNodeId.value) {
    mapStore.updateNodeText(editingNodeId.value, text)
  }
  editingNodeId.value = null
}

// 编辑取消
function handleEditCancel() {
  editingNodeId.value = null
}

// 概要点击编辑
function handleSummaryClick(summary: SummaryData) {
  // 从 summary.id 提取节点 ID
  const nodeId = summary.id.replace('summary-', '')
  const node = mapStore.findNode(nodeId)
  if (node) {
    const newText = prompt('编辑概要文本:', summary.text)
    if (newText !== null && newText.trim()) {
      mapStore.setSummary(nodeId, newText.trim(), 0, node.children.length - 1)
    }
  }
}

// 画布拖拽或框选
function handleMouseDown(event: MouseEvent) {
  if (editingNodeId.value) return
  const target = event.target as Element
  if (target?.closest('.node')) return
  if (target?.closest('.summary')) return
  if (svgRef.value) {
    const rect = svgRef.value?.getBoundingClientRect()
    if (!rect) return
    
    // Shift+拖拽 = 框选模式
    if (event.shiftKey) {
      isBoxSelecting.value = true
      const x = (event.clientX - rect.left - panX.value) / scale.value
      const y = (event.clientY - rect.top - panY.value) / scale.value
      boxSelectStart.value = { x, y }
      boxSelectEnd.value = { x, y }
      mapStore.clearSelection()
    } else {
      // 普通拖拽
      isDragging.value = true
      dragStartX.value = event.clientX
      dragStartY.value = event.clientY
      panStartX.value = panX.value
      panStartY.value = panY.value
      mapStore.clearSelection()
    }
  }
}

function handleMouseMove(event: MouseEvent) {
  // 画布拖拽
  if (isDragging.value) {
    const dx = event.clientX - dragStartX.value
    const dy = event.clientY - dragStartY.value
    panX.value = panStartX.value + dx
    panY.value = panStartY.value + dy
    return
  }
  
  // 框选
  if (isBoxSelecting.value) {
    const rect = svgRef.value?.getBoundingClientRect()
    if (rect) {
      const x = (event.clientX - rect.left - panX.value) / scale.value
      const y = (event.clientY - rect.top - panY.value) / scale.value
      boxSelectEnd.value = { x, y }
    }
    return
  }
  
  // 节点拖拽
  if (isDraggingNode.value && draggingNodeId.value) {
    const dx = event.clientX - dragNodeStartX.value
    const dy = event.clientY - dragNodeStartY.value
    
    // 只有移动超过5px才开始计算拖放目标
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      // 查找拖放目标
      const rect = svgRef.value?.getBoundingClientRect()
      if (rect) {
        const mouseX = (event.clientX - rect.left - panX.value) / scale.value
        const mouseY = (event.clientY - rect.top - panY.value) / scale.value
        
        // 查找最近的节点和插入位置
        let closestNode: LayoutNode | null = null
        let minDistance = Infinity
        let insertPosition: 'child' | 'before' | 'after' = 'child'
        
        for (const node of layoutNodes.value) {
          if (node.id === draggingNodeId.value) continue
          
          // 检查是否被拖拽节点的后代
          const dragNode = mapStore.findNode(draggingNodeId.value)
          if (dragNode) {
            let isDescendant = false
            let checkNode = mapStore.findNode(node.id)
            while (checkNode && checkNode.parentId) {
              if (checkNode.parentId === draggingNodeId.value) {
                isDescendant = true
                break
              }
              checkNode = mapStore.findNode(checkNode.parentId)
            }
            if (isDescendant) continue
          }
          
          const horizontalDist = Math.abs(node.x - mouseX)
          const verticalOffset = mouseY - node.y
          const distance = Math.sqrt(Math.pow(horizontalDist, 2) + Math.pow(verticalOffset, 2))
          
          if (distance < minDistance && distance < 120) {
            minDistance = distance
            closestNode = node
            
            // 根据鼠标相对位置判断插入方式
            const nodeHalfHeight = node.height / 2
            if (horizontalDist < node.width / 2 + 30) {
              // 鼠标在节点水平范围内
              if (verticalOffset < -nodeHalfHeight * 0.6) {
                // 鼠标在节点上方 - 插入为上方兄弟
                insertPosition = 'before'
              } else if (verticalOffset > nodeHalfHeight * 0.6) {
                // 鼠标在节点下方 - 插入为下方兄弟
                insertPosition = 'after'
              } else {
                // 鼠标在节点中间 - 成为子节点
                insertPosition = 'child'
              }
            } else {
              // 鼠标在节点右侧 - 成为子节点
              insertPosition = 'child'
            }
          }
        }
        
        dropTargetId.value = closestNode?.id || null
        
        // 计算插入索引
        if (closestNode && insertPosition !== 'child') {
          const targetNode = mapStore.findNode(closestNode.id)
          if (targetNode && targetNode.parentId) {
            const parent = mapStore.findNode(targetNode.parentId)
            if (parent) {
              const idx = parent.children.findIndex(c => c.id === closestNode!.id)
              dropInsertIndex.value = insertPosition === 'before' ? idx : idx + 1
              dropInsertMode.value = insertPosition
            }
          }
        } else {
          dropInsertIndex.value = -1
          dropInsertMode.value = 'child'
        }
      }
    }
  }
}

function handleMouseUp(event: MouseEvent) {
  // 处理节点自由拖拽（没有放到其他节点上）
  if (isDraggingNode.value && draggingNodeId.value) {
    const dx = event.clientX - dragNodeStartX.value
    const dy = event.clientY - dragNodeStartY.value
    
    if (dropTargetId.value && draggingNodeId.value !== dropTargetId.value) {
      // 移动到目标节点
      const targetNode = mapStore.findNode(dropTargetId.value)
      
      if (dropInsertMode.value === 'child') {
        // 作为子节点
        mapStore.moveNode(draggingNodeId.value, dropTargetId.value)
      } else if (targetNode && targetNode.parentId) {
        // 作为兄弟节点插入
        mapStore.moveNode(draggingNodeId.value, targetNode.parentId, dropInsertIndex.value)
      }
    } else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      // 自由拖拽 - 计算新的绝对位置
      const newX = dragNodeInitialX.value + dx / scale.value
      const newY = dragNodeInitialY.value + dy / scale.value
      mapStore.updateNodePosition(draggingNodeId.value, newX, newY)
    }
  }
  
  // 框选完成 - 选中区域内的节点
  if (isBoxSelecting.value) {
    const minX = Math.min(boxSelectStart.value.x, boxSelectEnd.value.x)
    const maxX = Math.max(boxSelectStart.value.x, boxSelectEnd.value.x)
    const minY = Math.min(boxSelectStart.value.y, boxSelectEnd.value.y)
    const maxY = Math.max(boxSelectStart.value.y, boxSelectEnd.value.y)
    
    // 只有框选范围足够大才选中节点
    if (maxX - minX > 10 && maxY - minY > 10) {
      for (const node of layoutNodes.value) {
        if (node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
          mapStore.selectNode(node.id, true) // append = true
        }
      }
    }
    
    isBoxSelecting.value = false
  }
  
  isDragging.value = false
  isDraggingNode.value = false
  draggingNodeId.value = null
  dropTargetId.value = null
  dropInsertIndex.value = -1
  dropInsertMode.value = 'child'
}

// 滚轮缩放
function handleWheel(event: WheelEvent) {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -10 : 10
  mapStore.setZoom(mapStore.zoom + delta)
}

// 键盘事件
function handleKeyDown(event: KeyboardEvent) {
  // 编辑模式下不处理
  if (editingNodeId.value) return
  
  // 输入法组合状态（如中文输入）不处理
  if (event.isComposing) return
  
  // 如果焦点在输入框或文本域内，不拦截快捷键
  const activeElement = document.activeElement
  const isInputFocused = activeElement instanceof HTMLInputElement || 
                         activeElement instanceof HTMLTextAreaElement ||
                         activeElement instanceof HTMLSelectElement ||
                         activeElement?.hasAttribute('contenteditable')
  
  // 输入框内只拦截 Escape 用于退出
  if (isInputFocused) {
    if (event.key === 'Escape') {
      (activeElement as HTMLElement)?.blur()
    }
    return
  }
  
  const focusedId = mapStore.focusedId
  
  // F2 进入编辑
  if (event.key === 'F2' && focusedId) {
    event.preventDefault()
    editingNodeId.value = focusedId
    return
  }
  
  // 空格进入编辑
  if (event.key === ' ' && focusedId) {
    event.preventDefault()
    editingNodeId.value = focusedId
    return
  }
  
  // Ctrl+Z 撤销
  if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    mapStore.undo()
    return
  }
  
  // Ctrl+Y 或 Ctrl+Shift+Z 重做
  if ((event.ctrlKey && event.key === 'y') || (event.ctrlKey && event.shiftKey && event.key === 'z')) {
    event.preventDefault()
    mapStore.redo()
    return
  }
  
  // Ctrl+C 复制
  if (event.ctrlKey && event.key === 'c' && focusedId) {
    event.preventDefault()
    mapStore.copyNode(focusedId)
    return
  }
  
  // Ctrl+V 粘贴
  if (event.ctrlKey && event.key === 'v' && focusedId) {
    event.preventDefault()
    mapStore.pasteNode(focusedId)
    return
  }
  
  if (!focusedId) return

  switch (event.key) {
    case 'Tab':
      event.preventDefault()
      mapStore.addChild(focusedId)
      break
    case 'Enter':
      event.preventDefault()
      if (!event.shiftKey) {
        mapStore.addSibling(focusedId)
      }
      break
    case 'Delete':
    case 'Backspace':
      event.preventDefault()
      mapStore.deleteNode(focusedId)
      break
    case 'Escape':
      mapStore.clearSelection()
      break
    // 方向键导航
    case 'ArrowLeft':
      event.preventDefault()
      mapStore.navigateToParent()
      break
    case 'ArrowRight':
      event.preventDefault()
      mapStore.navigateToChild()
      break
    case 'ArrowUp':
      event.preventDefault()
      mapStore.navigateToPrevSibling()
      break
    case 'ArrowDown':
      event.preventDefault()
      mapStore.navigateToNextSibling()
      break
  }
}

// 更新 viewBox
function updateViewBox() {
  if (svgRef.value) {
    const rect = svgRef.value.getBoundingClientRect()
    viewBox.value = `0 0 ${rect.width} ${rect.height}`
  }
}

// 加载已保存的文档
async function loadSavedDocument() {
  const docs = await documentService.getRecent(1)
  if (docs.length > 0) {
    mapStore.loadDocument(docs[0])
  }
}

onMounted(() => {
  updateViewBox()
  loadSavedDocument()
  window.addEventListener('resize', updateViewBox)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  window.removeEventListener('resize', updateViewBox)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.canvas-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.mindmap-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
  user-select: none;
}

.mindmap-canvas:active {
  cursor: grabbing;
}

/* 节点样式 */
.node {
  cursor: pointer;
}

.node.editing .node-bg {
  stroke: var(--color-primary);
  stroke-width: 2;
  stroke-dasharray: 4 2;
}

.node-bg {
  fill: var(--color-bg);
  stroke: var(--color-border);
  stroke-width: 1.5;
  transition: all 0.15s ease;
}

.node:hover .node-bg {
  stroke: var(--color-primary);
  stroke-width: 2;
}

.node.selected .node-bg {
  stroke: var(--color-primary);
  stroke-width: 2.5;
}

.node.root .node-bg {
  fill: var(--color-primary);
  stroke: var(--color-primary);
}

.node-text {
  font-size: 13px;
  fill: var(--color-text);
  pointer-events: none;
  font-family: 'Inter', system-ui, sans-serif;
}

.node.root .node-text {
  fill: white;
  font-weight: 500;
}

/* 连接线 */
.connection {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
}

/* 展开/收起按钮 */
.expand-btn {
  cursor: pointer;
}

.expand-btn-bg {
  fill: var(--color-bg-secondary);
  stroke: var(--color-border);
  stroke-width: 1;
  transition: all 0.15s ease;
}

.expand-btn:hover .expand-btn-bg {
  fill: var(--color-primary);
  stroke: var(--color-primary);
}

.expand-btn-text {
  font-size: 14px;
  fill: var(--color-text-secondary);
  font-weight: 500;
}

.expand-btn:hover .expand-btn-text {
  fill: white;
}

/* 拖拽样式 */
.node.dragging {
  opacity: 0.5;
}

.node.drop-target .node-bg {
  stroke: var(--color-primary);
  stroke-width: 3;
  stroke-dasharray: 5;
}

/* Markdown 渲染内容 */
.md-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--node-content-gap, 8px);
  text-align: center;
  padding: var(--node-content-pad-y, 8px) var(--node-content-pad-x, 12px);
  box-sizing: border-box;
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text);
}

.md-content.md-content-image {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.md-content p {
  margin: 0;
}

.md-content.md-content-image p {
  margin-bottom: 0;
}

.md-content strong {
  font-weight: bold;
}

.md-content em {
  font-style: italic;
}

.md-content del {
  text-decoration: line-through;
}

.md-content code {
  background: rgba(0,0,0,0.1);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.md-content a {
  color: var(--color-primary);
  text-decoration: underline;
}

.node-data-image {
  display: block;
  max-width: 100%;
  max-height: 180px;
  width: auto;
  height: auto;
  margin: 0 auto;
  object-fit: contain;
  border-radius: 4px;
}

.node-rich-text-body.with-image {
  margin: 0;
  color: inherit;
}

.node-photo-text {
  margin-top: 0;
  text-align: center;
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
}

.node-rich-text {
  margin: 0;
  text-align: center;
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
}

.node.root .md-content {
  color: white;
}

/* 概要样式 */
.summary-bracket {
  transition: stroke 0.2s;
}

.summary-text {
  font-size: 12px;
  fill: var(--color-primary);
  font-family: 'Inter', system-ui, sans-serif;
}
</style>

