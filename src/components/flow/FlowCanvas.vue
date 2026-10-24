<template>
  <div class="flow-shell">
    <header class="flow-header">
      <button class="flow-back" @click="handleClose">← 返回导图</button>
      <span class="flow-title">{{ flow.document?.name || document.name }}</span>
      <span class="flow-type">流程图</span>
      <span class="flow-hint">右键添加节点 · 双击编辑 · 拖拽移动 · 从右侧圆点拖到目标连线</span>
      <span class="flow-save">{{ saveLabel }}</span>
    </header>

    <div
      ref="stageRef"
      class="flow-stage"
      @mousedown="handleStageMouseDown"
      @mousemove="handleStageMouseMove"
      @mouseup="handleStageMouseUp"
      @wheel.prevent="handleWheel"
      @contextmenu.prevent="handleStageContextMenu"
    >
      <svg class="flow-svg">
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" class="flow-arrow-head" />
          </marker>
        </defs>

        <g :transform="`translate(${panX}, ${panY}) scale(${scale})`">
          <g class="flow-edges-layer">
            <path
              v-for="routed in layout.edges"
              :key="routed.edge.id"
              :d="routed.path"
              :data-flow-edge="routed.edge.id"
              class="flow-edge"
              :class="{ selected: flow.selectedEdgeId === routed.edge.id }"
              marker-end="url(#flow-arrow)"
              @mousedown.stop
              @click.stop="flow.selectEdge(routed.edge.id)"
            />
            <line
              v-if="connectingFrom"
              :x1="connectingStart.x"
              :y1="connectingStart.y"
              :x2="connectingEnd.x"
              :y2="connectingEnd.y"
              class="flow-edge-preview"
            />
          </g>

          <g class="flow-nodes-layer">
            <g
              v-for="n in layout.nodes"
              :key="n.node.id"
              class="flow-node"
              :class="[
                `kind-${n.node.kind}`,
                { selected: flow.selectedNodeId === n.node.id, dragging: draggingId === n.node.id },
              ]"
              :data-flow-node="n.node.id"
              :transform="`translate(${n.x}, ${n.y})`"
              @mousedown.stop="handleNodeMouseDown(n, $event)"
              @mouseup.stop="handleNodeMouseUp(n, $event)"
              @click.stop="flow.selectNode(n.node.id)"
              @dblclick.stop="startEditing(n.node.id)"
            >
              <path :d="shapePath(n)" class="flow-node-shape" />
              <foreignObject
                :x="-n.width / 2 + 12"
                :y="-n.height / 2 + 8"
                :width="n.width - 24"
                :height="n.height - 16"
                pointer-events="none"
              >
                <div xmlns="http://www.w3.org/1999/xhtml" class="flow-node-text">{{ n.node.text }}</div>
              </foreignObject>
              <circle
                class="flow-anchor"
                :cx="n.width / 2"
                cy="0"
                r="6"
                @mousedown.stop="startConnecting(n)"
              />
            </g>
          </g>
        </g>
      </svg>

      <NodeEditor
        :is-editing="editingId !== null"
        :text="editingNode?.text || ''"
        :x="editingLayout?.x || 0"
        :y="editingLayout?.y || 0"
        :width="editingLayout?.width || 160"
        :height="editingLayout?.height || 60"
        :scale="scale"
        :pan-x="panX"
        :pan-y="panY"
        mode="text"
        @save="handleEditSave"
        @cancel="editingId = null"
      />

      <div
        v-if="menu.open"
        class="flow-menu"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
        @mousedown.stop
      >
        <template v-if="menu.nodeId">
          <button @click="menuEditNode">编辑文本</button>
          <button @click="menuStartConnect">从此节点连线</button>
          <div class="flow-menu-divider"></div>
          <button class="danger" @click="menuDeleteNode">删除节点</button>
        </template>
        <template v-else-if="menu.edgeId">
          <button class="danger" @click="menuDeleteEdge">删除连线</button>
        </template>
        <template v-else>
          <div class="flow-menu-title">添加节点</div>
          <button v-for="kind in NODE_KINDS" :key="kind.value" @click="menuAddNode(kind.value)">
            <span class="flow-menu-dot" :class="`dot-${kind.value}`"></span>{{ kind.label }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch, nextTick } from 'vue'
