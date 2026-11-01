<script setup lang="ts">
import { computed, ref } from 'vue'
import EvidenceEditor from './EvidenceEditor.vue'
import type { AcceptanceCriterion, Citation, ProductAlternative, ProductItem, Workspace } from './types'
const props = defineProps<{ workspace: Workspace }>()
const emit = defineEmits<{ change: [update: (doc: Workspace) => void, label: string]; locate: [citation: Citation]; inspect: [id: string] }>()
const selectedId = ref('')
const selected = computed(() => props.workspace.productItems.find(i => i.id === selectedId.value) ?? props.workspace.productItems[0])
const types = { evidence: '用户证据', hypothesis: '需求假设', decision: '方案决策' }
const statuses = { unverified: '待核实', confirmed: '人工确认', rejected: '已否定' }
const value = (e: Event) => (e.target as HTMLInputElement).value
const newId = () => crypto.randomUUID()
function add(type: ProductItem['type']) {
  const id = crypto.randomUUID()
  emit('change', d => d.productItems.push({ id, title: `新${types[type]}`, type, status: 'unverified', body: '', nodeIds: [], relatedIds: [], citations: [], criteria: [], alternatives: [] }), '添加产品记录')
  selectedId.value = id
}
function patch(update: Partial<ProductItem>) {
  if (!selected.value) return
  const key = selected.value.id
  emit('change', d => { const item = d.productItems.find(i => i.id === key)!; Object.assign(item, update); if (item.type === 'evidence' && !item.citations.length && item.status === 'confirmed') item.status = 'unverified' }, '编辑产品记录')
}
function remove() {
  if (!selected.value || !confirm('删除这条产品记录及关联？对象和其他记录不会删除。')) return
  const key = selected.value.id
  emit('change', d => { d.productItems = d.productItems.filter(i => i.id !== key); d.productItems.forEach(i => { i.relatedIds = i.relatedIds.filter(id => id !== key) }) }, '删除产品记录')
}
function criterion(id: string, update: Partial<AcceptanceCriterion>) {
  if (selected.value) patch({ criteria: selected.value.criteria.map(c => c.id === id ? { ...c, ...update } : c) })
}
function alternative(id: string, update: Partial<ProductAlternative>) {
  if (selected.value) patch({ alternatives: selected.value.alternatives.map(a => a.id === id ? { ...a, ...update } : a) })
}
</script>

