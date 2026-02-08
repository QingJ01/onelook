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
        
        <g class="connections-layer">
          <path
            v-for="conn in connections"
            :key="conn.id"
            :d="conn.path"
            :stroke="conn.color"
            class="connection"
            :class="{
              dimmed: isConnectionDimmed(conn),
              'focus-highlight': isConnectionHighlight(conn)
            }"
          />
        </g>
        
        
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
              'drop-target': dropTargetId === node.id,
              'dimmed': shouldDimOtherNodes && !activeBranchIds.includes(node.id),
              'focus-highlight': isHighlightMode && highlightBranchIds.includes(node.id)
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
            
            <text 
              v-if="node.node.data?.icon"
              :x="-node.width / 2 + 12"
              :y="0"
              class="node-icon"
              dominant-baseline="middle"
            >{{ getIconEmoji(node.node.data.icon) }}</text>
            
            
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

const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)

const svgRef = ref<SVGSVGElement | null>(null)

const panX = ref(400)
const panY = ref(300)
const scale = computed(() => mapStore.zoom / 100)
const viewBox = ref('0 0 800 600')

const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const panStartX = ref(0)
const panStartY = ref(0)

const editingNodeId = ref<string | null>(null)

const isDraggingNode = ref(false)
const draggingNodeId = ref<string | null>(null)
const dragNodeStartX = ref(0)
const dragNodeStartY = ref(0)
const dragNodeInitialX = ref(0)
const dragNodeInitialY = ref(0)
const dropTargetId = ref<string | null>(null)
const dropInsertIndex = ref<number>(-1)
const dropInsertMode = ref<'child' | 'before' | 'after'>('child')

const isBoxSelecting = ref(false)
const boxSelectStart = ref({ x: 0, y: 0 })
const boxSelectEnd = ref({ x: 0, y: 0 })

