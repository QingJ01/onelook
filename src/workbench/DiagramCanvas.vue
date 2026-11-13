<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import { Minus, Plus, Maximize } from 'lucide-vue-next'
import { layoutView, ROOT_ID } from './layout'
import { nodeKinds, viewForms, type KnowledgeNode, type Relation, type ViewForm } from './types'
import { nodeVisuals, relationTone } from './visual'

const props = defineProps<{
  form: ViewForm; nodes: KnowledgeNode[]; relations: Relation[]; positions: Record<string, { x: number; y: number }>; title: string
  selectedId: string; highlighted: string[]; editable: boolean
  /** Step state: which objects have appeared and which the step points at. Omitted outside a story. */
  state?: { visible: string[]; focus: string[] }
  playing?: boolean
}>()
const emit = defineEmits<{ select: [id: string]; move: [id: string, x: number, y: number] }>()
const markerId = `arrow-${useId()}`
const legend = computed(() => Object.entries(nodeKinds).flatMap(([kind, label]) => {
  const count = props.nodes.filter(node => node.kind === kind && (!props.state || props.state.visible.includes(node.id))).length
  return count ? [{ kind, label, count, tone: nodeVisuals[kind as KnowledgeNode['kind']].tone }] : []
}))
const edgeTone = (id: string) => relationTone(props.relations.find(edge => edge.id === id)?.kind)
const labelWidth = (label: string) => Math.max(26, Math.min(180, [...label].reduce((width, c) => width + (c.charCodeAt(0) > 255 ? 10 : 6), 12)))
const canvas = ref<SVGSVGElement>(), shell = ref<HTMLElement>()
const size = ref({ width: 900, height: 560 })
const drag = ref<{ id: string; dx: number; dy: number; x: number; y: number }>()
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const draggable = computed(() => props.editable && props.form === 'graph' && !props.state)
const layout = computed(() => layoutView({
  form: props.form, nodeIds: props.nodes.map(node => node.id), relations: props.relations, title: props.title,
  positions: drag.value ? { ...props.positions, [drag.value.id]: { x: drag.value.x, y: drag.value.y } } : props.positions,
}))
/** Until the reader zooms by hand, the whole diagram is scaled to fit the canvas. */
const manualZoom = ref<number>()
const fitZoom = computed(() => Math.max(.7, Math.min(1, (size.value.width - 40) / layout.value.width, (size.value.height - 40) / layout.value.height)))
const zoom = computed(() => manualZoom.value ?? fitZoom.value)
const setZoom = (value: number) => { manualZoom.value = Math.max(.4, Math.min(1.8, Math.round(value * 10) / 10)) }
const visible = computed(() => props.state ? new Set(props.state.visible) : undefined)
const focus = computed(() => new Set(props.state?.focus ?? []))
const shown = (id: string) => !visible.value || visible.value.has(id)
const edgeShown = (edge: { from: string; to: string }) => (edge.from === ROOT_ID || shown(edge.from)) && shown(edge.to)
function nodeClass(id: string) {
  if (!shown(id)) return props.playing ? 'is-hidden' : 'is-ghost'
  if (props.state) return focus.value.has(id) ? 'is-focus' : focus.value.size ? 'is-dim' : ''
  return props.highlighted.length && !props.highlighted.includes(id) ? 'is-dim' : ''
}
function edgeClass(edge: { from: string; to: string; cross: boolean }) {
  const hidden = !edgeShown(edge) ? (props.playing ? ' is-hidden' : ' is-ghost') : ''
  const dim = !props.state && props.highlighted.length && !(props.highlighted.includes(edge.from) && props.highlighted.includes(edge.to)) ? ' is-dim' : ''
  return `diagram-edge${edge.cross ? ' cross' : ''}${hidden}${dim}`
}
const tokens = computed(() => props.playing && !calm ? layout.value.edges.filter(edge => edgeShown(edge) && focus.value.has(edge.from) && focus.value.has(edge.to)) : [])
/** In play mode the camera frames what the step points at, or everything shown so far. */
const camera = computed(() => {
  if (!props.playing) return undefined
  const ids = focus.value.size ? [...focus.value] : props.state?.visible ?? []
  const boxes = ids.flatMap(id => layout.value.boxes[id] ? [layout.value.boxes[id]!] : [])
  if (!boxes.length) boxes.push({ x: 0, y: 0, w: layout.value.width, h: layout.value.height })
  const x1 = Math.min(...boxes.map(box => box.x)) - 60, y1 = Math.min(...boxes.map(box => box.y)) - 60
  const x2 = Math.max(...boxes.map(box => box.x + box.w)) + 60, y2 = Math.max(...boxes.map(box => box.y + box.h)) + 60
  const scale = Math.max(.35, Math.min(1.15, size.value.width / (x2 - x1), size.value.height / (y2 - y1)))
  return { transform: `translate(${size.value.width / 2 - scale * (x1 + x2) / 2}px, ${size.value.height / 2 - scale * (y1 + y2) / 2}px) scale(${scale})` }
})
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!shell.value || typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect
    if (box?.width && box.height) size.value = { width: box.width, height: box.height }
  })
  observer.observe(shell.value)
})
onUnmounted(() => observer?.disconnect())

