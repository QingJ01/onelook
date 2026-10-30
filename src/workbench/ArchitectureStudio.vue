<script setup lang="ts">
import { computed, ref } from 'vue'
import EvidenceEditor from './EvidenceEditor.vue'
import SequenceDiagram from './SequenceDiagram.vue'
import type { Citation, DesignDecision, FlowStep, Workspace } from './types'
const props = defineProps<{ workspace: Workspace }>()
const emit = defineEmits<{ change: [update: (doc: Workspace) => void, label: string]; locate: [citation: Citation]; inspect: [id: string] }>()
const flowId = ref(''), stepId = ref(''), decisionId = ref('')
const flow = computed(() => props.workspace.flows.find(f => f.id === flowId.value) ?? props.workspace.flows[0])
const step = computed(() => flow.value?.steps.find(s => s.id === stepId.value) ?? flow.value?.steps[0])
const decision = computed(() => props.workspace.decisions.find(d => d.id === decisionId.value) ?? props.workspace.decisions[0])
const value = (e: Event) => (e.target as HTMLInputElement).value
function addFlow() { const id = crypto.randomUUID(); emit('change', d => d.flows.push({ id, title: '新请求链路', steps: [] }), '添加请求链路'); flowId.value = id; stepId.value = '' }
function addStep() {
  if (!flow.value || !props.workspace.nodes.length) return
  const flowKey = flow.value.id, id = crypto.randomUUID()
  emit('change', d => d.flows.find(f => f.id === flowKey)!.steps.push({ id, from: d.nodes[0]!.id, to: d.nodes[1]?.id ?? d.nodes[0]!.id, message: '新消息', condition: '', branch: 'main', evidence: 'unverified', citations: [] }), '添加显式消息')
  stepId.value = id
}
function patchStep(patch: Partial<FlowStep>) {
  if (!flow.value || !step.value) return
  const flowKey = flow.value.id, key = step.value.id
  emit('change', d => { const target = d.flows.find(f => f.id === flowKey)!.steps.find(s => s.id === key)!; Object.assign(target, patch); if (!target.citations.length) target.evidence = 'unverified' }, '编辑请求步骤')
}
function reorder(delta: number) {
  if (!flow.value || !step.value) return
  const flowKey = flow.value.id, index = flow.value.steps.findIndex(s => s.id === step.value!.id), next = index + delta
  if (next < 0 || next >= flow.value.steps.length) return
  emit('change', d => { const steps = d.flows.find(f => f.id === flowKey)!.steps; [steps[index], steps[next]] = [steps[next]!, steps[index]!] }, '调整消息顺序')
}
function removeStep() {
  if (!flow.value || !step.value || !confirm('删除当前步骤？可从历史恢复。')) return
  const flowKey = flow.value.id, key = step.value.id
  emit('change', d => { const f = d.flows.find(f => f.id === flowKey)!; f.steps = f.steps.filter(s => s.id !== key) }, '删除请求步骤')
}
function removeFlow() {
  if (!flow.value || !confirm('删除这条请求链路及全部步骤？')) return
  const id = flow.value.id; emit('change', d => { d.flows = d.flows.filter(f => f.id !== id) }, '删除请求链路')
}
function addDecision() {
  const id = crypto.randomUUID()
  emit('change', d => d.decisions.push({ id, title: '新架构决策', context: '', choice: '', alternatives: '', consequences: '', nodeIds: [], citations: [] }), '添加架构决策')
  decisionId.value = id
}
function patchDecision(patch: Partial<DesignDecision>) {
  if (!decision.value) return
  const key = decision.value.id; emit('change', d => Object.assign(d.decisions.find(a => a.id === key)!, patch), '编辑架构决策')
}
function removeDecision() {
  if (!decision.value || !confirm('删除这条架构决策？')) return
  const key = decision.value.id; emit('change', d => { d.decisions = d.decisions.filter(a => a.id !== key) }, '删除架构决策')
}
</script>

