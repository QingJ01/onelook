<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import StageView from './StageView.vue'
import EvidenceEditor from './EvidenceEditor.vue'
import { checkClarity } from './clarity'
import { makeStep, stageStateAt } from './model'
import { nodeKinds, viewForms, type Citation, type RestepMode, type StoryStep, type Workspace } from './types'

const props = defineProps<{
  workspace: Workspace; stepIndex: number; playing: boolean; busy: boolean
  commit: (update: (doc: Workspace) => void, label: string) => boolean
  draft?: { stepId: string; original: string; narration: string }
}>()
const emit = defineEmits<{
  'update:stepIndex': [index: number]; 'update:playing': [playing: boolean]
  locate: [citation: Citation]; inspect: [id: string]; outline: []; restep: [stepId: string, mode: RestepMode]
  acceptDraft: []; discardDraft: []; exportPlayer: []
}>()

const index = computed(() => Math.max(0, Math.min(props.workspace.story.length - 1, props.stepIndex)))
const step = computed<StoryStep | undefined>(() => props.workspace.story[index.value])
const state = computed(() => stageStateAt(props.workspace, index.value))
const stageView = computed(() => props.workspace.views.find(view => view.id === step.value?.stageId))
const stageNodes = computed(() => stageView.value?.nodeIds.flatMap(id => props.workspace.nodes.filter(node => node.id === id)) ?? [])
const issues = computed(() => checkClarity(props.workspace))
const focusNodes = computed(() => (state.value?.focus ?? []).flatMap(id => props.workspace.nodes.filter(node => node.id === id)))
const stepQuestions = computed(() => props.workspace.questions.filter(question => question.stepId === step.value?.id))
const revealedBefore = computed(() => {
  const seen = new Map<string, number>()
  props.workspace.story.slice(0, index.value).forEach((item, at) => item.reveal.forEach(id => { if (!seen.has(id)) seen.set(id, at) }))
  return seen
})
const blocks = computed(() => [
  ...props.workspace.flows.map(item => ({ id: item.id, name: `链路 · ${item.title}` })),
  ...props.workspace.decisions.map(item => ({ id: item.id, name: `决策 · ${item.title}` })),
  ...props.workspace.productItems.map(item => ({ id: item.id, name: `方案记录 · ${item.title}` })),
])
const sourceTitle = (id: string) => props.workspace.sources.find(source => source.id === id)?.title ?? id
const checkPrompt = ref(''), checkAnswer = ref(''), revealedAnswers = ref<string[]>([])
watch(() => step.value?.id, () => { checkPrompt.value = ''; checkAnswer.value = ''; revealedAnswers.value = [] })