function point(event: PointerEvent) {
  const matrix = canvas.value?.getScreenCTM()?.inverse()
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix) : null
}
function start(event: PointerEvent, id: string) {
  emit('select', id)
  if (!draggable.value || event.button !== 0) return
  const p = point(event), box = layout.value.boxes[id]
  if (!p || !box) return
  drag.value = { id, dx: p.x - box.x, dy: p.y - box.y, x: box.x, y: box.y }
  canvas.value?.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  const p = point(event)
  if (drag.value && p) { drag.value.x = Math.max(15, p.x - drag.value.dx); drag.value.y = Math.max(15, p.y - drag.value.dy) }
}
function end() {
  if (drag.value) { emit('move', drag.value.id, Math.round(drag.value.x), Math.round(drag.value.y)); drag.value = undefined }
}
</script>

<template>
  <div class="graph-shell" :class="{ playing }">
    <div v-if="!playing" class="graph-topline"><span><b>{{ viewForms[form].name }}</b>{{ nodes.length }} 个对象{{ form === 'timeline' ? '' : ` · ${relations.length} 条关系` }}</span><span class="graph-hint">{{ draggable ? '拖动对象调整布局 · 点击编辑内容' : state ? '淡化对象尚未在讲解中出现' : form === 'graph' ? '点击对象查看解释、来源与关联' : '布局自动生成 · 点击对象查看详情' }}</span></div>
    <div v-if="!nodes.length" class="graph-empty"><p>还没有对象。添加一个，或从资料生成。</p></div>
    <div v-else ref="shell" class="graph-scroll">
      <svg
        ref="canvas" class="semantic-graph" :class="[`form-${form}`, { calm, dragging: !!drag }]" :aria-label="`${viewForms[form].name}：${title}`"
        :viewBox="playing ? `0 0 ${size.width} ${size.height}` : `0 0 ${layout.width} ${layout.height}`"
        :style="playing ? { width: '100%', height: '100%' } : { width: `${layout.width * zoom}px`, height: `${layout.height * zoom}px` }"
        @pointermove="move" @pointerup="end" @pointercancel="drag = undefined">
        <defs><marker :id="markerId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
        <g class="diagram-camera" :style="camera">
          <g v-if="layout.axis" class="diagram-axis">
            <line :x1="layout.axis.x1" :y1="layout.axis.y" :x2="layout.axis.x2" :y2="layout.axis.y" />
            <line v-for="tick in layout.axis.ticks" :key="tick.id" :class="['tick', nodeClass(tick.id)]" :x1="tick.x" :y1="tick.y1" :x2="tick.x" :y2="tick.y2" />
          </g>
          <g v-for="edge in layout.edges" :key="edge.id" :class="[edgeClass(edge), `semantic-${edgeTone(edge.id)}`]">
            <path :d="edge.d" pathLength="1" :marker-end="`url(#${markerId})`" />
            <template v-if="edge.label"><rect class="edge-label-bg" :x="edge.lx - labelWidth(edge.label) / 2" :y="edge.ly - 11" :width="labelWidth(edge.label)" height="16" rx="4" /><text :x="edge.lx" :y="edge.ly" text-anchor="middle">{{ edge.label }}</text></template>
          </g>
          <g v-if="layout.root" class="diagram-root">
            <rect :x="layout.root.box.x" :y="layout.root.box.y" :width="layout.root.box.w" :height="layout.root.box.h" rx="8" />
            <text :x="layout.root.box.x + layout.root.box.w / 2" :y="layout.root.box.y + layout.root.box.h / 2 + 5" text-anchor="middle">{{ layout.root.title.slice(0, 12) }}</text>
          </g>
          <g v-for="node in nodes" :key="node.id" :class="['diagram-node', nodeClass(node.id), `semantic-${nodeVisuals[node.kind].tone}`]" :data-node="node.id" :style="{ transform: `translate(${layout.boxes[node.id]!.x}px, ${layout.boxes[node.id]!.y}px)` }">
            <foreignObject :width="layout.boxes[node.id]!.w" :height="layout.boxes[node.id]!.h">
              <button class="graph-node" :class="{ selected: selectedId === node.id, draggable }" :aria-pressed="selectedId === node.id" :tabindex="shown(node.id) ? 0 : -1" @click="emit('select', node.id)" @pointerdown="start($event, node.id)">
                <span class="node-kicker"><span class="node-sigil" aria-hidden="true">{{ nodeVisuals[node.kind].sigil }}</span>{{ nodeKinds[node.kind] }}<span v-if="node.citations.length" class="source-beacon" :title="`${node.citations.length} 处资料关联`">SRC {{ node.citations.length }}</span><span v-else-if="node.provenance === 'ai'" class="ai-tag">AI</span></span>
                <strong :title="node.title">{{ node.title }}</strong><span class="node-caption" :title="node.body">{{ node.body || '待补充说明' }}</span>
              </button>
            </foreignObject>
          </g>
          <circle v-for="edge in tokens" :key="`token-${edge.id}`" class="diagram-token" r="5"><animateMotion :path="edge.d" dur="1.4s" repeatCount="indefinite" /></circle>
        </g>
      </svg>
    </div>
    <div v-if="legend.length" class="graph-legend" aria-label="对象类型图例"><span v-for="item in legend" :key="item.kind" :class="`semantic-${item.tone}`"><i aria-hidden="true" />{{ item.label }}<b>{{ item.count }}</b></span></div>
    <div v-if="!playing && nodes.length" class="graph-bottom"><div class="zoom-tools"><button aria-label="缩小地图" title="缩小" @click="setZoom(zoom - .1)"><Minus :size="15" /></button><span>{{ Math.round(zoom * 100) }}%</span><button aria-label="放大地图" title="放大" @click="setZoom(zoom + .1)"><Plus :size="15" /></button><button aria-label="重置地图缩放" title="适应窗口" :class="{ active: manualZoom === undefined }" @click="manualZoom = undefined"><Maximize :size="14" /></button></div></div>
  </div>
</template>