<template>
  <div class="content-scroll studio-page">
    <div class="section-heading"><div><div class="document-eyebrow">REQUESTS & DECISIONS</div><h1>请求链路与架构决策</h1><p>显式记录消息顺序与条件。静态推断、运行证据和待核实假设分开呈现。</p></div><button class="ol-button primary" @click="addFlow">添加请求链路</button></div>
    <div v-if="flow" class="studio-card">
      <div class="form-grid"><label class="form-label">请求链路<select :value="flow.id" @change="flowId = value($event); stepId = ''"><option v-for="f in workspace.flows" :key="f.id" :value="f.id">{{ f.title }}</option></select></label><label class="form-label">链路名称<input :value="flow.title" maxlength="200" @change="emit('change', d => { d.flows.find(f => f.id === flow!.id)!.title = value($event) }, '修改链路名称')" /></label></div>
      <div class="toolbar-actions"><button class="ol-button" :disabled="!workspace.nodes.length" @click="addStep">添加消息步骤</button><button class="text-button danger" @click="removeFlow">删除链路</button></div>
      <SequenceDiagram :flow="flow" :workspace="workspace" :selected-step="step?.id" @select="stepId = $event" />
      <div v-if="step" class="studio-form step-editor" :key="step.id">
        <div class="section-heading"><h2>步骤 {{ flow.steps.findIndex(s => s.id === step!.id) + 1 }} · {{ step.message }}</h2><div class="toolbar-actions"><button class="ol-button" :disabled="flow.steps[0]?.id === step.id" @click="reorder(-1)">上移步骤</button><button class="ol-button" :disabled="flow.steps[flow.steps.length - 1]?.id === step.id" @click="reorder(1)">下移步骤</button><button class="text-button danger" @click="removeStep">删除步骤</button></div></div>
        <div class="form-grid"><label class="form-label">发送方<select :value="step.from" @change="patchStep({ from: value($event) })"><option v-for="n in workspace.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label><label class="form-label">接收方<select :value="step.to" @change="patchStep({ to: value($event) })"><option v-for="n in workspace.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label></div>
        <label class="form-label">消息 / 操作<input :value="step.message" maxlength="500" @change="patchStep({ message: value($event) })" /></label>
        <div class="form-grid"><label class="form-label">路径类型<select :value="step.branch" @change="patchStep({ branch: value($event) as FlowStep['branch'] })"><option value="main">主流程</option><option value="failure">失败分支</option><option value="alternative">备选分支</option></select></label><label class="form-label">执行条件<input :value="step.condition" placeholder="例如：凭据验证失败" @change="patchStep({ condition: value($event) })" /></label></div>
        <label class="form-label">证据性质（由你核实，不是自动检测）<select :value="step.evidence" @change="patchStep({ evidence: value($event) as FlowStep['evidence'] })"><option value="unverified">待核实 / 推测</option><option value="static" :disabled="!step.citations.length">静态资料支持（非运行时验证）</option><option value="runtime" :disabled="!step.citations.length">已关联运行记录（人工确认）</option></select></label>
        <EvidenceEditor :workspace="workspace" :value="step.citations" @change="patchStep({ citations: $event })" @locate="emit('locate', $event)" />
        <button class="text-button" @click="emit('inspect', step.from)">回到发送方对象 ↗</button>
      </div>
    </div>
    <div v-else class="empty-state"><h3>解释一条真实链路，而不是猜测箭头顺序</h3><p>先在关系地图添加组件，再创建链路。正常路径和失败条件都可以有独立证据。</p><button class="ol-button" @click="addFlow">创建第一条链路</button></div>
    <div class="section-heading studio-section"><div><h2>架构决策记录</h2><p>保存为什么选择它，以及没有选择什么。</p></div><button class="ol-button" @click="addDecision">添加架构决策</button></div>
    <div v-if="decision" class="studio-card studio-form" :key="decision.id">
      <label class="form-label">选择决策<select :value="decision.id" @change="decisionId = value($event)"><option v-for="d in workspace.decisions" :key="d.id" :value="d.id">{{ d.title }}</option></select></label>
      <label class="form-label">决策标题<input :value="decision.title" @change="patchDecision({ title: value($event) })" /></label>
      <label class="form-label">问题与约束<textarea :value="decision.context" rows="3" @change="patchDecision({ context: value($event) })" /></label>
      <div class="form-grid"><label class="form-label">采用方案<textarea :value="decision.choice" rows="4" @change="patchDecision({ choice: value($event) })" /></label><label class="form-label">备选方案与未选原因<textarea :value="decision.alternatives" rows="4" @change="patchDecision({ alternatives: value($event) })" /></label></div>
      <label class="form-label">收益、代价与后续影响<textarea :value="decision.consequences" rows="3" @change="patchDecision({ consequences: value($event) })" /></label>
      <fieldset class="node-checks"><legend>关联对象</legend><label v-for="n in workspace.nodes" :key="n.id"><input type="checkbox" :checked="decision.nodeIds.includes(n.id)" @change="patchDecision({ nodeIds: decision!.nodeIds.includes(n.id) ? decision!.nodeIds.filter(id => id !== n.id) : [...decision!.nodeIds, n.id] })" />{{ n.title }}</label></fieldset>
      <EvidenceEditor :workspace="workspace" :value="decision.citations" @change="patchDecision({ citations: $event })" @locate="emit('locate', $event)" />
      <button class="text-button danger" @click="removeDecision">删除架构决策</button>
    </div>
  </div>
</template>