function go(target: number) { emit('update:stepIndex', Math.max(0, Math.min(props.workspace.story.length - 1, target))) }
function edit(change: (item: StoryStep, doc: Workspace) => void, label: string) {
  const id = step.value?.id
  return props.commit(doc => { const item = doc.story.find(entry => entry.id === id); if (item) change(item, doc) }, label)
}
function addStep() {
  const stageId = step.value?.stageId ?? props.workspace.views[0]!.id
  const created = makeStep(props.workspace, stageId, '新的一步')
  const at = props.workspace.story.length ? index.value + 1 : 0
  if (props.commit(doc => { doc.story.splice(at, 0, created) }, '添加讲解步骤')) emit('update:stepIndex', at)
}
function removeStep() {
  if (!step.value || !confirm('删除这一步？对象、资料和检验题会保留。')) return
  const id = step.value.id
  if (props.commit(doc => { doc.story = doc.story.filter(item => item.id !== id) }, '删除讲解步骤')) go(index.value - 1)
}
function moveStep(delta: number) {
  const from = index.value, to = from + delta
  if (to < 0 || to >= props.workspace.story.length) return
  if (props.commit(doc => { const [item] = doc.story.splice(from, 1); doc.story.splice(to, 0, item!) }, '调整讲解顺序')) emit('update:stepIndex', to)
}
function setTitle(value: string) {
  const title = value.trim()
  if (title) edit(item => { item.title = title }, '修改步骤要点')
}
function setStage(stageId: string) { edit(item => { item.stageId = stageId; item.reveal = []; item.focus = [] }, '更换步骤画面') }
function toggleReveal(id: string) {
  edit((item, doc) => {
    if (item.reveal.includes(id)) { item.reveal = item.reveal.filter(entry => entry !== id); item.focus = item.focus.filter(entry => entry !== id); return }
    for (const other of doc.story) if (other.id !== item.id) other.reveal = other.reveal.filter(entry => entry !== id)
    item.reveal.push(id)
  }, '调整本步出现的对象')
}
function toggleFocus(id: string) {
  edit(item => { item.focus = item.focus.includes(id) ? item.focus.filter(entry => entry !== id) : [...item.focus, id] }, '调整本步聚焦')
}
/** Clicking the stage while authoring: bring a faint object into this step, or point at one already shown. */
function pick(id: string) {
  if (!stageView.value || props.playing) return
  if (state.value?.visible.includes(id)) toggleFocus(id)
  else toggleReveal(id)
}
function addCheck() {
  const nodeId = step.value?.focus[0] ?? step.value?.reveal[0] ?? state.value?.visible[0] ?? props.workspace.nodes[0]?.id
  if (!step.value || !nodeId || !checkPrompt.value.trim() || !checkAnswer.value.trim()) return
  const question = { id: crypto.randomUUID(), nodeId, prompt: checkPrompt.value.trim(), answer: checkAnswer.value.trim(), relatedNodeIds: [], stepId: step.value.id }
  if (props.commit(doc => { doc.questions.push(question) }, '添加检验题')) { checkPrompt.value = ''; checkAnswer.value = '' }
}
function unlinkCheck(id: string) { props.commit(doc => { const question = doc.questions.find(item => item.id === id); if (question) question.stepId = '' }, '取消检验题关联') }
function openIssue(issue: { stepId?: string; nodeId?: string }) {
  const at = props.workspace.story.findIndex(item => item.id === issue.stepId)
  if (at >= 0) emit('update:stepIndex', at)
  else if (issue.nodeId) emit('inspect', issue.nodeId)
}
function play() { if (props.workspace.story.length) emit('update:playing', true) }
function keydown(event: KeyboardEvent) {
  if (!props.playing || (event.target as HTMLElement)?.closest('input, textarea, select')) return
  if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); go(index.value + 1) }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(index.value - 1) }
  if (event.key === 'Escape') emit('update:playing', false)
}
onMounted(() => window.addEventListener('keydown', keydown))
onUnmounted(() => window.removeEventListener('keydown', keydown))
</script>