<template>
  <div class="content-scroll studio-page">
    <div class="section-heading"><div><h1>产品方案与验收</h1><p class="muted">区分证据、假设与决策，把问题、流程、取舍和验收项连起来。</p></div><span class="status-chip warning">{{ workspace.productItems.filter(i => i.status === 'unverified').length }} 项待核实</span></div>
    <div class="product-board">
      <section v-for="(label, type) in types" :key="type" class="product-column"><div class="section-heading"><h2>{{ label }}</h2><button class="text-button" @click="add(type)">+ 添加</button></div><button v-for="item in workspace.productItems.filter(i => i.type === type)" :key="item.id" :class="['product-record', { active: selected?.id === item.id }]" @click="selectedId = item.id"><span :class="['status-chip', { warning: item.status === 'unverified' }]">{{ statuses[item.status] }}</span><strong>{{ item.title }}</strong><small>{{ item.relatedIds.length }} 个关联 · {{ item.criteria.length }} 条验收</small></button><p v-if="!workspace.productItems.some(i => i.type === type)" class="muted small">从一条{{ label }}开始。</p></section>
    </div>
    <div v-if="selected" :key="selected.id" class="studio-card studio-form studio-section">
      <div class="section-heading"><h2>{{ types[selected.type] }}</h2><button class="text-button danger" @click="remove">删除记录</button></div>
      <label class="form-label">记录标题<input :value="selected.title" maxlength="200" @change="patch({ title: value($event) })" /></label>
      <label class="form-label">核实状态<select :value="selected.status" @change="patch({ status: value($event) as ProductItem['status'] })"><option value="unverified">待核实（不是已确认需求）</option><option value="confirmed" :disabled="selected.type === 'evidence' && !selected.citations.length">人工确认</option><option value="rejected">已否定</option></select></label>
      <label class="form-label">问题、观察或方案说明<textarea :value="selected.body" rows="5" @change="patch({ body: value($event) })" /></label>
      <h3>依据与引用</h3><EvidenceEditor :workspace="workspace" :value="selected.citations" @change="patch({ citations: $event })" @locate="emit('locate', $event)" />
      <fieldset class="node-checks"><legend>关联问题 / 假设 / 决策</legend><label v-for="item in workspace.productItems.filter(i => i.id !== selected!.id)" :key="item.id"><input type="checkbox" :checked="selected.relatedIds.includes(item.id)" @change="patch({ relatedIds: selected!.relatedIds.includes(item.id) ? selected!.relatedIds.filter(id => id !== item.id) : [...selected!.relatedIds, item.id] })" />{{ types[item.type] }} · {{ item.title }} · {{ statuses[item.status] }}</label><p v-if="workspace.productItems.length < 2" class="small muted">添加其他记录后可串联“问题 → 假设 → 决策”。关联是人工声明，不自动证明因果。</p></fieldset>
      <fieldset class="node-checks"><legend>关联主流程与异常分支对象</legend><label v-for="node in workspace.nodes" :key="node.id"><input type="checkbox" :checked="selected.nodeIds.includes(node.id)" @change="patch({ nodeIds: selected!.nodeIds.includes(node.id) ? selected!.nodeIds.filter(id => id !== node.id) : [...selected!.nodeIds, node.id] })" />{{ node.title }}<button v-if="selected.nodeIds.includes(node.id)" class="text-button" @click="emit('inspect', node.id)">查看对象 ↗</button></label></fieldset>
      <div class="section-heading"><h3>方案对比</h3><button class="ol-button" @click="patch({ alternatives: [...selected!.alternatives, { id: newId(), title: '新方案', benefits: '', costs: '' }] })">添加备选方案</button></div>
      <div class="alternative-grid"><article v-for="item in selected.alternatives" :key="item.id" class="comparison-card"><label class="form-label">方案名称<input :value="item.title" @change="alternative(item.id, { title: value($event) })" /></label><label class="form-label">收益 / 满足哪些目标<textarea :value="item.benefits" rows="3" @change="alternative(item.id, { benefits: value($event) })" /></label><label class="form-label">成本 / 风险 / 未覆盖场景<textarea :value="item.costs" rows="3" @change="alternative(item.id, { costs: value($event) })" /></label><button class="text-button danger" @click="patch({ alternatives: selected!.alternatives.filter(a => a.id !== item.id) })">删除方案</button></article></div>
      <div class="section-heading"><h3>验收条件与结果</h3><button class="ol-button" @click="patch({ criteria: [...selected!.criteria, { id: newId(), text: '新验收条件', state: 'pending', evidence: '' }] })">添加验收条件</button></div>
      <p class="small muted">结果由人工记录；必须先填写实际验证依据，才能标记通过或失败。没有运行测试也不会自动“通过”。</p>
      <article v-for="item in selected.criteria" :key="item.id" class="criterion-card"><label class="form-label">可验证的条件<textarea :value="item.text" rows="2" placeholder="给定…当…则…" @change="criterion(item.id, { text: value($event) })" /></label><label class="form-label">实际验证依据<textarea :value="item.evidence" rows="2" placeholder="记录观察、测试结果或证据位置" @change="criterion(item.id, { evidence: value($event), ...(!value($event).trim() ? { state: 'pending' as const } : {}) })" /></label><div class="toolbar-actions"><label class="form-label">验收结果<select :value="item.state" @change="criterion(item.id, { state: value($event) as AcceptanceCriterion['state'] })"><option value="pending">待验收</option><option value="passed" :disabled="!item.evidence.trim()">人工验收通过</option><option value="failed" :disabled="!item.evidence.trim()">人工验收失败</option></select></label><button class="text-button danger" @click="patch({ criteria: selected!.criteria.filter(c => c.id !== item.id) })">删除条件</button></div></article>
    </div>
  </div>
</template>