import type { FlowDocument, FlowNode, FlowNodeKind } from '@/types'
import { FlowLayoutEngine, flowNodeSize, type FlowLayoutNode } from '@/core/layout/flowEngine'
import type { PositionedGraphNode } from '@/core/layout/graph'
import { useFlowStore } from '@/stores/flowStore'
import NodeEditor from '@/components/editor/NodeEditor.vue'

const props = defineProps<{ document: FlowDocument }>()
const emit = defineEmits<{ close: [] }>()

const flow = useFlowStore()
flow.loadDocument(props.document)

const NODE_KINDS: Array<{ value: FlowNodeKind; label: string }> = [
  { value: 'start', label: '开始' },
  { value: 'process', label: '处理' },
  { value: 'decision', label: '判断' },
  { value: 'io', label: '输入/输出' },
  { value: 'end', label: '结束' },
  { value: 'note', label: '说明' },
]

const stageRef = ref<HTMLDivElement | null>(null)
const panX = ref(0)
const panY = ref(0)
const scale = ref(1)

const engine = new FlowLayoutEngine()

const layout = computed(() => {
  const doc = flow.document
  if (!doc) return { nodes: [], edges: [] }
  const nodes: FlowLayoutNode[] = doc.nodes.map(node => {
    const size = flowNodeSize(node)
    return { ...node, width: size.width, height: size.height }
  })
  const edges = doc.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, edge }))
  return engine.layout(nodes, edges)
})

const editingId = ref<string | null>(null)
const editingNode = computed<FlowNode | null>(() =>
  editingId.value ? flow.nodeById(editingId.value) : null,
)
const editingLayout = computed(() =>
  editingId.value ? layout.value.nodes.find(n => n.node.id === editingId.value) ?? null : null,
)

// ---------- 坐标换算 ----------

function toCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const rect = stageRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (clientX - rect.left - panX.value) / scale.value,
    y: (clientY - rect.top - panY.value) / scale.value,
  }
}

// ---------- 平移 / 缩放 ----------

let panning = false
let panStart = { x: 0, y: 0, panX: 0, panY: 0 }

function handleStageMouseDown(event: MouseEvent) {
  if (event.button !== 0) return
  const target = event.target as Element
  if (target.closest('[data-flow-node]')) return
  menu.open = false
  panning = true
  panStart = { x: event.clientX, y: event.clientY, panX: panX.value, panY: panY.value }
  flow.selectNode(null)
  flow.selectEdge(null)
}

function handleStageMouseMove(event: MouseEvent) {
  if (panning) {
    panX.value = panStart.panX + (event.clientX - panStart.x)
    panY.value = panStart.panY + (event.clientY - panStart.y)
    return
  }
  if (draggingId.value) {
    const point = toCanvas(event.clientX, event.clientY)
    flow.moveNode(draggingId.value, point.x - dragOffset.x, point.y - dragOffset.y)
    return
  }
  if (connectingFrom.value) {
    connectingEnd.value = toCanvas(event.clientX, event.clientY)
  }
}

function handleStageMouseUp() {
  panning = false
  draggingId.value = null
  connectingFrom.value = null
}

function handleWheel(event: WheelEvent) {
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  scale.value = Math.min(2.5, Math.max(0.3, +(scale.value + delta).toFixed(2)))
}

// ---------- 节点拖拽 / 连线 ----------

const draggingId = ref<string | null>(null)
const dragOffset = { x: 0, y: 0 }

function handleNodeMouseDown(n: PositionedGraphNode<FlowLayoutNode>, event: MouseEvent) {
  menu.open = false
  flow.selectNode(n.node.id)
  const point = toCanvas(event.clientX, event.clientY)
  draggingId.value = n.node.id
  dragOffset.x = point.x - n.x
  dragOffset.y = point.y - n.y
}

function handleNodeMouseUp(n: PositionedGraphNode<FlowLayoutNode>, event: MouseEvent) {
  if (connectingFrom.value) {
    event.stopPropagation()
    if (connectingFrom.value !== n.node.id) {
      flow.connect(connectingFrom.value, n.node.id)
    }
    connectingFrom.value = null
  }
  draggingId.value = null
}

const connectingFrom = ref<string | null>(null)
const connectingStart = ref({ x: 0, y: 0 })
const connectingEnd = ref({ x: 0, y: 0 })

