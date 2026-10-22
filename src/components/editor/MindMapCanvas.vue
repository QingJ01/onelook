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
              v-if="!isTableNode(node.node) && !isCodeNode(node.node)"
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
              v-if="node.node.data?.icon && !isTableNode(node.node) && !isCodeNode(node.node)"
              :x="-node.width / 2 + 12"
              :y="0"
              class="node-icon"
              dominant-baseline="middle"
            >{{ getIconEmoji(node.node.data.icon) }}</text>


            <!-- 表格节点 -->
            <foreignObject
              v-if="isTableNode(node.node) && editingNodeId !== node.id"
              :x="-node.width / 2"
              :y="-node.height / 2"
              :width="node.width"
              :height="node.height"
            >
              <div xmlns="http://www.w3.org/1999/xhtml" class="table-node">
                <table class="tn-table">
                  <thead>
                    <tr>
                      <th
                        v-for="(h, c) in node.node.data!.table!.header"
                        :key="c"
                        title="双击编辑；＋从该列延伸"
                        @dblclick.stop="startCellEdit(node, 0, c)"
                      >
                        <span class="tn-cell-text">{{ h }}</span>
                        <button class="tn-add" title="从该列延伸子节点" @click.stop="handleCellAddChild(node, 0, c)">＋</button>
                        <span v-if="anchorCount(node.node, 0, c)" class="tn-badge">{{ anchorCount(node.node, 0, c) }}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, r) in node.node.data!.table!.rows" :key="r">
                      <td
                        v-for="(_, c) in row"
                        :key="c"
                        title="双击编辑；＋从该格延伸"
                        @dblclick.stop="startCellEdit(node, r + 1, c)"
                      >
                        <span class="tn-cell-text">{{ row[c] }}</span>
                        <button class="tn-add" title="从该格延伸子节点" @click.stop="handleCellAddChild(node, r + 1, c)">＋</button>
                        <span v-if="anchorCount(node.node, r + 1, c)" class="tn-badge">{{ anchorCount(node.node, r + 1, c) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </foreignObject>

            <!-- 代码块节点 -->
            <foreignObject
              v-else-if="isCodeNode(node.node) && editingNodeId !== node.id"
              :x="-node.width / 2"
              :y="-node.height / 2"
              :width="node.width"
              :height="node.height"
            >
              <div xmlns="http://www.w3.org/1999/xhtml" class="code-node">
                <div class="code-node-head">{{ languageLabel(node.node) }}</div>
                <pre class="code-node-body" v-html="highlightedCode(node.node)"></pre>
              </div>
            </foreignObject>

            <!-- 表格选中时的行列控制条 -->
            <foreignObject
              v-if="isTableNode(node.node) && selectedIds.includes(node.id)"
              :x="-node.width / 2"
              :y="-node.height / 2 - 30"
              :width="node.width"
              :height="26"
            >
              <div xmlns="http://www.w3.org/1999/xhtml" class="tn-controls">
                <button title="加行" @click.stop="addTableRow(node)">＋行</button>
                <button title="加列" @click.stop="addTableCol(node)">＋列</button>
                <button title="删末行" @click.stop="removeTableRow(node)">－行</button>
                <button title="删末列" @click.stop="removeTableCol(node)">－列</button>
              </div>
            </foreignObject>


            <foreignObject
              v-else-if="!isTableNode(node.node) && !isCodeNode(node.node) && shouldRenderRichContent(node) && editingNodeId !== node.id"
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
              v-else-if="!isTableNode(node.node) && !isCodeNode(node.node) && editingNodeId !== node.id"
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

            <g
              v-if="getInternalReference(node)"
              class="ref-btn"
              :transform="`translate(${-node.width / 2 + 2}, ${-node.height / 2 + 2})`"
              @mousedown.stop
              @click.stop="handleOpenReference(node)"
            >
              <circle r="9" class="ref-btn-bg"/>
              <text text-anchor="middle" dominant-baseline="middle" class="ref-btn-text">↗</text>
            </g>

            <!-- vault 引用徽标：镜像自哪张导图，点击跳到源节点 -->
            <g
              v-if="getVaultRef(node)"
              class="vault-ref-badge"
              :transform="`translate(${node.width / 2 - 4}, ${-node.height / 2 + 4})`"
              @mousedown.stop
              @click.stop="handleOpenVaultRef(node)"
            >
              <rect x="-4" y="-8" :width="vaultBadgeWidth(node)" height="16" rx="8" class="vault-ref-bg"/>
              <text :x="-4 + vaultBadgeWidth(node) / 2" y="0" text-anchor="middle" dominant-baseline="middle" class="vault-ref-text">{{ vaultBadgeText(node) }}</text>
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
      :mode="editingNode && isCodeNode(editingNode.node) ? 'code' : 'text'"
      :language="editingNode?.node?.data?.code?.language || 'text'"
      @update:language="handleCodeLanguage"
      @save="handleEditSave"
      @cancel="handleEditCancel"
    />


    <!-- 表格单元格编辑浮层 -->
    <input
      v-if="cellEdit"
      ref="cellEditInputRef"
      v-model="cellEdit.value"
      class="cell-edit-input"
      :style="{
        left: cellEdit.x + 'px',
        top: cellEdit.y + 'px',
        fontSize: `${13 * scale}px`,
      }"
      @keydown.enter.stop.prevent="commitCellEdit"
      @keydown.esc.stop="cellEdit = null"
      @blur="commitCellEdit"
    />

    
    <ContextMenu ref="contextMenuRef" @edit="handleContextEdit" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useMapStore } from '@/stores/mapStore'
