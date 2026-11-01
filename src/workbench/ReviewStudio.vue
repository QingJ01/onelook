<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getDueQuestions, nextReviewInterval, recordAttempt } from './model'
import type { Question, Workspace } from './types'
const props = defineProps<{ workspace: Workspace; now: number; selectedNode: string; commit: (update: (doc: Workspace) => void, label: string) => boolean }>()
const emit = defineEmits<{ inspect: [id: string] }>()
const filter = ref<'all' | 'due' | 'node' | 'errors'>('all'), selectedId = ref(''), answer = ref(''), reason = ref(''), revealed = ref(false)
const editing = ref(false), editId = ref(''), prompt = ref(''), reference = ref(''), nodeId = ref(''), related = ref<string[]>([])
const due = computed(() => getDueQuestions(props.workspace, props.now))
const latest = computed(() => {
  const result = new Map<string, Workspace['attempts'][number]>()
  for (const a of props.workspace.attempts) if (!result.has(a.questionId) || result.get(a.questionId)!.at <= a.at) result.set(a.questionId, a)
  return result
})
const questions = computed(() => props.workspace.questions.filter(q => filter.value === 'all' || (filter.value === 'due' && due.value.some(item => item.id === q.id)) || (filter.value === 'node' && (q.nodeId === props.selectedNode || q.relatedNodeIds.includes(props.selectedNode))) || (filter.value === 'errors' && latest.value.get(q.id)?.rating === 'again')))
const question = computed(() => questions.value.find(q => q.id === selectedId.value) ?? questions.value[0])
const history = computed(() => props.workspace.attempts.filter(a => a.questionId === question.value?.id).sort((a, b) => b.at - a.at))
watch(() => question.value?.id, () => { answer.value = ''; reason.value = ''; revealed.value = false })
const format = (time: number) => new Date(time).toLocaleString('zh-CN')
const nodeTitle = (id: string) => props.workspace.nodes.find(n => n.id === id)?.title ?? id
function interval(rating: 'again' | 'good') { const ms = question.value ? nextReviewInterval(props.workspace, question.value.id, rating) : 0; return ms < 86400000 ? `${ms / 60000} 分钟` : `${ms / 86400000} 天` }
function rate(rating: 'again' | 'good') {
  if (!question.value || !answer.value.trim()) return
  const id = question.value.id
  if (!props.commit(d => Object.assign(d, recordAttempt(d, id, answer.value.trim(), rating, Date.now(), reason.value.trim())), '记录自评与错因')) return
  answer.value = ''; reason.value = ''; revealed.value = false
}
function edit(q?: Question) { editId.value = q?.id ?? ''; prompt.value = q?.prompt ?? ''; reference.value = q?.answer ?? ''; nodeId.value = q?.nodeId ?? (props.selectedNode || props.workspace.nodes[0]?.id || ''); related.value = [...q?.relatedNodeIds ?? []]; editing.value = true }
function saveQuestion() {
  const q = { id: editId.value || crypto.randomUUID(), nodeId: nodeId.value, prompt: prompt.value.trim(), answer: reference.value.trim(), relatedNodeIds: related.value.filter(id => id !== nodeId.value) }
  if (!q.nodeId || !q.prompt || !q.answer) return
  if (props.commit(d => { const i = d.questions.findIndex(item => item.id === q.id); if (i < 0) d.questions.push(q); else d.questions[i] = q }, editId.value ? '编辑练习' : '添加练习')) { editing.value = false; selectedId.value = q.id; filter.value = 'all' }
}
function removeQuestion() {
  if (!question.value || !confirm('删除题目及其作答记录？请先备份需要保留的学习记录。')) return
  const id = question.value.id
  props.commit(d => { d.questions = d.questions.filter(q => q.id !== id); d.attempts = d.attempts.filter(a => a.questionId !== id) }, '删除练习')
}
</script>