function startConnecting(n: PositionedGraphNode<FlowLayoutNode>) {
  connectingFrom.value = n.node.id
  connectingStart.value = { x: n.x + n.width / 2, y: n.y }
  connectingEnd.value = { x: n.x + n.width / 2 + 40, y: n.y }
}

// ---------- 编辑 ----------

function startEditing(id: string) {
  flow.selectNode(id)
  editingId.value = id
}

function handleEditSave(text: string) {
  if (editingId.value) flow.updateNodeText(editingId.value, text)
  editingId.value = null
}

// ---------- 右键菜单 ----------

const menu = reactive<{
  open: boolean
  x: number
  y: number
  canvasX: number
  canvasY: number
  nodeId: string | null
  edgeId: string | null
}>({ open: false, x: 0, y: 0, canvasX: 0, canvasY: 0, nodeId: null, edgeId: null })

function handleStageContextMenu(event: MouseEvent) {
  const target = event.target as Element
  const rect = stageRef.value?.getBoundingClientRect()
  if (!rect) return
  const point = toCanvas(event.clientX, event.clientY)
  menu.open = true
  menu.x = event.clientX - rect.left
  menu.y = event.clientY - rect.top
  menu.canvasX = point.x
  menu.canvasY = point.y
  menu.nodeId = target.closest('[data-flow-node]')?.getAttribute('data-flow-node') ?? null
  menu.edgeId = target.closest('[data-flow-edge]')?.getAttribute('data-flow-edge') ?? null
}

function menuAddNode(kind: FlowNodeKind) {
  flow.addNode(kind, { x: menu.canvasX, y: menu.canvasY })
  menu.open = false
}

function menuEditNode() {
  if (menu.nodeId) startEditing(menu.nodeId)
  menu.open = false
}

function menuStartConnect() {
  if (menu.nodeId) {
    const n = layout.value.nodes.find(item => item.node.id === menu.nodeId)
    if (n) startConnecting(n)
    flow.selectNode(menu.nodeId)
  }
  menu.open = false
}

function menuDeleteNode() {
  if (menu.nodeId) flow.deleteNode(menu.nodeId)
  menu.open = false
}

function menuDeleteEdge() {
  if (menu.edgeId) flow.deleteEdge(menu.edgeId)
  menu.open = false
}

// ---------- 形状 ----------

function roundedRect(w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h / 2)
  return [
    `M ${-w / 2 + radius} ${-h / 2}`,
    `H ${w / 2 - radius}`,
    `Q ${w / 2} ${-h / 2} ${w / 2} ${-h / 2 + radius}`,
    `V ${h / 2 - radius}`,
    `Q ${w / 2} ${h / 2} ${w / 2 - radius} ${h / 2}`,
    `H ${-w / 2 + radius}`,
    `Q ${-w / 2} ${h / 2} ${-w / 2} ${h / 2 - radius}`,
    `V ${-h / 2 + radius}`,
    `Q ${-w / 2} ${-h / 2} ${-w / 2 + radius} ${-h / 2}`,
    'Z',
  ].join(' ')
}

function shapePath(n: PositionedGraphNode<FlowLayoutNode>): string {
  const w = n.width
  const h = n.height
  switch (n.node.kind) {
    case 'start':
    case 'end':
      return roundedRect(w, h, h / 2)
    case 'decision':
      return `M 0 ${-h / 2} L ${w / 2} 0 L 0 ${h / 2} L ${-w / 2} 0 Z`
    case 'io': {
      const off = Math.min(18, w / 4)
      return `M ${-w / 2 + off} ${-h / 2} L ${w / 2} ${-h / 2} L ${w / 2 - off} ${h / 2} L ${-w / 2} ${h / 2} Z`
    }
    default:
      return roundedRect(w, h, 8)
  }
}

// ---------- 键盘 ----------

function handleKeyDown(event: KeyboardEvent) {
  const active = document.activeElement
  const isInput = active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active as HTMLElement | null)?.isContentEditable
  if (isInput || editingId.value) return
  if (event.isComposing) return

  if (event.key === 'Escape') {
    menu.open = false
    flow.selectNode(null)
    flow.selectEdge(null)
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? flow.redo() : flow.undo()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    flow.redo()
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    flow.deleteSelection()
    return
  }
  if ((event.key === 'F2' || event.key === ' ') && flow.selectedNodeId) {
    event.preventDefault()
    startEditing(flow.selectedNodeId)
    return
  }
  if (event.key === '0') {
    scale.value = 1
    panX.value = 0
    panY.value = 0
  }
}

