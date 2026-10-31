<script setup lang="ts">
import { computed } from 'vue'
import type { RequestFlow, Workspace } from './types'
const props = defineProps<{ flow: RequestFlow; workspace: Workspace; selectedStep?: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const participants = computed(() => [...new Set(props.flow.steps.flatMap(s => [s.from, s.to]))])
const width = computed(() => Math.max(660, participants.value.length * 200 + 80))
const height = computed(() => Math.max(260, props.flow.steps.length * 94 + 145))
const x = (id: string) => 120 + participants.value.indexOf(id) * 200
const branches = { main: '主流程', failure: '失败分支', alternative: '备选分支' }
</script>

<template>
  <div class="sequence-scroll" role="region" aria-label="请求时序图" tabindex="0">
    <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="`${flow.title}，由用户显式定义的消息顺序`">
      <defs><marker id="sequence-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor" /></marker></defs>
      <g v-for="id in participants" :key="id"><rect :x="x(id) - 88" y="15" width="176" height="48" rx="10" fill="#eef1fb" stroke="#d5ddf2" /><text :x="x(id)" y="45" text-anchor="middle" fill="#253047" font-size="13">{{ (workspace.nodes.find(n => n.id === id)?.title || id).slice(0, 13) }}</text><line :x1="x(id)" y1="64" :x2="x(id)" :y2="height - 25" stroke="#c6cee0" stroke-dasharray="5 5" /></g>
      <g v-for="(step, i) in flow.steps" :key="step.id" :class="['sequence-step', { selected: selectedStep === step.id }]" :style="{ color: step.branch === 'failure' ? '#b95d47' : '#5366d9' }" role="button" tabindex="0" :aria-label="`步骤 ${i + 1}：${step.message}`" @click="emit('select', step.id)" @keydown.enter.prevent="emit('select', step.id)" @keydown.space.prevent="emit('select', step.id)">
        <rect x="12" :y="84 + i * 94" :width="width - 24" height="88" rx="8" :fill="selectedStep === step.id ? '#eef1fb' : 'transparent'" />
        <text :x="Math.min(x(step.from), x(step.to)) + 8" :y="105 + i * 94" font-size="12" fill="currentColor">{{ i + 1 }} · {{ branches[step.branch] }}{{ step.condition ? ` [${step.condition.slice(0, 25)}]` : '' }}</text>
        <text :x="Math.min(x(step.from), x(step.to)) + 8" :y="126 + i * 94" font-size="13" fill="#253047">{{ step.message.slice(0, 35) }}{{ step.message.length > 35 ? '…' : '' }}</text>
        <path v-if="step.from === step.to" :d="`M${x(step.from)} ${140 + i * 94} h55 v18 h-55`" fill="none" stroke="currentColor" stroke-width="2" marker-end="url(#sequence-arrow)" />
        <line v-else :x1="x(step.from)" :y1="142 + i * 94" :x2="x(step.to)" :y2="142 + i * 94" stroke="currentColor" stroke-width="2" :stroke-dasharray="step.branch === 'failure' ? '6 4' : undefined" marker-end="url(#sequence-arrow)" />
      </g>
    </svg>
    <p v-if="!flow.steps.length" class="empty-state">添加显式消息后生成时序。普通调用连线不会被自动当作执行顺序。</p>
  </div>
</template>