import type { MindMapNode } from '@/types'
import { MindMapLayout, generateConnectionPath, type LayoutNode } from '@/core/layout/mindLayout'
import { TreeLayout, OrgLayout, FishboneLayout } from '@/core/layout/layouts'
import { documentService } from '@/services/db'
import { isInternalReference, openInternalReference, makeInternalReference } from '@/services/references'
import { refOf } from '@/services/vault'
import {
  isTableNode, isCodeNode, getCellAnchor, getTableGeometry, clampCellAnchors, hasAutoLayoutOnly,
  defaultTableData, defaultCodeData, defaultCodeText,
} from '@/utils/specialNodes'
import {
  buildMatcher, matchSequence, sequenceHints, keyToken,
  keyboardStatus, setKeymapMessage,
  type KeymapMode,
} from '@/services/keymap'
import { highlightCode, CODE_LANGUAGES } from '@/utils/highlight'

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
// 编辑器刚关闭的时间戳：IME 上屏可能补发普通 Enter（target=BODY），
// 短窗内忽略 Enter 建节点，避免「关编辑器的同时冒出平级节点」
const lastEditClosedAt = ref(0)

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

  // 表格锚点子节点：连线从对应单元格右缘中心出发
  const connectionFrom = (parent: LayoutNode, child: LayoutNode) => {
    const geo = getTableGeometry(parent.node)
    const anchor = getCellAnchor(child.node)
    if (!geo || !anchor) {
      return { x: parent.x, y: parent.y, width: parent.width }
    }
    const row = Math.max(0, Math.min(geo.rowCount - 1, anchor.row))
    const col = Math.max(0, Math.min(geo.colCount - 1, anchor.col))
    const rect = geo.cellRect(row, col)
    return {
      x: parent.x,
      y: parent.y + rect.y + rect.height / 2 - geo.height / 2,
      width: parent.width,
    }
  }

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
          connectionFrom(node, child),
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

function getInternalReference(node: LayoutNode): string | undefined {
  const href = node.node.data?.hyperlink
  return href && isInternalReference(href) ? href : undefined
}

async function handleOpenReference(node: LayoutNode) {
  const href = getInternalReference(node)
  if (!href) return

  const result = await openInternalReference(href, mapStore)
  if (result !== 'ok') {
    window.alert(
      result === 'missing-document'
        ? '目标导图尚未导入到当前浏览器。请先导入被引用的 .olook 文件。'
        : '引用无效或目标节点不存在。',
    )
  }
}