// ---------- 保存 ----------

const saveLabel = ref('已保存')
let saveTimer: number | null = null

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    saveLabel.value = '保存中…'
    await flow.save()
    saveLabel.value = '已保存'
  }, 800)
}

watch(
  () => flow.document,
  () => scheduleSave(),
  { deep: true },
)

async function handleClose() {
  if (saveTimer) clearTimeout(saveTimer)
  await flow.save()
  emit('close')
}

watch(
  () => props.document.name,
  (name) => {
    if (flow.document && name !== flow.document.name) flow.document.name = name
  },
)

onMounted(() => {
  document.body.dataset.surface = 'flow'
  window.addEventListener('keydown', handleKeyDown)
  nextTick(() => {
    // 初始聚焦根层（第一层）居中
    panX.value = (stageRef.value?.clientWidth ?? 900) / 2
    panY.value = 96
  })
})

onUnmounted(() => {
  delete document.body.dataset.surface
  window.removeEventListener('keydown', handleKeyDown)
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<style scoped>
.flow-shell {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.flow-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}

.flow-back {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

.flow-back:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.flow-title {
  font-weight: 600;
  font-size: 14px;
}

.flow-type {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
}

.flow-hint {
  flex: 1;
  text-align: right;
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-save {
  flex: none;
  font-size: 11px;
  color: #16a34a;
}

.flow-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
  cursor: grab;
  background-image:
    linear-gradient(color-mix(in srgb, var(--color-border) 45%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--color-border) 45%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
}

.flow-stage:active {
  cursor: grabbing;
}

.flow-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.flow-edge {
  fill: none;
  stroke: #94a3b8;
  stroke-width: 2;
  pointer-events: visibleStroke;
  cursor: pointer;
}

.flow-edge:hover {
  stroke: var(--color-primary);
}

.flow-edge.selected {
  stroke: var(--color-primary);
  stroke-width: 3;
}

.flow-edge-preview {
  stroke: var(--color-primary);
  stroke-width: 2;
  stroke-dasharray: 5 4;
}

.flow-arrow-head {
  fill: #94a3b8;
}

.flow-node {
  cursor: move;
}

.flow-node-shape {
  fill: var(--color-bg);
  stroke: var(--color-border);
  stroke-width: 2;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.08));
}

.flow-node.kind-start .flow-node-shape {
  fill: #dcfce7;
  stroke: #16a34a;
}

.flow-node.kind-end .flow-node-shape {
  fill: #fee2e2;
  stroke: #dc2626;
}

.flow-node.kind-decision .flow-node-shape {
  fill: #fef3c7;
  stroke: #d97706;
}

.flow-node.kind-io .flow-node-shape {
  fill: #e0f2fe;
  stroke: #0284c7;
}

.flow-node.kind-note .flow-node-shape {
  stroke-dasharray: 6 4;
  fill: var(--color-bg-secondary);
}

.flow-node.selected .flow-node-shape {
  stroke: var(--color-primary);
  stroke-width: 3;
}

.flow-node.dragging .flow-node-shape {
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.2));
}

.flow-node-text {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 13px;
  line-height: 1.35;
  color: var(--color-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: hidden;
}

.flow-anchor {
  fill: var(--color-bg);
  stroke: var(--color-primary);
  stroke-width: 2;
  opacity: 0;
  cursor: crosshair;
  transition: opacity 0.12s;
}

.flow-node:hover .flow-anchor,
.flow-node.selected .flow-anchor {
  opacity: 1;
}

.flow-menu {
  position: absolute;
  z-index: 10;
  min-width: 148px;
  padding: 5px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.flow-menu button {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
}

.flow-menu button:hover {
  background: var(--color-bg-secondary);
}

.flow-menu button.danger {
  color: #dc2626;
}

.flow-menu-title {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.flow-menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--color-border);
}

.flow-menu-dot {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 2px solid var(--color-border);
}

.flow-menu-dot.dot-start { border-radius: 50%; border-color: #16a34a; }
.flow-menu-dot.dot-end { border-radius: 50%; border-color: #dc2626; }
.flow-menu-dot.dot-decision { transform: rotate(45deg); border-color: #d97706; }
.flow-menu-dot.dot-io { background: #0284c7; border-color: #0284c7; }
.flow-menu-dot.dot-note { border-style: dashed; }
</style>