<template>
  <div class="content-scroll studio-page">
    <div class="section-heading"><div><h1>练习与复习</h1><p class="muted">先独立作答，再核对并记录错因。</p></div><button class="ol-button primary" :disabled="!workspace.nodes.length" @click="edit()">添加练习</button></div>
    <div class="review-summary"><span><strong>{{ due.length }}</strong> 已到期</span><span><strong>{{ workspace.questions.filter(q => !latest.has(q.id)).length }}</strong> 尚未作答</span><span><strong>{{ workspace.attempts.length }}</strong> 次真实记录</span></div>
    <details class="schedule-explanation"><summary>复习时间如何计算？</summary><p>“还需回顾”安排在 10 分钟后，并重置连续自评理解次数。“自评理解”按连续次数安排 1、3、7、14、30 天，之后保持 30 天。旧作答的原定到期时间不会被改写；未作答不算到期。这里没有掌握率，也不使用 AI 判分。</p></details>
    <form v-if="editing" class="studio-card studio-form" @submit.prevent="saveQuestion"><h2>{{ editId ? '编辑练习' : '新练习' }}</h2><label class="form-label">主要知识点<select v-model="nodeId" required><option value="">选择对象</option><option v-for="n in workspace.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label><fieldset class="node-checks"><legend>其他关联知识点</legend><label v-for="n in workspace.nodes.filter(n => n.id !== nodeId)" :key="n.id"><input v-model="related" type="checkbox" :value="n.id" />{{ n.title }}</label></fieldset><label class="form-label">问题<textarea v-model="prompt" required rows="3" maxlength="3000" /></label><label class="form-label">参考答案<textarea v-model="reference" required rows="5" maxlength="20000" /></label><div class="toolbar-actions"><button class="ol-button primary">保存练习</button><button class="text-button" type="button" @click="editing = false">取消</button></div></form>
    <div class="filter-pills studio-section"><button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部练习</button><button :class="{ active: filter === 'due' }" @click="filter = 'due'">到期队列</button><button :class="{ active: filter === 'errors' }" @click="filter = 'errors'">最近还需回顾</button><button :class="{ active: filter === 'node' }" @click="filter = 'node'">当前知识点</button></div>
    <div class="review-layout studio-section"><nav class="source-index" aria-label="练习目录"><button v-for="q in questions" :key="q.id" :class="{ active: question?.id === q.id }" @click="selectedId = q.id"><strong>{{ q.prompt }}</strong><span>{{ latest.get(q.id) ? `下次：${format(latest.get(q.id)!.dueAt)}` : '尚未作答' }}</span></button></nav>
      <section v-if="question" class="studio-card studio-form"><div class="toolbar-actions"><button v-for="id in [question.nodeId, ...question.relatedNodeIds]" :key="id" class="text-button" @click="emit('inspect', id)">{{ nodeTitle(id) }} ↗</button></div><h2>{{ question.prompt }}</h2><label class="form-label">我的独立回答<textarea v-model="answer" rows="5" maxlength="20000" placeholder="先写下你自己的解释，再看参考答案。" /></label><button v-if="!revealed" class="ol-button" :disabled="!answer.trim()" @click="revealed = true">核对参考答案</button><template v-else><div class="example-box"><strong>参考答案（仍需结合资料核对）</strong><p class="prose">{{ question.answer }}</p></div><label class="form-label">错因 / 本次反思<textarea v-model="reason" rows="3" maxlength="2000" placeholder="例如：混淆了概念、漏掉条件、解题方法不熟、记忆遗漏…" /></label><div class="toolbar-actions"><button class="ol-button" :disabled="!answer.trim()" @click="rate('again')">还需回顾 · {{ interval('again') }}</button><button class="ol-button primary" :disabled="!answer.trim()" @click="rate('good')">自评理解 · {{ interval('good') }}</button></div></template>
        <div class="toolbar-actions"><button class="text-button" @click="edit(question)">编辑题目</button><button class="text-button danger" @click="removeQuestion">删除题目</button></div>
        <h3>作答与错因记录</h3><p v-if="!history.length" class="muted small">还没有记录。浏览答案不会产生一次作答。</p><article v-for="attempt in history" :key="attempt.id" class="attempt-card"><span :class="['status-chip', { warning: attempt.rating === 'again' }]">{{ attempt.rating === 'again' ? '自评：还需回顾' : '自评：理解' }}</span><small>{{ format(attempt.at) }}</small><p class="prose">{{ attempt.answer }}</p><p v-if="attempt.errorReason" class="reflection"><strong>错因 / 反思：</strong>{{ attempt.errorReason }}</p><p class="small muted">本次安排：{{ format(attempt.dueAt) }}{{ history[0]?.id !== attempt.id ? '（旧安排，当前以下次最新记录为准）' : '' }}</p></article>
      </section><div v-else class="empty-state"><h3>{{ filter === 'due' ? '当前没有到期题目' : '这里还没有练习' }}</h3><p>切换全部练习，或为已有知识点创建问题。</p></div>
    </div>
  </div>
</template>
