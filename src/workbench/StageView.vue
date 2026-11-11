<script setup lang="ts">
import { computed } from 'vue'
import DiagramCanvas from './DiagramCanvas.vue'
import MatrixTable from './MatrixTable.vue'
import SequenceDiagram from './SequenceDiagram.vue'
import type { Workspace } from './types'

/** Renders whatever a stage id points at: a diagram view, a request flow, a decision or a product record. */
const props = defineProps<{
  workspace: Workspace; stageId: string; selectedId: string; editable?: boolean; highlighted?: string[]
  state?: { visible: string[]; focus: string[] }; playing?: boolean
}>()
const emit = defineEmits<{ select: [id: string]; move: [id: string, x: number, y: number] }>()
const view = computed(() => props.workspace.views.find(item => item.id === props.stageId))
const nodes = computed(() => view.value?.nodeIds.flatMap(id => props.workspace.nodes.filter(node => node.id === id)) ?? [])
const relations = computed(() => props.workspace.relations.filter(r => view.value?.nodeIds.includes(r.from) && view.value.nodeIds.includes(r.to)))
const flow = computed(() => props.workspace.flows.find(item => item.id === props.stageId))
const decision = computed(() => props.workspace.decisions.find(item => item.id === props.stageId))
const product = computed(() => props.workspace.productItems.find(item => item.id === props.stageId))
const productTypes = { evidence: '用户证据', hypothesis: '需求假设', decision: '方案决策' }
const productStatuses = { unverified: '待核实', confirmed: '已确认', rejected: '已否定' }
const criterionStates = { pending: '待验证', passed: '通过', failed: '未通过' }
</script>

<template>
  <MatrixTable v-if="view?.form === 'matrix'" :nodes="nodes" :selected-id="selectedId" :state="state" :playing="playing" @select="emit('select', $event)" />
  <DiagramCanvas
    v-else-if="view" :key="view.id" :form="view.form" :nodes="nodes" :relations="relations" :positions="view.positions" :title="workspace.title"
    :selected-id="selectedId" :highlighted="highlighted ?? []" :editable="!!editable" :state="state" :playing="playing"
    @select="emit('select', $event)" @move="(id, x, y) => emit('move', id, x, y)" />
  <div v-else-if="flow" class="stage-block"><h3>{{ flow.title }}</h3><SequenceDiagram :flow="flow" :workspace="workspace" /></div>
  <article v-else-if="decision" class="stage-block stage-card">
    <span class="mini-label">设计决策</span><h3>{{ decision.title }}</h3>
    <dl><dt>背景</dt><dd>{{ decision.context || '未填写' }}</dd><dt>选择</dt><dd>{{ decision.choice || '未填写' }}</dd><dt>放弃的备选</dt><dd>{{ decision.alternatives || '未填写' }}</dd><dt>影响</dt><dd>{{ decision.consequences || '未填写' }}</dd></dl>
  </article>
  <article v-else-if="product" class="stage-block stage-card">
    <span class="mini-label">{{ productTypes[product.type] }} · {{ productStatuses[product.status] }}</span><h3>{{ product.title }}</h3>
    <p class="prose">{{ product.body }}</p>
    <dl v-if="product.alternatives.length"><template v-for="option in product.alternatives" :key="option.id"><dt>备选：{{ option.title }}</dt><dd>收益：{{ option.benefits || '未填写' }}；代价：{{ option.costs || '未填写' }}</dd></template></dl>
    <ul v-if="product.criteria.length" class="gap-list"><li v-for="criterion in product.criteria" :key="criterion.id">{{ criterion.text }}（{{ criterionStates[criterion.state] }}）</li></ul>
  </article>
  <div v-else class="graph-empty"><p>这一步的画面已被删除，请重新选择。</p></div>
</template>
