<script setup lang="ts">
import { computed, ref } from 'vue'
import { Minus, Plus, LocateFixed, ArrowDownRight } from 'lucide-vue-next'
import { nodeKinds, type KnowledgeNode, type Relation } from './types'

const props = defineProps<{ nodes: KnowledgeNode[]; relations: Relation[]; selectedId: string; highlighted: string[]; editable: boolean }>()
const emit = defineEmits<{ select: [id: string]; move: [id: string, x: number, y: number] }>()
const zoom = ref(.8)
const canvas = ref<SVGSVGElement>()
const drag = ref<{ id: string; dx: number; dy: number; x: number; y: number }>()
const placed = computed(() => props.nodes.map((node, i) => ({ ...node,
  x: drag.value?.id === node.id ? drag.value.x : node.x ?? 60 + (i % 3) * 280,
  y: drag.value?.id === node.id ? drag.value.y : node.y ?? 70 + Math.floor(i / 3) * 230,
})))
const width = computed(() => Math.max(940, ...placed.value.map(n => n.x + 270)))
const height = computed(() => Math.max(610, ...placed.value.map(n => n.y + 170)))
const edges = computed(() => props.relations.flatMap(edge => {
  const a = placed.value.find(n => n.id === edge.from)
  const b = placed.value.find(n => n.id === edge.to)
  if (!a || !b) return []
  const horizontal = Math.abs(b.x - a.x) > Math.abs(b.y - a.y)
  const forward = horizontal ? b.x > a.x : b.y > a.y
  const x1 = horizontal ? a.x + (forward ? 210 : 0) : a.x + 105
  const y1 = horizontal ? a.y + 48 : a.y + (forward ? 96 : 0)
  const x2 = horizontal ? b.x + (forward ? 0 : 210) : b.x + 105
  const y2 = horizontal ? b.y + 48 : b.y + (forward ? 0 : 96)
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2
  const path = horizontal ? `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`
  return [{ ...edge, path, labelX: midX, labelY: midY - 10 }]
}))
function point(event: PointerEvent) {
  const matrix = canvas.value?.getScreenCTM()?.inverse()
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix) : null
}
function start(event: PointerEvent, node: typeof placed.value[number]) {
  emit('select', node.id)
  if (!props.editable || event.button !== 0) return
  const p = point(event)
  if (!p) return
  drag.value = { id: node.id, dx: p.x - node.x, dy: p.y - node.y, x: node.x, y: node.y }
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
  <div class="graph-shell">
    <div class="graph-topline"><span><i class="live-dot" /> 关系地图</span><span>{{ nodes.length }} 个对象 · {{ relations.length }} 条关系</span></div>
    <div v-if="!nodes.length" class="graph-empty"><ArrowDownRight :size="36" /><h3>从一个对象开始</h3><p>添加组件、需求或概念，也可以从资料生成地图。</p></div>
    <div v-else class="graph-scroll">
      <svg ref="canvas" :viewBox="`0 0 ${width} ${height}`" :style="{ width: `${width * zoom}px`, height: `${height * zoom}px` }" class="semantic-graph" aria-label="知识关系地图" @pointermove="move" @pointerup="end" @pointercancel="drag = undefined">
        <defs><marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca7ba" /></marker></defs>
        <g v-for="edge in edges" :key="edge.id" :opacity="highlighted.length && !(highlighted.includes(edge.from) && highlighted.includes(edge.to)) ? .2 : 1">
          <path :d="edge.path" fill="none" stroke="#aab5c6" stroke-width="1.7" marker-end="url(#edge-arrow)" />
          <text :x="edge.labelX" :y="edge.labelY" text-anchor="middle" fill="#788396" font-size="11" stroke="#f5f7fb" stroke-width="5" paint-order="stroke">{{ edge.label }}</text>
        </g>
        <g v-for="node in placed" :key="node.id" :transform="`translate(${node.x}, ${node.y})`" :opacity="highlighted.length && !highlighted.includes(node.id) ? .3 : 1">
          <foreignObject width="210" height="96">
            <button class="graph-node" :class="{ selected: selectedId === node.id, draggable: editable }" :aria-pressed="selectedId === node.id" @click="emit('select', node.id)" @pointerdown="start($event, node)">
              <span class="node-kicker"><span class="node-symbol">{{ node.kind === 'component' ? '◈' : node.kind === 'state' ? '◇' : '◎' }}</span>{{ nodeKinds[node.kind] }}<span v-if="node.provenance === 'ai'" class="ai-tag">AI</span></span>
              <strong>{{ node.title }}</strong><span class="node-caption">{{ node.citations.length ? `${node.citations.length} 处资料关联` : '待补充来源' }}</span>
            </button>
          </foreignObject>
        </g>
      </svg>
    </div>
    <div class="graph-bottom"><span>{{ editable ? '拖动对象调整布局 · 点击编辑内容' : '点击对象查看解释、来源与关联' }}</span><div class="zoom-tools"><button aria-label="缩小地图" @click="zoom = Math.max(.4, zoom - .1)"><Minus :size="15" /></button><span>{{ Math.round(zoom * 100) }}%</span><button aria-label="放大地图" @click="zoom = Math.min(1.8, zoom + .1)"><Plus :size="15" /></button><button aria-label="重置地图缩放" @click="zoom = 1"><LocateFixed :size="15" /></button></div></div>
  </div>
</template>