// ---------- vault 引用徽标 ----------

function getVaultRef(node: LayoutNode) {
  return refOf(node.node)
}

function vaultBadgeText(node: LayoutNode): string {
  const ref = getVaultRef(node)
  const name = ref?.docName || '源导图'
  const trimmed = name.length > 6 ? name.slice(0, 6) + '…' : name
  return `🔗 ${trimmed}`
}

function vaultBadgeWidth(node: LayoutNode): number {
  const text = vaultBadgeText(node)
  let w = 20
  for (const ch of text) w += /[\u4e00-\u9fff]/.test(ch) ? 10 : 6
  return Math.round(w)
}

async function handleOpenVaultRef(node: LayoutNode) {
  const ref = getVaultRef(node)
  if (!ref) return
  const result = await openInternalReference(
    makeInternalReference(ref.docId, ref.nodeId),
    mapStore,
  )
  if (result !== 'ok') {
    window.alert('源导图或源节点已不存在（引用断链）。')
  }
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
  return /\*|`|\$|~~|\[.*\]\(|^#|\n/.test(text)
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
  lastEditClosedAt.value = Date.now()
}

function handleEditCancel() {
  editingNodeId.value = null
  lastEditClosedAt.value = Date.now()
}

// ---------- 表格节点：单元格编辑 / 锚点子节点 / 行列增删 ----------

const cellEditInputRef = ref<HTMLInputElement | null>(null)
const cellEdit = ref<{ tableId: string; row: number; col: number; x: number; y: number; value: string } | null>(null)

function anchorCount(node: MindMapNode, row: number, col: number): number {
  return node.children.filter(child => {
    const a = getCellAnchor(child)
    return a !== null && a.row === row && a.col === col
  }).length
}

function startCellEdit(node: LayoutNode, row: number, col: number) {
  const geo = getTableGeometry(node.node)
  const table = node.node.data?.table
  if (!geo || !table) return
  const rect = geo.cellRect(row, col)
  const absX = node.x + rect.x + rect.width / 2 - geo.width / 2
  const absY = node.y + rect.y + rect.height / 2 - geo.height / 2
  const value = row === 0 ? (table.header[col] ?? '') : (table.rows[row - 1]?.[col] ?? '')
  cellEdit.value = {
    tableId: node.id,
    row,
    col,
    x: absX * scale.value + panX.value,
    y: absY * scale.value + panY.value,
    value,
  }
  nextTick(() => cellEditInputRef.value?.focus())
}

function commitCellEdit() {
  const edit = cellEdit.value
  if (!edit) return
  cellEdit.value = null
  const tableNode = mapStore.findNode(edit.tableId)
  const table = tableNode?.data?.table
  if (!table) return
  const value = edit.value.trim()
  if (edit.row === 0) {
    table.header[edit.col] = value
  } else {
    const row = table.rows[edit.row - 1]
    if (row) row[edit.col] = value
  }
}

/** 在指定单元格挂一个子节点（锚点 = 行列） */
function handleCellAddChild(node: LayoutNode, row: number, col: number) {
  const child = mapStore.addChild(node.id, '新节点')
  if (child) {
    child.data = { ...(child.data || {}), cellAnchor: { row, col } }
    editingNodeId.value = child.id
  }
}

function addTableRow(node: LayoutNode) {
  const table = node.node.data?.table
  if (!table) return
  table.rows.push(new Array(table.header.length).fill(''))
}

function addTableCol(node: LayoutNode) {
  const table = node.node.data?.table
  if (!table) return
  table.header.push('')
  for (const row of table.rows) row.push('')
}

function removeTableRow(node: LayoutNode) {
  const table = node.node.data?.table
  if (!table || table.rows.length === 0) return
  table.rows.pop()
  const geo = getTableGeometry(node.node)
  if (geo) clampCellAnchors(node.node.children, geo.rowCount, geo.colCount)
}

function removeTableCol(node: LayoutNode) {
  const table = node.node.data?.table
  if (!table || table.header.length <= 1) return
  table.header.pop()
  for (const row of table.rows) row.pop()
  const geo = getTableGeometry(node.node)
  if (geo) clampCellAnchors(node.node.children, geo.rowCount, geo.colCount)
}

// ---------- 代码块节点 ----------

function languageLabel(node: MindMapNode): string {
  const lang = node.data?.code?.language || 'text'
  return CODE_LANGUAGES.find(l => l.value === lang)?.label || lang
}

function highlightedCode(node: MindMapNode): string {
  return highlightCode(node.text || '', node.data?.code?.language || 'text')
}

function handleCodeLanguage(language: string) {
  const node = editingNode.value?.node
  if (node?.data?.code) {
    node.data.code.language = language
    mapStore.document.updatedAt = Date.now()
  }
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
      // 表格/代码块/锚点子节点由自动布局接管，空白处拖放不落自由坐标
      const dragNode = mapStore.findNode(draggingNodeId.value)
      if (dragNode && !hasAutoLayoutOnly(dragNode)) {
        const newX = dragNodeInitialX.value + dx / scale.value
        const newY = dragNodeInitialY.value + dy / scale.value
        mapStore.updateNodePosition(draggingNodeId.value, newX, newY)
      }
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

// ---------- 可变快捷键：模式化分发（layout / node） ----------

const layoutMatcher = computed(() => buildMatcher('layout'))
const nodeMatcher = computed(() => buildMatcher('node'))

const pendingKeys = ref<string[]>([])
let pendingTimer: number | null = null

const layoutHints = computed(() => sequenceHints(layoutMatcher.value, pendingKeys.value))

function syncKeyboardStatus() {
  keyboardStatus.mode = editingNodeId.value ? 'editing' : (mapStore.focusedId ? 'node' : 'layout')
  keyboardStatus.pendingKeys = [...pendingKeys.value]
  keyboardStatus.hints = layoutHints.value
}

watch([() => mapStore.focusedId, editingNodeId, layoutHints], syncKeyboardStatus, { immediate: true })

function clearPendingKeys() {
  pendingKeys.value = []
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  syncKeyboardStatus()
}

function extendPendingKeys(tokens: string[]) {
  pendingKeys.value = tokens
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(clearPendingKeys, 2000)
  syncKeyboardStatus()
}

function handleKeyDown(event: KeyboardEvent) {
  if (editingNodeId.value) {
    clearPendingKeys()
    return
  }

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
    clearPendingKeys()
    return
  }

  const token = keyToken(event)
  if (!token) return

  const focusedId = mapStore.focusedId
  const mode: KeymapMode = focusedId ? 'node' : 'layout'
  const matcher = mode === 'node' ? nodeMatcher.value : layoutMatcher.value

  // 两模式统一支持序列键：节点模式下先选中节点，再 t/c 决定插什么块
  const pressed = [...pendingKeys.value, token]
  const result = matchSequence(matcher, pressed)

  if (result && 'pending' in result) {
    event.preventDefault()
    extendPendingKeys(pressed)
    return
  }

  if (result && 'actionId' in result) {
    event.preventDefault()
    clearPendingKeys()
    dispatchKeymapAction(result.actionId)
    return
  }

  clearPendingKeys()
}

function dispatchKeymapAction(actionId: string) {
  const focusedId = mapStore.focusedId

  switch (actionId) {
    // 插入结构化块：目标=聚焦节点（无则根，根的并列退化为子级）。
    // 节点模式与布局模式共用同一目标解析。
    case 'layout:table-sibling':
    case 'node:table-sibling':
      insertSpecialNode('table', 'sibling')
      return
    case 'layout:table-child':
    case 'node:table-child':
      insertSpecialNode('table', 'child')
      return
    case 'layout:code-sibling':
    case 'node:code-sibling':
      insertSpecialNode('code', 'sibling')
      return
    case 'layout:code-child':
    case 'node:code-child':
      insertSpecialNode('code', 'child')
      return

    // 布局模式：画布导航
    case 'layout:pan-left':
      panX.value -= 60
      return
    case 'layout:pan-right':
      panX.value += 60
      return
    case 'layout:pan-up':
      panY.value -= 60
      return
    case 'layout:pan-down':
      panY.value += 60
      return
    case 'layout:zoom-in':
      mapStore.setZoom(mapStore.zoom + 10)
      return
    case 'layout:zoom-out':
      mapStore.setZoom(mapStore.zoom - 10)
      return
    case 'layout:zoom-reset':
      mapStore.setZoom(100)
      return
    case 'layout:command-palette':
      window.dispatchEvent(new CustomEvent('onelook:open-palette'))
      return
    case 'layout:focus-root':
      mapStore.selectNode(mapStore.document.root.id)
      setKeymapMessage('已聚焦根节点（节点模式）')
      return

    // 节点模式（默认绑定与既有行为一致）
    case 'node:add-child': {
      if (!focusedId) return
      const focusedNode = mapStore.findNode(focusedId)
      if (focusedNode && isTableNode(focusedNode)) {
        // 表格节点上的加子级：默认挂到最后一行第一格
        const target = layoutNodes.value.find(n => n.id === focusedId)
        const geo = target ? getTableGeometry(target.node) : null
        if (target && geo) {
          handleCellAddChild(target, Math.max(1, geo.rowCount - 1), 0)
          return
        }
      }
      mapStore.addChild(focusedId)
      return
    }
    case 'node:add-sibling':
      if (focusedId && Date.now() - lastEditClosedAt.value > 250) {
        mapStore.addSibling(focusedId)
      }
      return
    case 'node:edit':
      if (focusedId) editingNodeId.value = focusedId
      return
    case 'node:delete':
      if (focusedId) {
        mapStore.deleteNode(focusedId)
        setKeymapMessage('已删除节点')
      }
      return
    case 'node:context-menu':
      if (focusedId) openContextMenuOnNode(focusedId)
      return
    case 'node:clear-focus':
      mapStore.clearSelection()
      return
    case 'node:undo':
      mapStore.undo()
      return
    case 'node:redo':
      mapStore.redo()
      return
    case 'node:copy':
      if (focusedId) mapStore.copyNode(focusedId)
      return
    case 'node:paste':
      if (focusedId) mapStore.pasteNode(focusedId)
      return
    case 'node:nav-parent':
      mapStore.navigateToParent()
      return
    case 'node:nav-child':
      mapStore.navigateToChild()
      return
    case 'node:nav-prev':
      mapStore.navigateToPrevSibling()
      return
    case 'node:nav-next':
      mapStore.navigateToNextSibling()
      return
  }
}

function insertSpecialNode(kind: 'table' | 'code', relation: 'sibling' | 'child') {
  const focusedId = mapStore.focusedId
  const rootId = mapStore.document.root.id
  const target = focusedId ?? rootId
  const isSibling = relation === 'sibling' && target !== rootId

  const node = isSibling
    ? mapStore.addSibling(target, kind === 'table' ? '表格' : defaultCodeText())
    : mapStore.addChild(target, kind === 'table' ? '表格' : defaultCodeText())
  if (node) {
    node.data = {
      ...(node.data || {}),
      ...(kind === 'table' ? { table: defaultTableData() } : { code: defaultCodeData() }),
    }
  }
  setKeymapMessage(`已插入${kind === 'table' ? '表格' : '代码块'}（${isSibling ? '并列' : '子级'}），新节点已聚焦`)
}

/** 键盘（m 键）打开节点菜单：定位于节点屏幕坐标 */
function openContextMenuOnNode(nodeId: string) {
  const ln = layoutNodes.value.find(n => n.id === nodeId)
  if (!ln || !svgRef.value) return
  const rect = svgRef.value.getBoundingClientRect()
  const x = rect.left + ln.x * scale.value + panX.value
  const y = rect.top + ln.y * scale.value + panY.value
  contextMenuRef.value?.open(x, y, nodeId)
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

.ref-btn {
  cursor: pointer;
}

.ref-btn-bg {
  fill: var(--color-primary);
  opacity: 0.9;
}

.ref-btn-text {
  font-size: 10px;
  fill: white;
  font-weight: 600;
  pointer-events: none;
}

.ref-btn:hover .ref-btn-bg {
  opacity: 1;
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

/* ---------- 表格节点 ---------- */

.table-node {
  width: 100%;
  height: 100%;
  background: var(--color-bg);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.tn-table {
  width: 100%;
  height: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
  color: var(--color-text);
}

.tn-table th,
.tn-table td {
  border: 1px solid var(--color-border);
  padding: 0 6px;
  height: 30px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
}

.tn-table th {
  background: var(--color-bg-secondary);
  font-weight: 600;
}

.tn-table td:hover,
.tn-table th:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.tn-cell-text {
  vertical-align: middle;
}

.tn-add {
  display: none;
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  line-height: 14px;
  padding: 0;
  border: 1px solid var(--color-primary);
  border-radius: 50%;
  background: var(--color-bg);
  color: var(--color-primary);
  font-size: 11px;
  cursor: pointer;
  text-align: center;
}

.tn-table th:hover .tn-add,
.tn-table td:hover .tn-add {
  display: inline-block;
}

.tn-badge {
  display: inline-block;
  margin-left: 3px;
  min-width: 14px;
  height: 14px;
  line-height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  text-align: center;
  vertical-align: middle;
}

.tn-controls {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.tn-controls button {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 7px;
  cursor: pointer;
}

.tn-controls button:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.cell-edit-input {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 1001;
  min-width: 90px;
  max-width: 260px;
  padding: 4px 8px;
  border: 2px solid var(--color-primary);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}

/* ---------- 代码块节点 ---------- */

.code-node {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f6f8fa;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.code-node-head {
  flex: none;
  height: 22px;
  line-height: 22px;
  padding: 0 10px;
  background: rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-secondary);
}

.code-node-body {
  flex: 1;
  margin: 0;
  padding: 8px 10px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.45;
  color: #24292f;
  white-space: pre;
  overflow: hidden;
}

.code-node-body :deep(.hljs-keyword),
.code-node-body :deep(.hljs-selector-tag),
.code-node-body :deep(.hljs-built_in) { color: #cf222e; }
.code-node-body :deep(.hljs-string),
.code-node-body :deep(.hljs-attr) { color: #0a3069; }
.code-node-body :deep(.hljs-comment) { color: #6e7781; font-style: italic; }
.code-node-body :deep(.hljs-number),
.code-node-body :deep(.hljs-literal) { color: #0550ae; }
.code-node-body :deep(.hljs-title),
.code-node-body :deep(.hljs-name) { color: #8250df; }
.code-node-body :deep(.hljs-type),
.code-node-body :deep(.hljs-class .hljs-title) { color: #953800; }

/* ---------- vault 引用徽标 ---------- */

.vault-ref-badge {
  cursor: pointer;
}

.vault-ref-bg {
  fill: var(--color-primary);
  opacity: 0.92;
}

.vault-ref-text {
  fill: #fff;
  font-size: 10px;
  font-family: 'Inter', system-ui, sans-serif;
  pointer-events: none;
}

.vault-ref-badge:hover .vault-ref-bg {
  opacity: 1;
}

/* ---------- 布局模式序列键提示 ---------- */

.keyseq-hint {
  position: absolute;
  left: 50%;
  bottom: 56px;
  transform: translateX(-50%);
  z-index: 1002;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 14px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  color: var(--color-text);
}

.keyseq-prefix {
  color: var(--color-primary);
  font-weight: 600;
}

.keyseq-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
}

.keyseq-option kbd {
  display: inline-block;
  min-width: 20px;
  padding: 1px 5px;
  border: 1px solid var(--color-border);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--color-bg-secondary);
  font-family: inherit;
  font-size: 11px;
  text-align: center;
  color: var(--color-text);
}

.keyseq-esc {
  color: var(--color-text-secondary);
  font-size: 11px;
  opacity: 0.7;
}
</style>