<template>
  <div v-if="playing && step" class="story-play" aria-label="讲解播放">
    <div class="play-top"><strong>{{ workspace.question || workspace.title }}</strong><span class="play-count">{{ index + 1 }} / {{ workspace.story.length }}</span><button class="text-button" @click="emit('update:playing', false)">退出播放</button></div>
    <div class="play-body">
      <div class="play-stage"><StageView :workspace="workspace" :stage-id="step.stageId" selected-id="" :state="stageView ? state : undefined" playing /></div>
      <aside class="play-notes" aria-live="polite">
        <h2>{{ step.title }}</h2>
        <p v-if="step.narration" class="prose play-narration">{{ step.narration }}</p>
        <section v-for="node in focusNodes" :key="node.id" class="play-detail"><span class="mini-label">{{ nodeKinds[node.kind] }}</span><h3>{{ node.title }}</h3><p v-if="node.body" class="prose">{{ node.body }}</p><div v-if="node.example" class="example-box"><span>例子</span><p class="prose">{{ node.example }}</p></div><div v-if="node.pitfall" class="pitfall-box"><span>常见误区</span><p class="prose">{{ node.pitfall }}</p></div></section>
        <div v-if="step.citations.length" class="citation-chips"><span v-for="(citation, at) in step.citations" :key="at" class="play-quote">“{{ citation.quote }}” — {{ sourceTitle(citation.sourceId) }} · v{{ citation.version }}</span></div>
        <section v-for="question in stepQuestions" :key="question.id" class="play-check"><span class="mini-label">检验</span><p>{{ question.prompt }}</p><p v-if="revealedAnswers.includes(question.id)" class="prose">{{ question.answer }}</p><button v-else class="text-button" @click="revealedAnswers.push(question.id)">先想一想，再看参考答案</button></section>
        <section v-if="index === workspace.story.length - 1 && workspace.takeaway" class="play-takeaway"><span class="mini-label">一句话结论</span><p>{{ workspace.takeaway }}</p></section>
        <div class="play-controls"><button class="ol-button" :disabled="index === 0" @click="go(index - 1)">上一步</button><button class="ol-button primary" :disabled="index >= workspace.story.length - 1" @click="go(index + 1)">下一步</button></div>
      </aside>
    </div>
  </div>

  <div v-else class="story-page">
    <div class="story-head">
      <label class="form-label story-question">要讲清的问题<input :value="workspace.question" maxlength="500" placeholder="例如：一次登录请求是怎么被验证的？" @change="commit(d => { d.question = ($event.target as HTMLInputElement).value.trim() }, '修改问题')" /></label>
      <label class="form-label">一句话结论<input :value="workspace.takeaway" maxlength="1000" placeholder="讲完之后，对方应该记住什么" @change="commit(d => { d.takeaway = ($event.target as HTMLInputElement).value.trim() }, '修改结论')" /></label>
      <label class="form-label story-audience">写给谁<input :value="workspace.audience" maxlength="200" placeholder="可选" @change="commit(d => { d.audience = ($event.target as HTMLInputElement).value.trim() }, '修改读者')" /></label>
      <div class="toolbar-actions"><button class="text-button" :disabled="busy || !workspace.nodes.length" @click="emit('outline')">生成提纲</button><button class="text-button" :disabled="!workspace.story.length" @click="emit('exportPlayer')">导出播放页</button><button class="ol-button primary" :disabled="!workspace.story.length" @click="play">播放</button></div>
    </div>
    <details class="clarity-panel" :open="issues.length > 0 && issues.length <= 3">
      <summary>清晰度检查 · {{ issues.length ? `${issues.length} 项待看` : '没有发现问题' }}</summary>
      <ul><li v-for="(issue, at) in issues" :key="at" :class="issue.level"><button class="text-button" :disabled="!issue.stepId && !issue.nodeId" @click="openIssue(issue)">{{ issue.message }}</button></li></ul>
      <p class="small muted">规则是确定的，不调用 AI；它只提示该看哪里，不代表已经讲清。</p>
    </details>

    <div class="story-body">
      <aside class="story-steps" aria-label="步骤提纲">
        <div class="story-steps-head"><span class="mini-label">步骤</span><button class="text-button" @click="addStep">+ 一步</button></div>
        <ol><li v-for="(item, at) in workspace.story" :key="item.id"><button :class="{ active: at === index }" :aria-current="at === index ? 'step' : undefined" @click="go(at)"><span>{{ String(at + 1).padStart(2, '0') }}</span>{{ item.title }}</button></li></ol>
        <p v-if="!workspace.story.length" class="small muted">还没有步骤。添加第一步，或生成提纲。</p>
      </aside>

      <section class="story-stage">
        <StageView v-if="step" :workspace="workspace" :stage-id="step.stageId" selected-id="" :state="stageView ? state : undefined" @select="pick" />
        <div v-else class="graph-empty"><p>每一步讲一个要点，画面随步骤变化。</p></div>
      </section>

      <aside v-if="step" class="story-notes" aria-label="本步讲述与依据">
        <div class="story-notes-head"><span class="mini-label">第 {{ index + 1 }} 步<span v-if="step.provenance === 'ai'" class="provenance ai">AI 生成 · 待核实</span></span><div class="order-tools"><button :disabled="index === 0" aria-label="上移这一步" @click="moveStep(-1)">↑</button><button :disabled="index === workspace.story.length - 1" aria-label="下移这一步" @click="moveStep(1)">↓</button></div></div>
        <label class="form-label">这一步的要点<input :key="step.id + '-title'" :value="step.title" maxlength="200" @change="setTitle(($event.target as HTMLInputElement).value)" /></label>
        <label class="form-label">讲述<textarea :key="step.id + '-narration'" :value="step.narration" rows="5" maxlength="20000" placeholder="用自己的话讲这一步。" @change="edit(item => { item.narration = ($event.target as HTMLTextAreaElement).value; item.provenance = 'user' }, '修改讲述')" /></label>
        <div class="restep-tools"><span class="small muted">换个讲法：</span><button class="text-button" :disabled="busy" @click="emit('restep', step.id, 'simpler')">更简单</button><button class="text-button" :disabled="busy" @click="emit('restep', step.id, 'example')">举个例子</button><button class="text-button" :disabled="busy" @click="emit('restep', step.id, 'analogy')">打个比方</button></div>
        <div v-if="draft && draft.stepId === step.id" class="ai-draft"><span class="mini-label">预览 · 尚未替换</span><p class="prose">{{ draft.narration }}</p><div class="toolbar-actions"><button class="ol-button primary" @click="emit('acceptDraft')">采用这段讲述</button><button class="text-button" @click="emit('discardDraft')">放弃</button></div></div>
        <label class="form-label">画面<select :value="step.stageId" aria-label="本步画面" @change="setStage(($event.target as HTMLSelectElement).value)"><optgroup label="图"><option v-for="view in workspace.views" :key="view.id" :value="view.id">{{ view.title }} · {{ viewForms[view.form].name }}</option></optgroup><optgroup v-if="blocks.length" label="内容块"><option v-for="block in blocks" :key="block.id" :value="block.id">{{ block.name }}</option></optgroup></select></label>
        <template v-if="stageView">
          <fieldset class="node-checks"><legend>这一步出现</legend><label v-for="node in stageNodes" :key="node.id"><input type="checkbox" :checked="step.reveal.includes(node.id)" :disabled="revealedBefore.has(node.id)" @change="toggleReveal(node.id)" />{{ node.title }}<span v-if="revealedBefore.has(node.id)" class="small muted">第 {{ revealedBefore.get(node.id)! + 1 }} 步已出现</span></label><p v-if="!stageNodes.length" class="small muted">这张图还没有对象，先到“结构”里添加。</p></fieldset>
          <fieldset v-if="state?.visible.length" class="node-checks"><legend>这一步聚焦</legend><label v-for="id in state.visible" :key="id"><input type="checkbox" :checked="step.focus.includes(id)" @change="toggleFocus(id)" />{{ workspace.nodes.find(node => node.id === id)?.title }}</label></fieldset>
          <p class="small muted">也可以直接点画面：点浅色对象让它出现，点已出现的对象切换聚焦。</p>
        </template>
        <p v-else class="small muted">内容块整体展示，不分步出现。</p>
        <section class="detail-section"><h3>依据 <span>{{ step.citations.length }}</span></h3><EvidenceEditor :workspace="workspace" :value="step.citations" @change="edit(item => { item.citations = $event }, '修改步骤依据')" @locate="emit('locate', $event)" /></section>
        <section class="detail-section"><h3>检验题 <span>{{ stepQuestions.length }}</span></h3>
          <div v-for="question in stepQuestions" :key="question.id" class="relation-row"><span>{{ question.prompt }}</span><button class="text-button" @click="unlinkCheck(question.id)">取消关联</button></div>
          <details class="citation-editor"><summary>添加检验题</summary><label class="form-label">问题<textarea v-model="checkPrompt" rows="2" maxlength="3000" /></label><label class="form-label">参考答案<textarea v-model="checkAnswer" rows="3" maxlength="20000" /></label><button class="ol-button" :disabled="!workspace.nodes.length || !checkPrompt.trim() || !checkAnswer.trim()" @click="addCheck">添加到这一步</button><p v-if="!workspace.nodes.length" class="small muted">检验题要关联一个对象，先添加对象。</p></details>
        </section>
        <button class="text-button danger" @click="removeStep">删除这一步</button>
      </aside>
    </div>
  </div>
</template>
