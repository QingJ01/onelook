<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Download, FileText, FolderOpen, GitBranch, GraduationCap, History, Layers3, Link2, LoaderCircle, Network, Plus, Presentation, Search, Settings2, Sparkles, Trash2, Upload, X } from 'lucide-vue-next'
import GraphCanvas from './GraphCanvas.vue'
import { exampleWorkspace } from './examples'
import { createWorkspace, makeNode, validateWorkspace, applyGenerated, getDueQuestions, recordAttempt } from './model'
import { listWorkspaces, getWorkspace, saveWorkspace, deleteWorkspace, listRevisions, restoreRevision } from './storage'
import { generateContent, explainNode, renderArchify } from './api'
import { scenarios, nodeKinds, relationKinds, type Workspace, type Scenario, type KnowledgeNode, type RelationKind, type Revision, type GeneratedContent, type AISettings } from './types'
import './workbench.css'

const workspaces = ref<Workspace[]>([])
const current = ref<Workspace>()
const selectedId = ref('')
const selected = computed(() => current.value?.nodes.find(n => n.id === selectedId.value))
const tab = ref<'map' | 'explain' | 'sources' | 'practice' | 'archify'>('map')
const mode = ref<'explore' | 'edit' | 'present'>('explore')
const modal = ref<'' | 'new' | 'settings' | 'source' | 'relation' | 'question' | 'history' | 'generate' | 'help'>('')
const loading = ref(true)
const busy = ref('')
const error = ref('')
const notice = ref('')
const saveState = ref<'saved' | 'saving' | 'error'>('saved')
const search = ref('')
const scenarioFilter = ref<Scenario | 'all'>('all')
const filteredWorkspaces = computed(() => workspaces.value.filter(w => (scenarioFilter.value === 'all' || w.scenario === scenarioFilter.value) && `${w.title} ${w.summary}`.toLowerCase().includes(search.value.toLowerCase())))
const nodeSearch = ref('')
const listedNodes = computed(() => current.value?.nodes.filter(n => `${n.title} ${n.body}`.toLowerCase().includes(nodeSearch.value.toLowerCase())) ?? [])
const scope = ref<'all' | 'upstream' | 'downstream'>('all')
const highlighted = computed(() => {
  if (!current.value || !selectedId.value || scope.value === 'all') return []
  const seen = new Set([selectedId.value]); const queue = [selectedId.value]
  for (let i = 0; i < queue.length; i++) for (const edge of current.value.relations) {
    const from = scope.value === 'downstream' ? edge.from : edge.to
    const to = scope.value === 'downstream' ? edge.to : edge.from
    if (from === queue[i] && !seen.has(to)) { seen.add(to); queue.push(to) }
  }
  return [...seen]
})
const newTitle = ref(''), newScenario = ref<Scenario>('architecture'), newMaterial = ref('')
const sourceTitle = ref(''), sourceText = ref(''), sourceUrl = ref('')
const relationFrom = ref(''), relationTo = ref(''), relationKind = ref<RelationKind>('calls'), relationLabel = ref('')
const questionNode = ref(''), questionPrompt = ref(''), questionAnswer = ref('')
const citeSource = ref(''), citeQuote = ref('')
const revisions = ref<Revision[]>([])
const step = ref(0)
const pathNodes = computed(() => current.value?.path.map(id => current.value!.nodes.find(n => n.id === id)).filter((n): n is KnowledgeNode => !!n) ?? [])
const practiceFilter = ref<'all' | 'due' | 'node'>('all')
const dueQuestions = computed(() => current.value ? getDueQuestions(current.value, clock.value) : [])
const clock = ref(Date.now())
const practiceQuestions = computed(() => !current.value ? [] : practiceFilter.value === 'due' ? dueQuestions.value : practiceFilter.value === 'node' ? current.value.questions.filter(q => q.nodeId === selectedId.value) : current.value.questions)
const questionId = ref(''), answer = ref(''), revealed = ref(false)
const activeQuestion = computed(() => practiceQuestions.value.find(q => q.id === questionId.value) ?? practiceQuestions.value[0])
const latestAttempt = computed(() => current.value?.attempts.filter(a => a.questionId === activeQuestion.value?.id).sort((a, b) => b.at - a.at)[0])
const settings = ref<AISettings>({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' })
const aiConsent = ref(false)
const aiQuestion = ref('用一个具体例子解释这个概念，并指出常见误区。')
const aiDraft = ref<{ workspaceId: string; nodeId: string; original: string; body: string }>()
const generated = ref<GeneratedContent>()
const generatedFor = ref('')
const artifact = ref<{ html: string; ir: unknown; updatedAt: number; workspaceId: string }>()
const health = ref<{ archify: boolean; aiHosts: string[] }>()
const artifactIsCurrent = computed(() => artifact.value?.workspaceId === current.value?.id && artifact.value?.updatedAt === current.value?.updatedAt)
const importInput = ref<HTMLInputElement>(), materialInput = ref<HTMLInputElement>()
let saveQueue: Promise<void> = Promise.resolve()
let timer: ReturnType<typeof setInterval> | undefined
let noticeTimer: ReturnType<typeof setTimeout> | undefined
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function notify(message: string) { notice.value = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.value = '', 4500) }
function fail(reason: unknown) { error.value = reason instanceof Error ? reason.message : String(reason) }
function formatDate(time: number) { return new Date(time).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function nodeTitle(id: string) { return current.value?.nodes.find(n => n.id === id)?.title ?? '已删除对象' }
async function refresh() { workspaces.value = await listWorkspaces() }
function beforeUnload(event: BeforeUnloadEvent) { if (saveState.value !== 'saved') { event.preventDefault(); event.returnValue = '' } }
onMounted(async () => {
  try { await refresh() } catch (e) { fail(e) } finally { loading.value = false }
  void fetch('/api/health').then(r => r.ok ? r.json() : undefined).then(data => health.value = data).catch(() => {})
  timer = setInterval(() => clock.value = Date.now(), 30000)
  window.addEventListener('beforeunload', beforeUnload)
})
onUnmounted(() => { clearInterval(timer); clearTimeout(noticeTimer); window.removeEventListener('beforeunload', beforeUnload) })
watch(() => activeQuestion.value?.id, () => { answer.value = ''; revealed.value = false })
watch(selectedId, () => { citeQuote.value = ''; aiDraft.value = undefined })

function commit(change: (draft: Workspace) => void, label: string) {
  if (!current.value) return false
  try {
    const draft = clone(current.value); change(draft); draft.updatedAt = Date.now()
    const valid = validateWorkspace(draft); current.value = valid; saveState.value = 'saving'
    const snapshot = clone(valid)
    saveQueue = saveQueue.then(async () => {
      await saveWorkspace(snapshot, label); await refresh()
      if (current.value?.id === snapshot.id && current.value.updatedAt === snapshot.updatedAt) saveState.value = 'saved'
    }).catch(e => { saveState.value = 'error'; fail(e) })
    return true
  } catch (e) { fail(e); return false }
}
async function retrySave() { if (current.value) { try { await saveWorkspace(clone(current.value), '重试保存'); saveState.value = 'saved'; error.value = ''; await refresh() } catch (e) { fail(e) } } }
async function openWorkspace(id: string) {
  await saveQueue
  if (saveState.value === 'error') { fail('当前内容未保存，请先重试保存或导出备份。'); return }
  try {
    const item = await getWorkspace(id)
    if (!item) throw new Error('工作空间不存在。')
    current.value = item; selectedId.value = item.nodes[0]?.id ?? ''; mode.value = 'explore'; tab.value = 'map'; scope.value = 'all'; step.value = 0
    questionId.value = ''; answer.value = ''; revealed.value = false; practiceFilter.value = 'all'; artifact.value = undefined; aiDraft.value = undefined; generated.value = undefined; nodeSearch.value = ''; error.value = ''
  } catch (e) { fail(e) }
}
async function home() { await saveQueue; if (saveState.value === 'error') { fail('请先保存或导出当前内容。'); return }; current.value = undefined; mode.value = 'explore'; await refresh() }
async function addExample(scenario: Scenario) {
  try { const doc = exampleWorkspace(scenario); await saveWorkspace(doc); await refresh(); await openWorkspace(doc.id) } catch (e) { fail(e) }
}
function showNew(scenario: Scenario = 'architecture') { newScenario.value = scenario; newTitle.value = ''; newMaterial.value = ''; modal.value = 'new' }
async function create() {
  if (!newTitle.value.trim()) return
  try {
    const doc = createWorkspace(newScenario.value, newTitle.value.trim())
    if (newMaterial.value.trim()) doc.sources.push({ id: crypto.randomUUID(), title: '初始资料', text: newMaterial.value.trim(), createdAt: Date.now() })
    await saveWorkspace(doc); await refresh(); await openWorkspace(doc.id); modal.value = ''; notify('空间已创建。添加对象，或用 AI 生成初稿。')
  } catch (e) { fail(e) }
}
async function removeWorkspace(id: string) {
  if (!window.confirm('删除整个工作空间及其历史？此操作不可撤销，建议先导出备份。')) return
  try { await deleteWorkspace(id); await refresh(); if (current.value?.id === id) current.value = undefined } catch (e) { fail(e) }
}
function updateNode(field: keyof KnowledgeNode, value: unknown) {
  const id = selectedId.value
  commit(doc => { const node = doc.nodes.find(n => n.id === id); if (node) Object.assign(node, { [field]: value }) }, '编辑对象')
}
function addNode() {
  const node = makeNode('新对象', current.value?.scenario === 'architecture' ? 'component' : current.value?.scenario === 'product' ? 'requirement' : 'concept')
  commit(doc => { doc.nodes.push(node); doc.path.push(node.id) }, '添加对象'); selectedId.value = node.id; mode.value = 'edit'; tab.value = 'map'
}
function removeNode() {
  const id = selectedId.value
  if (!window.confirm('删除此对象及相关连线、题目和作答记录？可通过版本历史恢复内容。')) return
  commit(doc => { doc.nodes = doc.nodes.filter(n => n.id !== id); doc.relations = doc.relations.filter(r => r.from !== id && r.to !== id); doc.path = doc.path.filter(n => n !== id); doc.questions = doc.questions.filter(q => q.nodeId !== id); doc.attempts = doc.attempts.filter(a => doc.questions.some(q => q.id === a.questionId)) }, '删除对象')
  selectedId.value = current.value?.nodes[0]?.id ?? ''
}
function openRelation() { relationFrom.value = selectedId.value || current.value?.nodes[0]?.id || ''; relationTo.value = current.value?.nodes.find(n => n.id !== relationFrom.value)?.id ?? ''; relationKind.value = current.value?.scenario === 'course' ? 'prerequisite' : current.value?.scenario === 'product' ? 'next' : 'calls'; relationLabel.value = ''; modal.value = 'relation' }
function addRelation() {
  if (!relationFrom.value || !relationTo.value || relationFrom.value === relationTo.value) { fail('请选择两个不同的对象。'); return }
  const before = current.value
  commit(doc => doc.relations.push({ id: crypto.randomUUID(), from: relationFrom.value, to: relationTo.value, kind: relationKind.value, label: relationLabel.value.trim() || relationKinds[relationKind.value] }), '添加关系')
  if (current.value !== before) modal.value = ''
}
function movePath(index: number, delta: number) {
  commit(doc => { const next = index + delta; if (next < 0 || next >= doc.path.length) return; [doc.path[index], doc.path[next]] = [doc.path[next]!, doc.path[index]!] }, '调整讲解顺序')
}
function present() { if (!pathNodes.value.length) return; mode.value = 'present'; tab.value = 'explain'; step.value = 0; selectedId.value = pathNodes.value[0]!.id }
function goStep(delta: number) { step.value = Math.max(0, Math.min(pathNodes.value.length - 1, step.value + delta)); selectedId.value = pathNodes.value[step.value]?.id ?? '' }
function showSource() { sourceTitle.value = ''; sourceText.value = ''; sourceUrl.value = ''; modal.value = 'source' }
function addSource() {
  if (!sourceTitle.value.trim() || !sourceText.value.trim()) return
  const before = current.value
  commit(doc => doc.sources.push({ id: crypto.randomUUID(), title: sourceTitle.value.trim(), text: sourceText.value.trim(), ...(sourceUrl.value.trim() ? { url: sourceUrl.value.trim() } : {}), createdAt: Date.now() }), '添加资料')
  if (before !== current.value) { modal.value = ''; tab.value = 'sources' }
}
async function readMaterial(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    if (!/\.(txt|md|markdown)$/i.test(file.name) || file.size > 1000000) throw new Error('支持 1 MB 以内的 TXT / Markdown 文件。')
    const text = await file.text()
    if (modal.value === 'new') newMaterial.value = text
    else { sourceTitle.value = file.name; sourceText.value = text }
  } catch (e) { fail(e) }
  ;(event.target as HTMLInputElement).value = ''
}
function removeSource(id: string) {
  if (!window.confirm('删除此资料及引用它的关联？对象正文会保留，但相关引用将移除。')) return
  commit(doc => { doc.sources = doc.sources.filter(s => s.id !== id); doc.nodes.forEach(n => n.citations = n.citations.filter(c => c.sourceId !== id)) }, '删除资料')
}
function addCitation() {
  if (!citeSource.value || !citeQuote.value.trim() || !selected.value) return
  const id = selectedId.value; const before = current.value
  commit(doc => doc.nodes.find(n => n.id === id)!.citations.push({ sourceId: citeSource.value, quote: citeQuote.value.trim() }), '关联来源')
  if (before !== current.value) citeQuote.value = ''
}
function showQuestion() { questionNode.value = selectedId.value || current.value?.nodes[0]?.id || ''; questionPrompt.value = ''; questionAnswer.value = ''; modal.value = 'question' }
function addQuestion() {
  if (!questionNode.value || !questionPrompt.value.trim() || !questionAnswer.value.trim()) return
  const id = crypto.randomUUID()
  const before = current.value
  commit(doc => doc.questions.push({ id, nodeId: questionNode.value, prompt: questionPrompt.value.trim(), answer: questionAnswer.value.trim() }), '添加练习')
  if (before !== current.value) { modal.value = ''; practiceFilter.value = 'all'; questionId.value = id; tab.value = 'practice' }
}
function rate(rating: 'again' | 'good') {
  if (!current.value || !activeQuestion.value || !answer.value.trim()) return
  const id = activeQuestion.value.id
  if (!commit(doc => Object.assign(doc, recordAttempt(doc, id, answer.value.trim(), rating)), '记录自评')) return
  clock.value = Date.now(); notify(rating === 'again' ? '已记录：10 分钟后再回顾。' : '已记录：明天再回顾。这是自评，不是自动判分。')
  revealed.value = false; answer.value = ''; const next = practiceQuestions.value.find(q => q.id !== id); if (next) questionId.value = next.id
}
async function showHistory() { if (!current.value) return; await saveQueue; try { revisions.value = await listRevisions(current.value.id); modal.value = 'history' } catch (e) { fail(e) } }
async function restore(revision: Revision) {
  if (!window.confirm('恢复此版本的内容？当前内容会先存为历史；学习记录按仍存在的题目保留。')) return
  try { current.value = await restoreRevision(clone(revision)); selectedId.value = current.value.nodes[0]?.id ?? ''; step.value = 0; await refresh(); modal.value = ''; artifact.value = undefined; aiDraft.value = undefined; notify('内容版本已恢复。') } catch (e) { fail(e) }
}
function download(content: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportJSON() { if (current.value) download(JSON.stringify(current.value, null, 2), `${current.value.title}.onelook.json`, 'application/json') }
function exportMarkdown() {
  const doc = current.value; if (!doc) return
  const text = `# ${doc.title}\n\n${doc.summary}\n\n` + doc.nodes.map(n => `## ${n.title}\n\n${n.body}\n\n### 例子\n${n.example}\n\n### 常见误区\n${n.pitfall}\n\n### 笔记与决策\n${n.notes}\n\n### 验收条件\n${n.acceptance}\n\n` + n.citations.map(c => `> ${c.quote}\n> 来源：${doc.sources.find(s => s.id === c.sourceId)?.title}`).join('\n')).join('\n') + '\n## 关系\n' + doc.relations.map(r => `- ${nodeTitle(r.from)} → ${nodeTitle(r.to)}：${r.label}（${relationKinds[r.kind]}）`).join('\n') + '\n\n## 资料\n' + doc.sources.map(s => `### ${s.title}\n${s.url ?? ''}\n\n${s.text}`).join('\n\n')
  download(text, `${doc.title}.md`, 'text/markdown')
}
async function importJSON(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return
  try {
    if (file.size > 5000000) throw new Error('备份文件不能超过 5 MB。')
    const doc = validateWorkspace(JSON.parse(await file.text())); doc.id = crypto.randomUUID(); doc.title += '（导入）'; doc.updatedAt = Date.now()
    await saveWorkspace(doc); await refresh(); await openWorkspace(doc.id); notify('已作为独立副本导入，未覆盖现有内容。')
  } catch (e) { fail(e) }
  ;(event.target as HTMLInputElement).value = ''
}
function checkAI() { if (!settings.value.apiKey.trim()) { modal.value = 'settings'; fail('请先填写你自己的模型 API Key。密钥只保留在本次页面内存中。'); return false }; if (!aiConsent.value) { modal.value = 'settings'; fail('请确认资料发送范围后再使用 AI。'); return false }; return true }
async function generate() {
  if (!current.value || !checkAI()) return
  if (current.value.nodes.length) { fail('为保护现有编辑，只能为空白空间生成初稿。已有对象请使用局部追问。'); return }
  const doc = clone(current.value); busy.value = '正在生成结构化初稿…'; generated.value = undefined
  try { const result = await generateContent(doc, settings.value); if (current.value?.id !== doc.id) return; applyGenerated(doc, result); generated.value = result; generatedFor.value = doc.id; modal.value = 'generate' } catch (e) { fail(e) } finally { busy.value = '' }
}
function acceptGenerated() {
  if (!current.value || !generated.value || generatedFor.value !== current.value.id) return
  const payload = generated.value; const before = current.value
  commit(doc => Object.assign(doc, applyGenerated(doc, payload)), '采用 AI 初稿')
  if (before !== current.value) { selectedId.value = current.value?.nodes[0]?.id ?? ''; generated.value = undefined; modal.value = ''; notify('已采用初稿。AI 内容仍需核实，可继续编辑与补充依据。') }
}
async function askAI() {
  if (!current.value || !selected.value || !checkAI() || !aiQuestion.value.trim()) return
  const doc = clone(current.value), node = clone(selected.value); busy.value = '正在生成局部建议…'
  try { const body = await explainNode(doc, node.id, aiQuestion.value.trim(), settings.value); if (current.value?.id === doc.id && selectedId.value === node.id) aiDraft.value = { workspaceId: doc.id, nodeId: node.id, original: node.body, body } } catch (e) { fail(e) } finally { busy.value = '' }
}
function acceptExplanation() {
  const draft = aiDraft.value
  if (!draft || draft.workspaceId !== current.value?.id || draft.nodeId !== selectedId.value) return
  if (selected.value?.body !== draft.original) { fail('原文已被修改，请重新生成建议，避免覆盖新编辑。'); return }
  commit(doc => { const node = doc.nodes.find(n => n.id === draft.nodeId)!; node.body = draft.body; node.provenance = 'ai'; node.citations = [] }, '采用局部 AI 建议')
  aiDraft.value = undefined
}
async function render() {
  if (!current.value || !current.value.nodes.length) return
  const doc = clone(current.value); busy.value = 'Archify 正在渲染并校验…'
  try { const result = await renderArchify(doc); if (current.value?.id !== doc.id) return; artifact.value = { ...result, updatedAt: doc.updatedAt, workspaceId: doc.id }; health.value = { archify: true, aiHosts: health.value?.aiHosts ?? [] }; tab.value = 'archify' } catch (e) { fail(e) } finally { busy.value = '' }
}
</script>

<template>
  <div class="ol-app" :class="{ presenting: mode === 'present' }">
    <header class="ol-header">
      <button class="brand" aria-label="OneLook 首页" @click="home"><span class="brand-mark"><Layers3 :size="21" /></span><strong>OneLook<span>一目</span></strong></button>
      <div v-if="current" class="breadcrumb"><ChevronRight :size="14" /><button @click="home">工作空间</button><ChevronRight :size="14" /><span>{{ current.title }}</span></div>
      <span v-else class="brand-caption">让复杂，一目了然。</span>
      <div class="header-actions"><span class="local-badge"><i /> 本地优先</span><button class="icon-button" aria-label="使用帮助" @click="modal = 'help'"><CircleHelp :size="18" /></button><button class="icon-button" aria-label="AI 设置" @click="modal = 'settings'"><Settings2 :size="18" /></button><a class="legacy-link" href="?editor=classic">经典导图 <ArrowRight :size="14" /></a></div>
    </header>

    <div v-if="error" class="error-banner" role="alert"><span>{{ error }}</span><button v-if="saveState === 'error'" @click="retrySave">重试保存</button><button v-if="current" @click="exportJSON">导出备份</button><button aria-label="关闭错误提示" @click="error = ''"><X :size="16" /></button></div>
    <div v-if="notice" class="ol-toast" role="status"><Check :size="16" />{{ notice }}</div>
    <div v-if="busy" class="busy-bar" role="status"><LoaderCircle class="spin" :size="16" />{{ busy }}<span>不会覆盖当前已保存内容</span></div>
    <input ref="importInput" type="file" accept=".json" hidden @change="importJSON" />
    <input ref="materialInput" type="file" accept=".txt,.md,.markdown" hidden @change="readMaterial" />

    <main v-if="!current" class="home-scroll">
      <section class="home-content">
        <div class="hero-eyebrow"><span /> YOUR VISUAL THINKING SPACE</div>
        <div class="hero-row"><div><h1>看清全局，<br /><em>理解每一个连接。</em></h1><p>从系统架构到产品方案，从一个知识点到完整课程。<br />把资料变成地图，把理解变成自己的能力。</p></div><div class="hero-illustration" aria-hidden="true"><div class="orbit orbit-one" /><div class="orbit orbit-two" /><div class="hero-center"><Layers3 :size="40" /></div><span class="orbit-tag tag-a"><Network :size="16" />架构</span><span class="orbit-tag tag-b"><GitBranch :size="16" />设计</span><span class="orbit-tag tag-c"><BookOpen :size="16" />知识</span><i class="orbit-dot" /></div></div>
        <div class="scenario-cards"><article v-for="(info, scenario) in scenarios" :key="scenario" class="scenario-card" :style="{ '--accent': info.color }"><div class="scenario-icon"><Network v-if="scenario === 'architecture'" :size="23" /><GitBranch v-else-if="scenario === 'product'" :size="23" /><GraduationCap v-else :size="23" /></div><h2>{{ info.name }}</h2><p>{{ info.description }}</p><div class="scenario-buttons"><button @click="showNew(scenario)">创建空间 <Plus :size="15" /></button><button class="subtle" @click="addExample(scenario)">体验示例 <ArrowRight :size="14" /></button></div></article></div>
        <section class="workspace-section"><div class="section-heading"><div><h2>我的工作空间 <span>{{ workspaces.length }}</span></h2><p>每一个空间，都是一段持续生长的理解。</p></div><div class="toolbar-actions"><button class="ol-button" @click="importInput?.click()"><Upload :size="15" />导入备份</button><button class="ol-button primary" @click="showNew()"><Plus :size="16" />新建空间</button></div></div><div class="workspace-filters"><div class="filter-pills"><button :class="{ active: scenarioFilter === 'all' }" @click="scenarioFilter = 'all'">全部</button><button v-for="(info, scenario) in scenarios" :key="scenario" :class="{ active: scenarioFilter === scenario }" @click="scenarioFilter = scenario">{{ info.name }}</button></div><label class="search-box"><Search :size="16" /><input v-model="search" placeholder="搜索工作空间" aria-label="搜索工作空间" /></label></div>
          <div v-if="loading" class="empty-state"><LoaderCircle class="spin" />正在读取本地空间…</div>
          <div v-else-if="!filteredWorkspaces.length" class="empty-workspaces"><div class="empty-icon"><FolderOpen :size="26" /></div><h3>{{ workspaces.length ? '没有匹配的空间' : '你的下一次探索，从这里开始' }}</h3><p>{{ workspaces.length ? '试试其他关键词或分类。' : '创建一个空间，或先打开上方示例。内容保存在当前浏览器。' }}</p></div>
          <div v-else class="workspace-grid"><article v-for="item in filteredWorkspaces" :key="item.id" class="workspace-card"><button class="workspace-open" @click="openWorkspace(item.id)"><span class="workspace-category" :style="{ color: scenarios[item.scenario].color }">{{ scenarios[item.scenario].name }}</span><h3>{{ item.title }}</h3><p>{{ item.summary || '还没有描述，从一个对象开始整理。' }}</p><div class="workspace-meta"><span>{{ item.nodes.length }} 个对象 · {{ item.sources.length }} 份资料</span><span>{{ formatDate(item.updatedAt) }}</span></div></button><button class="workspace-delete icon-button" :aria-label="`删除 ${item.title}`" @click="removeWorkspace(item.id)"><Trash2 :size="14" /></button></article></div>
        </section>
        <footer class="home-footer"><span>理解 · 设计 · 学习</span><span>本地内容不会自动上传。AI 请求需明确授权。</span></footer>
      </section>
    </main>

    <template v-else>
      <div class="workspace-titlebar"><div class="workspace-title"><span class="scenario-label" :style="{ color: scenarios[current.scenario].color }">{{ scenarios[current.scenario].name }}</span><input :value="current.title" aria-label="工作空间标题" maxlength="160" @change="commit(d => d.title = ($event.target as HTMLInputElement).value.trim(), '修改标题')" /><span class="save-status" :class="saveState"><LoaderCircle v-if="saveState === 'saving'" class="spin" :size="12" /><Check v-else-if="saveState === 'saved'" :size="12" />{{ saveState === 'saved' ? '已保存到本地' : saveState === 'saving' ? '保存中' : '保存失败' }}</span></div><div class="toolbar-actions"><button class="ol-button" @click="showHistory"><History :size="15" />历史</button><button class="ol-button" @click="exportJSON"><Download :size="15" />备份</button><button class="ol-button" @click="exportMarkdown"><FileText :size="15" />导出文档</button><button class="ol-button primary" :disabled="!pathNodes.length" @click="present"><Presentation :size="15" />{{ scenarios[current.scenario].action }}</button></div></div>
      <div class="workbench-body">
        <aside class="workbench-nav"><button class="back-home" @click="home"><ArrowLeft :size="14" />所有空间</button><div class="nav-group-label">工作台</div><button :class="['nav-item', { active: tab === 'map' }]" @click="tab = 'map'"><Network :size="17" />关系地图<span>{{ current.nodes.length }}</span></button><button :class="['nav-item', { active: tab === 'explain' }]" @click="tab = 'explain'"><BookOpen :size="17" />图文讲解</button><button :class="['nav-item', { active: tab === 'sources' }]" @click="tab = 'sources'"><FileText :size="17" />资料与依据<span>{{ current.sources.length }}</span></button><button :class="['nav-item', { active: tab === 'practice' }]" @click="tab = 'practice'"><GraduationCap :size="17" />{{ current.scenario === 'course' ? '练习与复习' : '理解自测' }}<span v-if="dueQuestions.length" class="due-count">{{ dueQuestions.length }}</span></button><button :class="['nav-item', { active: tab === 'archify' }]" @click="tab = 'archify'"><Layers3 :size="17" />Archify 视图</button>
          <div class="nav-group-label object-label">对象目录<button class="icon-button" aria-label="添加对象" @click="addNode"><Plus :size="15" /></button></div><label class="node-search"><Search :size="13" /><input v-model="nodeSearch" placeholder="查找对象…" aria-label="查找对象" /></label><div class="node-list"><button v-for="node in listedNodes" :key="node.id" :class="['node-list-item', { active: selectedId === node.id }]" @click="selectedId = node.id; if (tab === 'sources' || tab === 'archify') tab = 'map'"><span class="little-node" />{{ node.title }}</button><p v-if="!listedNodes.length" class="muted small">暂无对象</p></div><div class="nav-bottom"><span class="mini-label">LOCAL WORKSPACE</span><p>内容与记录保存在当前浏览器。<br />请定期导出备份。</p></div>
        </aside>

        <section class="workbench-main">
          <div v-if="tab === 'map' || tab === 'explain'" class="canvas-toolbar"><div class="mode-switch"><button :class="{ active: mode === 'explore' }" @click="mode = 'explore'">探索</button><button :class="{ active: mode === 'edit' }" @click="mode = 'edit'">编辑</button></div><div v-if="tab === 'map'" class="reach-tools"><select v-model="scope" aria-label="关系追踪范围"><option value="all">全部关系</option><option value="upstream">追踪上游</option><option value="downstream">追踪下游</option></select><span v-if="scope !== 'all'" class="small muted">仅已定义的关系，非运行时分析</span></div><div class="toolbar-actions"><button class="text-button" @click="addNode"><Plus :size="15" />对象</button><button class="text-button" :disabled="current.nodes.length < 2" @click="openRelation"><Link2 :size="15" />关系</button><button class="ai-button" :disabled="!!busy || !!current.nodes.length" @click="generate"><Sparkles :size="15" />AI 初稿</button></div></div>
          <GraphCanvas v-if="tab === 'map'" :nodes="current.nodes" :relations="current.relations" :selected-id="selectedId" :highlighted="highlighted" :editable="mode === 'edit'" @select="selectedId = $event" @move="(id, x, y) => commit(d => { const n = d.nodes.find(n => n.id === id)!; n.x = x; n.y = y }, '调整布局')" />

          <div v-if="tab === 'explain'" class="content-scroll explainer"><div class="document-eyebrow">{{ mode === 'present' ? 'GUIDED WALKTHROUGH' : 'EXPLAINER' }} / {{ scenarios[current.scenario].name }}</div><h1>{{ current.title }}</h1><textarea v-if="mode === 'edit'" :value="current.summary" class="summary-input" aria-label="工作空间简介" @change="commit(d => d.summary = ($event.target as HTMLTextAreaElement).value, '修改简介')" /><p v-else class="document-summary">{{ current.summary || '把对象连成结构，再把结构讲成故事。' }}</p>
            <div v-if="mode === 'present'" class="presentation-controls"><button class="ol-button" :disabled="step === 0" @click="goStep(-1)"><ArrowLeft :size="15" />上一步</button><span>{{ step + 1 }} / {{ pathNodes.length }}</span><button class="ol-button" :disabled="step >= pathNodes.length - 1" @click="goStep(1)">下一步<ArrowRight :size="15" /></button><button class="text-button" @click="mode = 'explore'">退出演示</button></div>
            <div class="explain-layout"><aside class="story-index"><span class="mini-label">{{ current.scenario === 'course' ? '学习路径' : '讲解顺序（可编辑，不代表调用顺序）' }}</span><div v-for="(node, index) in pathNodes" :key="node.id" class="story-step"><button :class="{ active: selectedId === node.id }" @click="selectedId = node.id; step = index"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ node.title }}</button><div v-if="mode === 'edit'" class="order-tools"><button :disabled="index === 0" :aria-label="`上移 ${node.title}`" @click="movePath(index, -1)">↑</button><button :disabled="index === pathNodes.length - 1" :aria-label="`下移 ${node.title}`" @click="movePath(index, 1)">↓</button></div></div></aside><article v-if="selected" class="explain-card"><span class="object-type">{{ nodeKinds[selected.kind] }}</span><h2>{{ selected.title }}</h2><p class="prose">{{ selected.body || '还没有解释。切换编辑模式补充，或使用右侧 AI 追问。' }}</p><div v-if="selected.example" class="example-box"><span>一个具体例子</span><p class="prose">{{ selected.example }}</p></div><div v-if="selected.pitfall" class="pitfall-box"><span>容易忽略的地方</span><p class="prose">{{ selected.pitfall }}</p></div><div v-if="selected.acceptance" class="acceptance-box"><h3>验收条件 / 待确认项</h3><p class="prose">{{ selected.acceptance }}</p></div><button class="text-button" @click="tab = 'practice'; practiceFilter = 'node'">检验对这个对象的理解 <ArrowRight :size="15" /></button></article><div v-else class="empty-state"><BookOpen /><p>添加对象后开始讲解。</p></div></div>
          </div>

          <div v-if="tab === 'sources'" class="content-scroll sources-page"><div class="section-heading"><div><div class="document-eyebrow">EVIDENCE LIBRARY</div><h1>资料与依据</h1><p>引用支持追溯，不等于结论已经被验证。</p></div><button class="ol-button primary" @click="showSource"><Plus :size="16" />添加资料</button></div><div v-if="!current.sources.length" class="empty-state"><FileText :size="35" /><h3>把理解建立在材料上</h3><p>粘贴文字或导入 TXT / Markdown。链接仅作引用，不会自动抓取。</p><button class="ol-button" @click="showSource">添加第一份资料</button></div><article v-for="source in current.sources" :key="source.id" class="source-card"><div class="source-heading"><FileText :size="19" /><div><h3>{{ source.title }}</h3><span>{{ source.text.length }} 字符 · {{ formatDate(source.createdAt) }}</span></div><button class="icon-button danger" :aria-label="`删除资料 ${source.title}`" @click="removeSource(source.id)"><Trash2 :size="15" /></button></div><a v-if="source.url" :href="source.url" target="_blank" rel="noopener noreferrer" class="source-url">{{ source.url }} ↗</a><details><summary>阅读原文 <ChevronDown :size="14" /></summary><pre>{{ source.text }}</pre></details></article></div>

          <div v-if="tab === 'practice'" class="content-scroll practice-page"><div class="section-heading"><div><div class="document-eyebrow">ACTIVE RECALL</div><h1>{{ current.scenario === 'course' ? '把看懂，变成记得住。' : '你能独立讲清楚吗？' }}</h1><p>先尝试回答，再对照参考答案。记录你的自评，而不是伪装自动评分。</p></div><button class="ol-button" :disabled="!current.nodes.length" @click="showQuestion"><Plus :size="15" />添加练习</button></div><div class="practice-stats"><div><strong>{{ current.questions.length }}</strong><span>关联题目</span></div><div><strong>{{ current.attempts.length }}</strong><span>作答记录</span></div><div><strong>{{ dueQuestions.length }}</strong><span>到期复习</span></div></div><div class="filter-pills practice-filters"><button :class="{ active: practiceFilter === 'all' }" @click="practiceFilter = 'all'">全部练习</button><button :class="{ active: practiceFilter === 'due' }" @click="practiceFilter = 'due'">到期复习</button><button :class="{ active: practiceFilter === 'node' }" @click="practiceFilter = 'node'">当前对象</button></div><div v-if="!activeQuestion" class="empty-state"><Check :size="32" /><h3>{{ practiceFilter === 'due' ? '暂时没有到期复习' : '还没有关联练习' }}</h3><p>{{ practiceFilter === 'due' ? '可以继续做新题，或回到地图整理知识。' : '添加问题和参考答案，让理解变得可检验。' }}</p></div><div v-else class="practice-layout"><nav class="question-list" aria-label="练习题列表"><button v-for="(q, index) in practiceQuestions" :key="q.id" :class="{ active: q.id === activeQuestion.id }" @click="questionId = q.id"><span>{{ index + 1 }}</span>{{ q.prompt }}</button></nav><article class="question-card"><button class="object-link" @click="selectedId = activeQuestion.nodeId; tab = 'explain'">{{ nodeTitle(activeQuestion.nodeId) }} <ArrowRight :size="13" /></button><h2>{{ activeQuestion.prompt }}</h2><label class="form-label">你的回答<textarea v-model="answer" placeholder="先不看答案，用自己的话解释…" rows="5" /></label><button v-if="!revealed" class="ol-button primary" :disabled="!answer.trim()" @click="revealed = true">查看参考答案</button><div v-else class="answer-panel"><span class="mini-label">参考答案 · 请自行核对</span><p class="prose">{{ activeQuestion.answer }}</p><p class="small muted">根据你自己的理解选择，不是 AI 自动判分。</p><div class="toolbar-actions"><button class="ol-button" @click="rate('again')">还需回顾 · 10 分钟后</button><button class="ol-button primary" @click="rate('good')">自评理解 · 明天复习</button></div></div><div v-if="latestAttempt" class="last-attempt"><strong>上次记录：{{ latestAttempt.rating === 'good' ? '自评理解' : '还需回顾' }}</strong><p class="prose">{{ latestAttempt.answer }}</p><span>下次回顾 {{ formatDate(latestAttempt.dueAt) }}</span></div></article></div></div>

          <div v-if="tab === 'archify'" class="archify-page"><div class="archify-toolbar"><div><h2>Archify 交互视图</h2><p>由真实渲染器生成 · 语义内容仍由 OneLook 保存</p></div><div class="toolbar-actions"><button v-if="artifact" class="ol-button" @click="download(JSON.stringify(artifact.ir, null, 2), 'diagram.archify.json', 'application/json')">JSON IR</button><button v-if="artifact" class="ol-button" @click="download(artifact.html, `${current.title}.html`, 'text/html')"><Download :size="14" />交互 HTML</button><button class="ol-button primary" :disabled="!!busy || !current.nodes.length" @click="render"><Layers3 :size="15" />{{ artifact ? '重新生成' : '生成视图' }}</button></div></div><div v-if="artifact && !artifactIsCurrent" class="stale-warning">内容已更新，下方为上一次成功生成的视图。请重新生成后再导出最新版本。</div><iframe v-if="artifact" :srcdoc="artifact.html" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Archify 隔离交互视图" /><div v-else class="empty-state"><Layers3 :size="44" /><h3>把结构变成可以探索的作品</h3><p>生成可独立分享的交互 HTML，以及可重复渲染的 JSON 源。</p><p class="small muted">{{ health?.archify ? '渲染服务已就绪。' : '需要本地 Node 服务与固定版本 Archify。未配置时会明确提示，不会伪造产物。' }}</p><button class="ol-button primary" :disabled="!!busy || !current.nodes.length" @click="render">生成 Archify 视图</button></div></div>
        </section>

        <aside v-if="selected && (tab === 'map' || tab === 'explain')" class="detail-panel"><div class="detail-heading"><span>对象详情</span><span :class="['provenance', selected.provenance]">{{ selected.provenance === 'ai' ? 'AI 初稿 · 待核实' : selected.provenance === 'demo' ? '示例内容' : '用户编辑' }}</span></div><template v-if="mode === 'edit'"><label class="form-label">标题<input :key="selected.id + '-title'" :value="selected.title" @change="updateNode('title', ($event.target as HTMLInputElement).value)" /></label><label class="form-label">对象类型<select :value="selected.kind" @change="updateNode('kind', ($event.target as HTMLSelectElement).value)"><option v-for="(name, kind) in nodeKinds" :key="kind" :value="kind">{{ name }}</option></select></label><label class="form-label">解释<textarea :key="selected.id + '-body'" :value="selected.body" rows="5" @change="updateNode('body', ($event.target as HTMLTextAreaElement).value)" /></label><label class="form-label">例子<textarea :key="selected.id + '-example'" :value="selected.example" rows="3" @change="updateNode('example', ($event.target as HTMLTextAreaElement).value)" /></label><label class="form-label">常见误区<textarea :key="selected.id + '-pitfall'" :value="selected.pitfall" rows="3" @change="updateNode('pitfall', ($event.target as HTMLTextAreaElement).value)" /></label><label v-if="current.scenario === 'product' || selected.kind === 'requirement'" class="form-label">验收条件 / 待确认项<textarea :key="selected.id + '-acceptance'" :value="selected.acceptance" rows="3" @change="updateNode('acceptance', ($event.target as HTMLTextAreaElement).value)" /></label></template><template v-else><span class="object-type">{{ nodeKinds[selected.kind] }}</span><h2>{{ selected.title }}</h2><p class="detail-body prose">{{ selected.body || '暂无解释。切换编辑模式补充。' }}</p><div v-if="selected.pitfall" class="detail-caution"><strong>留意这个误区</strong><p>{{ selected.pitfall }}</p></div></template>
          <label class="form-label detail-notes">{{ current.scenario === 'product' ? '我的笔记 / 决策与取舍' : '我的笔记' }}<textarea :key="selected.id + '-notes'" :value="selected.notes" rows="3" placeholder="记录你自己的理解…" @change="updateNode('notes', ($event.target as HTMLTextAreaElement).value)" /></label>
          <section class="detail-section"><h3><Link2 :size="14" />资料依据 <span>{{ selected.citations.length }}</span></h3><p v-if="!selected.citations.length" class="muted small">尚无来源支持，请核实关键结论。</p><div v-for="(citation, index) in selected.citations" :key="index" class="citation"><strong>{{ current.sources.find(s => s.id === citation.sourceId)?.title }}</strong><blockquote>{{ citation.quote }}</blockquote><button v-if="mode === 'edit'" class="text-button danger" @click="updateNode('citations', selected.citations.filter((_, i) => i !== index))">移除关联</button></div><details v-if="mode === 'edit' && current.sources.length" class="citation-editor"><summary>关联原文片段</summary><select v-model="citeSource" aria-label="引用来源"><option value="">选择资料</option><option v-for="s in current.sources" :key="s.id" :value="s.id">{{ s.title }}</option></select><textarea v-model="citeQuote" placeholder="粘贴该资料中的连续原文，保存时会校验" aria-label="引用原文" rows="3" /><button class="ol-button" @click="addCitation">添加引用</button></details></section>
          <section class="detail-section"><h3><GitBranch :size="14" />关联关系</h3><div v-for="relation in current.relations.filter(r => r.from === selectedId || r.to === selectedId)" :key="relation.id" class="relation-row"><button @click="selectedId = relation.from === selectedId ? relation.to : relation.from"><span>{{ relationKinds[relation.kind] }} · {{ relation.from === selectedId ? '→' : '←' }}</span>{{ nodeTitle(relation.from === selectedId ? relation.to : relation.from) }}</button><button v-if="mode === 'edit'" class="icon-button" aria-label="删除关系" @click="commit(d => d.relations = d.relations.filter(r => r.id !== relation.id), '删除关系')"><X :size="13" /></button></div></section>
          <section class="detail-section ai-section"><h3><Sparkles :size="14" />只对这个对象追问</h3><textarea v-model="aiQuestion" aria-label="局部追问" rows="3" /><button class="ol-button" :disabled="!!busy" @click="askAI"><Sparkles :size="14" />生成建议</button><div v-if="aiDraft" class="ai-draft"><span class="mini-label">建议预览 · 尚未替换</span><p class="prose">{{ aiDraft.body }}</p><p class="small muted">采用后清除旧引用关联，避免把旧证据误用于新解释。历史中保留原文。</p><div class="toolbar-actions"><button class="ol-button primary" @click="acceptExplanation">采用解释</button><button class="text-button" @click="aiDraft = undefined">放弃</button></div></div></section><button v-if="mode === 'edit'" class="text-button danger remove-object" @click="removeNode"><Trash2 :size="14" />删除对象</button>
        </aside>
      </div>
    </template>

    <div v-if="modal" class="modal-backdrop" @click.self="!busy && (modal = '')"><section class="ol-modal" :class="{ wide: modal === 'generate' || modal === 'history' }" role="dialog" aria-modal="true" :aria-label="modal === 'new' ? '新建工作空间' : modal === 'settings' ? 'AI 设置' : '工作空间操作'" @keydown.esc="!busy && (modal = '')"><button class="modal-close icon-button" aria-label="关闭弹窗" @click="modal = ''"><X :size="19" /></button>
      <template v-if="modal === 'new'"><div class="document-eyebrow">A NEW PERSPECTIVE</div><h2>开始一段新的探索</h2><p class="modal-intro">选择场景，然后从一个问题或一份资料开始。</p><form @submit.prevent="create"><label class="form-label">场景<select v-model="newScenario"><option v-for="(info, scenario) in scenarios" :key="scenario" :value="scenario">{{ info.name }}</option></select></label><label class="form-label">空间名称<input v-model="newTitle" required maxlength="160" placeholder="例如：理解项目的认证架构" autofocus /></label><label class="form-label">初始资料（可选）<textarea v-model="newMaterial" rows="6" placeholder="粘贴需求、技术说明或讲义摘录。不会自动发送给 AI。" /></label><button type="button" class="text-button" @click="materialInput?.click()"><Upload :size="14" />导入 TXT / Markdown</button><div class="modal-footer"><span>先创建，生成前还会征求发送授权。</span><button class="ol-button primary" :disabled="!newTitle.trim()">创建工作空间 <ArrowRight :size="15" /></button></div></form></template>
      <template v-if="modal === 'settings'"><div class="document-eyebrow">YOUR MODEL, YOUR CHOICE</div><h2>连接 AI 助手</h2><p class="modal-intro">可选能力。不开启 AI 也能编辑、学习、复习和导出。</p><label class="form-label">OpenAI 兼容 API 地址<input v-model="settings.baseUrl" placeholder="https://api.openai.com/v1" /></label><label class="form-label">模型<input v-model="settings.model" placeholder="gpt-4o-mini" /></label><label class="form-label">API Key · 只在内存中<input v-model="settings.apiKey" type="password" autocomplete="off" placeholder="刷新页面后需要重新输入" /></label><div class="privacy-box"><strong>这次请求会发送什么？</strong><p>生成初稿会发送当前空间的标题、场景与资料；局部追问会发送当前对象、必要的关联上下文与资料。密钥通过本地服务转发给所选提供商，不进入备份和浏览器存储。</p><p>服务器允许的域名：{{ health?.aiHosts?.join('、') || '默认 api.openai.com；其他域名需在服务端配置' }}。不会默认向任意地址转发密钥。</p></div><label class="consent"><input v-model="aiConsent" type="checkbox" /><span>我同意在主动点击 AI 操作时，将相关内容发送给上述模型提供商。</span></label><div class="modal-footer"><button class="text-button" @click="settings.apiKey = ''; aiConsent = false">清除密钥与授权</button><button class="ol-button primary" @click="modal = ''; error = ''">完成</button></div></template>
      <template v-if="modal === 'source'"><h2>添加资料</h2><p class="modal-intro">保留原文，让每个关键判断都能回到依据。</p><form @submit.prevent="addSource"><label class="form-label">资料标题<input v-model="sourceTitle" required /></label><label class="form-label">来源链接（可选，仅 HTTP / HTTPS）<input v-model="sourceUrl" type="url" placeholder="https://…" /></label><label class="form-label">原文<textarea v-model="sourceText" required rows="9" /></label><div class="modal-footer"><button class="text-button" type="button" @click="materialInput?.click()"><Upload :size="14" />导入文本文件</button><button class="ol-button primary">保存资料</button></div></form></template>
      <template v-if="modal === 'relation' && current"><h2>连接两个对象</h2><p class="modal-intro">说清楚关系的含义，而不只是画一条线。</p><form @submit.prevent="addRelation"><label class="form-label">起点<select v-model="relationFrom"><option v-for="n in current.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label><label class="form-label">关系类型<select v-model="relationKind"><option v-for="(name, kind) in relationKinds" :key="kind" :value="kind">{{ name }}</option></select></label><label class="form-label">终点<select v-model="relationTo"><option v-for="n in current.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label><label class="form-label">连线说明<input v-model="relationLabel" placeholder="例如：提交认证请求" /></label><p class="small muted">先修关系不能成环；起点应位于学习路径中终点之前。其他关系可以形成有意义的循环。</p><div class="modal-footer"><span /><button class="ol-button primary">添加关系</button></div></form></template>
      <template v-if="modal === 'question' && current"><h2>添加理解练习</h2><p class="modal-intro">每个问题都关联一个具体对象。</p><form @submit.prevent="addQuestion"><label class="form-label">关联对象<select v-model="questionNode"><option v-for="n in current.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label><label class="form-label">问题<textarea v-model="questionPrompt" required rows="3" /></label><label class="form-label">参考答案<textarea v-model="questionAnswer" required rows="5" /></label><div class="modal-footer"><span>练习时先隐藏参考答案。</span><button class="ol-button primary">保存练习</button></div></form></template>
      <template v-if="modal === 'history'"><h2>版本历史</h2><p class="modal-intro">保留最近 20 次变更前的内容。版本恢复不会回滚仍有效的学习记录。</p><div v-if="!revisions.length" class="empty-state">编辑内容后，这里会留下可恢复的版本。</div><div v-for="revision in revisions" :key="revision.id" class="revision-row"><div><strong>{{ revision.label }}</strong><p>{{ formatDate(revision.createdAt) }} · {{ revision.snapshot.nodes.length }} 个对象</p></div><button class="ol-button" @click="restore(revision)">恢复此版本</button></div></template>
      <template v-if="modal === 'generate' && generated"><div class="document-eyebrow">DRAFT, NOT FACT</div><h2>先确认结构，再开始探索</h2><p class="modal-intro">{{ generated.summary }}</p><div class="generated-list"><article v-for="node in generated.nodes" :key="node.id"><span>{{ nodeKinds[node.kind] }}</span><h3>{{ node.title }}</h3><p>{{ node.body }}</p></article></div><p class="small muted">{{ generated.relations.length }} 条关系 · {{ generated.questions.length }} 个练习。AI 生成的内容需要人工核实。</p><div class="modal-footer"><button class="text-button" @click="generated = undefined; modal = ''">放弃初稿</button><button class="ol-button primary" @click="acceptGenerated">采用这份初稿</button></div></template>
      <template v-if="modal === 'help'"><h2>一个工作台，三种探索方式</h2><div class="help-content"><h3>1. 从资料或示例开始</h3><p>新建架构、产品或课程空间。示例仅作教学，不代表真实项目或已确认需求。</p><h3>2. 保留你的编辑习惯</h3><p>在地图中探索关系，切换编辑后修改对象、添加连线、拖动布局。讲解页可调整顺序，笔记随对象保存。</p><h3>3. 让理解可以检验</h3><p>主动回答，再看参考答案并自评。“还需回顾”安排在 10 分钟后，“自评理解”安排在一天后，不生成虚假的掌握百分比。</p><h3>4. 内容可带走</h3><p>JSON 备份包含资料、对象和学习记录；Markdown 用于文档交流；Archify 服务可生成独立交互 HTML。清除浏览器数据会丢失本地内容，请定期备份。</p><h3>经典导图仍然在</h3><p>右上角进入原编辑器，原有 IndexedDB 文档与导入导出流程保持独立，不会被新空间覆盖。</p></div></template>
    </section></div>
  </div>
</template>