watch(() => mapStore.focusedId, (nodeId) => {
  if (nodeId) {
    const node = layoutNodes.value.find(n => n.id === nodeId)
    if (node) {
      const canvasWidth = svgRef.value?.clientWidth || 800
      const canvasHeight = svgRef.value?.clientHeight || 600
      const targetX = canvasWidth / 2 - node.x * scale.value
      const targetY = canvasHeight / 2 - node.y * scale.value
      
      const startX = panX.value
      const startY = panY.value
      const duration = 300
      const startTime = Date.now()
      
      function animate() {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        
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

const layoutRoot = ref<LayoutNode | null>(null)
const layoutNodes = ref<LayoutNode[]>([])

const selectedIds = computed(() => mapStore.selectedIds)
const isTemporarilyRevealing = ref(false)

const focusedTreeNode = computed(() => {
  if (!mapStore.focusedId) return null
  return mapStore.findNode(mapStore.focusedId)
})

const ancestorPathIds = computed<string[]>(() => {
  const focusedNode = focusedTreeNode.value
  if (!focusedNode) return []

  const ids = new Set<string>()
  let currentNode: typeof focusedNode | null = focusedNode
  while (currentNode) {
    ids.add(currentNode.id)
    if (!currentNode.parentId) break
    currentNode = mapStore.findNode(currentNode.parentId)
  }

  return Array.from(ids)
})

const branchIds = computed<string[]>(() => {
  const focusedNode = focusedTreeNode.value
  if (!focusedNode) return []

  const ids = new Set<string>(ancestorPathIds.value)
  const collectDescendants = (node: typeof focusedNode) => {
    ids.add(node.id)
    for (const child of node.children) {
      collectDescendants(child)
    }
  }

  collectDescendants(focusedNode)
  return Array.from(ids)
})

const isHighlightMode = computed(() => mapStore.zenMode && mapStore.zenFocusMode === 'highlight')
const shouldDimOtherNodes = computed(() =>
  mapStore.zenMode &&
  mapStore.zenFocusMode !== 'highlight' &&
  !isTemporarilyRevealing.value
)

const highlightBranchIds = computed<string[]>(() => {
  if (!mapStore.zenMode) return []
  return branchIds.value
})

const activeBranchIds = computed<string[]>(() => {
  if (!mapStore.zenMode) return []

  if (!mapStore.focusedId || !focusedTreeNode.value) {
    return layoutNodes.value.map(node => node.id)
  }

  if (mapStore.zenFocusMode === 'path') {
    return ancestorPathIds.value
  }

  if (mapStore.zenFocusMode === 'highlight') {
    return layoutNodes.value.map(node => node.id)
  }

  return branchIds.value
})

const editingNode = computed(() => {
  if (!editingNodeId.value) return null
  return layoutNodes.value.find(n => n.id === editingNodeId.value)
})

const RAINBOW_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
]

const nodeBranchColors = ref<Map<string, string>>(new Map())

interface ConnectionData {
  id: string
  fromId: string
  toId: string
  path: string
  color: string
}

const connections = computed<ConnectionData[]>(() => {
  const result: ConnectionData[] = []
  const colorMap = new Map<string, string>()
  const connectionStyle = mapStore.document.connectionStyle || 'curve'
  const useRainbow = mapStore.document.rainbowBranch ?? false
  const defaultColor = 'var(--color-border)'
  
  const traverse = (node: LayoutNode, branchColor: string) => {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      const color = useRainbow
        ? (!node.node.parentId ? RAINBOW_COLORS[i % RAINBOW_COLORS.length] : branchColor)
        : defaultColor
      colorMap.set(child.id, color)
      result.push({
        id: `${node.id}-${child.id}`,
        fromId: node.id,
        toId: child.id,
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

function isConnectionDimmed(conn: ConnectionData): boolean {
  if (!shouldDimOtherNodes.value) return false
  if (activeBranchIds.value.length === 0) return false

  return !(
    activeBranchIds.value.includes(conn.fromId) &&
    activeBranchIds.value.includes(conn.toId)
  )
}

function isConnectionHighlight(conn: ConnectionData): boolean {
  if (!isHighlightMode.value) return false
  if (highlightBranchIds.value.length === 0) return false

  return (
    highlightBranchIds.value.includes(conn.fromId) &&
    highlightBranchIds.value.includes(conn.toId)
  )
}

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
    if (node.node.summary && node.children.length > 0) {
      const summary = node.node.summary
      
      const startChild = node.children[0]
      const endChild = node.children[node.children.length - 1]
        
        const rootNode = layoutNodes.value.find(n => !n.node.parentId)
        const isOnLeft = rootNode && node.x < rootNode.x
        
        const topY = startChild.y - startChild.height / 2
        const bottomY = endChild.y + endChild.height / 2
        const midY = (topY + bottomY) / 2
        
        let bracketX: number
        let textX: number
        
        if (isOnLeft) {
          bracketX = Math.min(startChild.x, endChild.x) - Math.max(startChild.width, endChild.width) / 2 - 20
          textX = bracketX - 10
        } else {
          bracketX = Math.max(startChild.x, endChild.x) + Math.max(startChild.width, endChild.width) / 2 + 20
          textX = bracketX + 10
        }
        
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

function updateLayout() {
  const root = mapStore.document.root
  const layoutInstance = getLayoutInstance()
  layoutRoot.value = layoutInstance.layout(root, 0, 0)
  layoutNodes.value = layoutInstance.flatten(layoutRoot.value)
}

let saveTimer: number | null = null
function scheduleAutoSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = window.setTimeout(async () => {
    const docToSave = JSON.parse(JSON.stringify(mapStore.document))
    await documentService.save(docToSave)
    console.log('Auto-saved')
  }, 2000)
}

watch(
  () => mapStore.document,
  () => {
    updateLayout()
    scheduleAutoSave()
  },
  { deep: true, immediate: true }
)

function handleNodeClick(node: LayoutNode, event: MouseEvent) {
  if (editingNodeId.value) return
  mapStore.selectNode(node.id, event.ctrlKey || event.metaKey)
}

function handleNodeDblClick(node: LayoutNode) {
  editingNodeId.value = node.id
  mapStore.selectNode(node.id)
}

function handleToggleExpand(node: LayoutNode) {
  mapStore.toggleExpand(node.id)
}

function handleNodeMouseDown(node: LayoutNode, event: MouseEvent) {
  if (editingNodeId.value) return
  
  isDraggingNode.value = true
  draggingNodeId.value = node.id
  dragNodeStartX.value = event.clientX
  dragNodeStartY.value = event.clientY
  dragNodeInitialX.value = node.x
  dragNodeInitialY.value = node.y
  
  mapStore.selectNode(node.id)
}

function handleNodeContextMenu(node: LayoutNode, event: MouseEvent) {
  mapStore.selectNode(node.id)
  contextMenuRef.value?.open(event.clientX, event.clientY, node.id)
}

const iconEmojiMap: Record<string, string> = {
  'priority-1': '🔴',
  'priority-2': '🟠',
  'priority-3': '🟡',
  check: '✅',
  cross: '❌',
  warning: '⚠️',

  star: '⭐',
  flag: '🚩',
  fire: '🔥',
  idea: '💡',
  question: '❓',
  heart: '❤️',

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

function hasMarkdownFormat(text: string): boolean {
  if (!text) return false
  return /\*|`|\$|~~|\[.*\]\(|^#|\n-|\n\d+\./.test(text)
}

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

function getExpandBtnX(node: LayoutNode): number {
  if (!node.node.parentId) {
    return node.width / 2 + 8
  }
  const rootNode = layoutNodes.value.find(n => !n.node.parentId)
  if (rootNode && node.x < rootNode.x) {
    return -node.width / 2 - 8
  }
  return node.width / 2 + 8
}

function handleContextEdit(nodeId: string) {
  editingNodeId.value = nodeId
}

function handleEditSave(text: string) {
  if (editingNodeId.value) {
    mapStore.updateNodeText(editingNodeId.value, text)
  }
  editingNodeId.value = null
}

function handleEditCancel() {
  editingNodeId.value = null
}

function handleSummaryClick(summary: SummaryData) {
  const nodeId = summary.id.replace('summary-', '')
  const node = mapStore.findNode(nodeId)
  if (node) {
    const newText = prompt('编辑概要文本:', summary.text)
    if (newText !== null && newText.trim()) {
      mapStore.setSummary(nodeId, newText.trim(), 0, node.children.length - 1)
    }
  }
}

function handleMouseDown(event: MouseEvent) {
  if (editingNodeId.value) return
  const target = event.target as Element
  if (target?.closest('.node')) return
  if (target?.closest('.summary')) return
  if (svgRef.value) {
    const rect = svgRef.value?.getBoundingClientRect()
    if (!rect) return
    
    if (event.shiftKey) {
      isBoxSelecting.value = true
      const x = (event.clientX - rect.left - panX.value) / scale.value
      const y = (event.clientY - rect.top - panY.value) / scale.value
      boxSelectStart.value = { x, y }
      boxSelectEnd.value = { x, y }
      mapStore.clearSelection()
    } else {
      isDragging.value = true
      dragStartX.value = event.clientX
      dragStartY.value = event.clientY
      panStartX.value = panX.value
      panStartY.value = panY.value
    }
  }
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value) {
    const dx = event.clientX - dragStartX.value
    const dy = event.clientY - dragStartY.value
    panX.value = panStartX.value + dx
    panY.value = panStartY.value + dy
    return
  }
  
  if (isBoxSelecting.value) {
    const rect = svgRef.value?.getBoundingClientRect()
    if (rect) {
      const x = (event.clientX - rect.left - panX.value) / scale.value
      const y = (event.clientY - rect.top - panY.value) / scale.value
      boxSelectEnd.value = { x, y }
    }
    return
  }
  
  if (isDraggingNode.value && draggingNodeId.value) {
    const dx = event.clientX - dragNodeStartX.value
    const dy = event.clientY - dragNodeStartY.value
    
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      const rect = svgRef.value?.getBoundingClientRect()
      if (rect) {
        const mouseX = (event.clientX - rect.left - panX.value) / scale.value
        const mouseY = (event.clientY - rect.top - panY.value) / scale.value
        
        let closestNode: LayoutNode | null = null
        let minDistance = Infinity
        let insertPosition: 'child' | 'before' | 'after' = 'child'
        
        for (const node of layoutNodes.value) {
          if (node.id === draggingNodeId.value) continue
          
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
            
            const nodeHalfHeight = node.height / 2
            if (horizontalDist < node.width / 2 + 30) {
              if (verticalOffset < -nodeHalfHeight * 0.6) {
                insertPosition = 'before'
              } else if (verticalOffset > nodeHalfHeight * 0.6) {
                insertPosition = 'after'
              } else {
                insertPosition = 'child'
              }
            } else {
              insertPosition = 'child'
            }
          }
        }
        
        dropTargetId.value = closestNode?.id || null
        
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
  if (isDraggingNode.value && draggingNodeId.value) {
    const dx = event.clientX - dragNodeStartX.value
    const dy = event.clientY - dragNodeStartY.value
    
    if (dropTargetId.value && draggingNodeId.value !== dropTargetId.value) {
      const targetNode = mapStore.findNode(dropTargetId.value)
      
      if (dropInsertMode.value === 'child') {
        mapStore.moveNode(draggingNodeId.value, dropTargetId.value)
      } else if (targetNode && targetNode.parentId) {
        mapStore.moveNode(draggingNodeId.value, targetNode.parentId, dropInsertIndex.value)
      }
    } else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      const newX = dragNodeInitialX.value + dx / scale.value
      const newY = dragNodeInitialY.value + dy / scale.value
      mapStore.updateNodePosition(draggingNodeId.value, newX, newY)
    }
  }
  
  if (isBoxSelecting.value) {
    const minX = Math.min(boxSelectStart.value.x, boxSelectEnd.value.x)
    const maxX = Math.max(boxSelectStart.value.x, boxSelectEnd.value.x)
    const minY = Math.min(boxSelectStart.value.y, boxSelectEnd.value.y)
    const maxY = Math.max(boxSelectStart.value.y, boxSelectEnd.value.y)
    
    if (maxX - minX > 10 && maxY - minY > 10) {
      for (const node of layoutNodes.value) {
        if (node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
          mapStore.selectNode(node.id, true)
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

function handleWheel(event: WheelEvent) {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -10 : 10
  mapStore.setZoom(mapStore.zoom + delta)
}

function handleKeyDown(event: KeyboardEvent) {
  if (editingNodeId.value) return
  
  if (event.isComposing) return

  if (mapStore.zenMode && event.key === 'Alt') {
    isTemporarilyRevealing.value = true
    return
  }
  
  const activeElement = document.activeElement
  const isInputFocused = activeElement instanceof HTMLInputElement || 
                         activeElement instanceof HTMLTextAreaElement ||
                         activeElement instanceof HTMLSelectElement ||
                         activeElement?.hasAttribute('contenteditable')
  
  if (isInputFocused) {
    if (event.key === 'Escape') {
      (activeElement as HTMLElement)?.blur()
    }
    return
  }
  
  const focusedId = mapStore.focusedId
  
  if (event.key === 'F2' && focusedId) {
    event.preventDefault()
    editingNodeId.value = focusedId
    return
  }
  
  if (event.key === ' ' && focusedId) {
    event.preventDefault()
    editingNodeId.value = focusedId
    return
  }
  
  if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    mapStore.undo()
    return
  }
  
  if ((event.ctrlKey && event.key === 'y') || (event.ctrlKey && event.shiftKey && event.key === 'z')) {
    event.preventDefault()
    mapStore.redo()
    return
  }
  
  if (event.ctrlKey && event.key === 'c' && focusedId) {
    event.preventDefault()
    mapStore.copyNode(focusedId)
    return
  }
  
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
      break
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

function handleKeyUp(event: KeyboardEvent) {
  if (event.key === 'Alt') {
    isTemporarilyRevealing.value = false
  }
}

function handleWindowBlur() {
  isTemporarilyRevealing.value = false
}

function updateViewBox() {
  if (svgRef.value) {
    const rect = svgRef.value.getBoundingClientRect()
    viewBox.value = `0 0 ${rect.width} ${rect.height}`
  }
}

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
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleWindowBlur)
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  window.removeEventListener('resize', updateViewBox)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
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

.node {
  cursor: pointer;
  transition: opacity 0.3s ease;
}

.node.dimmed {
  opacity: 0.35;
}

.node.focus-highlight .node-bg {
  stroke: var(--color-primary);
  stroke-width: 2.6;
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

.connection {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  transition: opacity 0.3s ease;
}

.connection.dimmed {
  opacity: 0.25;
}

.connection.focus-highlight {
  stroke-width: 2.8;
  opacity: 1;
}

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

.node.dragging {
  opacity: 0.5;
}

.node.drop-target .node-bg {
  stroke: var(--color-primary);
  stroke-width: 3;
  stroke-dasharray: 5;
}

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

.summary-bracket {
  transition: stroke 0.2s;
}

.summary-text {
  font-size: 12px;
  fill: var(--color-primary);
  font-family: 'Inter', system-ui, sans-serif;
}
</style>

