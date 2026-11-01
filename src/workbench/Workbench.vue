<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, Download, Layers3, LoaderCircle, Plus, Search, Settings2, Trash2, X } from 'lucide-vue-next'
import GraphCanvas from './GraphCanvas.vue'
import SourceLibrary from './SourceLibrary.vue'
import EvidenceEditor from './EvidenceEditor.vue'
import ArchitectureStudio from './ArchitectureStudio.vue'
import ProductStudio from './ProductStudio.vue'
import ReviewStudio from './ReviewStudio.vue'
import { makeSource } from './evidence'
import { exampleWorkspace } from './examples'
import { createWorkspace, makeNode, makeView, validateWorkspace, applyGenerated, getDueQuestions } from './model'
import { listWorkspaces, getWorkspace, saveWorkspace, deleteWorkspace, listRevisions, restoreRevision, listMigrationBackups } from './storage'
import { generateContent, understandWorkspace, explainNode, renderArchify, getApiHealth } from './api'
import { scenarios, nodeKinds, relationKinds, documentTypes, certaintyKinds, type Citation, type Workspace, type Scenario, type KnowledgeNode, type RelationKind, type Revision, type GeneratedContent, type MaterialUnderstanding, type AISettings } from './types'
import './workbench.css'

const location = window.location
const workspaces = ref<Workspace[]>([]), current = ref<Workspace>()
const selectedId = ref(''), viewId = ref('')
const selected = computed(() => current.value?.nodes.find(n => n.id === selectedId.value))
const activeView = computed(() => current.value?.views.find(v => v.id === viewId.value) ?? current.value?.views[0])
const viewNodes = computed(() => activeView.value?.nodeIds.flatMap(id => {
  const node = current.value?.nodes.find(n => n.id === id)
  return node ? [{ ...node, ...activeView.value?.positions[id] }] : []
}) ?? [])
const viewRelations = computed(() => current.value?.relations.filter(r => activeView.value?.nodeIds.includes(r.from) && activeView.value.nodeIds.includes(r.to)) ?? [])
const tab = ref<'map' | 'explain' | 'sources' | 'practice' | 'archify' | 'architecture' | 'product' | 'views'>('map')
const mode = ref<'explore' | 'edit' | 'present'>('explore')
const modal = ref<'' | 'new' | 'settings' | 'relation' | 'history' | 'generate' | 'understand' | 'help'>('')
const switching = ref(false)
const loading = ref(true), busy = ref(''), error = ref(''), notice = ref('')
const saveState = ref<'saved' | 'saving' | 'error'>('saved')
const search = ref(''), scenarioFilter = ref<Scenario | 'all'>('all')
const filteredWorkspaces = computed(() => workspaces.value.filter(w => (scenarioFilter.value === 'all' || w.scenario === scenarioFilter.value) && `${w.title} ${w.summary}`.toLowerCase().includes(search.value.toLowerCase())))
const nodeSearch = ref('')
const listedNodes = computed(() => current.value?.nodes.filter(n => `${n.title} ${n.body}`.toLowerCase().includes(nodeSearch.value.toLowerCase())) ?? [])
const scope = ref<'all' | 'upstream' | 'downstream'>('all')
const highlighted = computed(() => {
  if (!selectedId.value || scope.value === 'all') return []
  const seen = new Set([selectedId.value]), queue = [selectedId.value]
  for (let i = 0; i < queue.length; i++) for (const edge of viewRelations.value) {
    const from = scope.value === 'downstream' ? edge.from : edge.to, to = scope.value === 'downstream' ? edge.to : edge.from
    if (from === queue[i] && !seen.has(to)) { seen.add(to); queue.push(to) }
  }
  return [...seen]
})
const newTitle = ref(''), newScenario = ref<Scenario>('architecture'), newMaterial = ref('')
const relationFrom = ref(''), relationTo = ref(''), relationKind = ref<RelationKind>('calls'), relationLabel = ref('')
const revisions = ref<Revision[]>([]), step = ref(0)
const pathNodes = computed(() => activeView.value?.path.map(id => current.value!.nodes.find(n => n.id === id)).filter((n): n is KnowledgeNode => !!n) ?? [])
const clock = ref(Date.now())
const dueQuestions = computed(() => current.value ? getDueQuestions(current.value, clock.value) : [])
const viewTitle = ref(''), viewScenario = ref<Scenario>('architecture'), focusedCitation = ref<Citation>()
const externalChange = ref(false), healthError = ref(''), healthChecking = ref(false), backupAt = ref(0)
const needsBackup = computed(() => !!current.value && (!backupAt.value || clock.value - backupAt.value >= 7 * 86400000))
const importPreview = ref<Workspace>()
const settings = ref<AISettings>({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' })
const aiConsent = ref(false), aiQuestion = ref('用一个具体例子解释这个概念，并指出常见误区。')
const aiDraft = ref<{ workspaceId: string; nodeId: string; original: string; body: string }>()
const generated = ref<GeneratedContent>(), generatedFor = ref(''), generatedFrom = ref('')
const understanding = ref<MaterialUnderstanding>(), understandingFor = ref('')
const artifact = ref<{ html: string; ir: unknown; updatedAt: number; workspaceId: string; viewId: string }>()
const health = ref<{ archify: boolean; aiHosts: string[] }>()
const artifactIsCurrent = computed(() => artifact.value?.workspaceId === current.value?.id && artifact.value?.updatedAt === current.value?.updatedAt && artifact.value?.viewId === activeView.value?.id)
const importInput = ref<HTMLInputElement>(), materialInput = ref<HTMLInputElement>()
let persistedRevision = 0, writeFailed = false
let channel: BroadcastChannel | undefined, requestController: AbortController | undefined
let saveQueue: Promise<void> = Promise.resolve()
let timer: ReturnType<typeof setInterval> | undefined, noticeTimer: ReturnType<typeof setTimeout> | undefined
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function notify(message: string) { notice.value = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.value = '', 4500) }
function fail(reason: unknown) { error.value = reason instanceof Error ? reason.message : String(reason) }
function formatDate(time: number) { return new Date(time).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function nodeTitle(id: string) { return current.value?.nodes.find(n => n.id === id)?.title ?? '已删除对象' }
async function refresh() { workspaces.value = await listWorkspaces() }
function beforeUnload(event: BeforeUnloadEvent) { if (switching.value || saveState.value !== 'saved') { event.preventDefault(); event.returnValue = '' } }
async function checkHealth() {
  if (healthChecking.value) return
  healthChecking.value = true
  try { health.value = await getApiHealth(); healthError.value = '' }
  catch (e) { health.value = undefined; healthError.value = (e as Error).message }
  finally { healthChecking.value = false }
}
async function checkExternal() {
  if (!current.value || saveState.value === 'saving') return
  const id = current.value.id
  try { const saved = await getWorkspace(id); if (current.value?.id === id && (!saved || saved.revision !== persistedRevision)) externalChange.value = true }
  catch (e) { fail(e) }
}
onMounted(async () => {
  try { await refresh() } catch (e) { fail(e) } finally { loading.value = false }
  void checkHealth()
  if (typeof BroadcastChannel !== 'undefined') { channel = new BroadcastChannel('onelook-workbench-changes'); channel.onmessage = () => void checkExternal() }
  timer = setInterval(() => { clock.value = Date.now(); void checkExternal() }, 30000)
  window.addEventListener('beforeunload', beforeUnload); window.addEventListener('focus', checkExternal)
})
onUnmounted(() => { clearInterval(timer); clearTimeout(noticeTimer); channel?.close(); requestController?.abort(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('focus', checkExternal) })
watch(selectedId, () => { aiDraft.value = undefined })
watch(viewId, () => { step.value = 0; scope.value = 'all'; if (!activeView.value?.nodeIds.includes(selectedId.value)) selectedId.value = activeView.value?.nodeIds[0] ?? '' })
watch(() => [settings.value.baseUrl, settings.value.model, settings.value.apiKey], () => { aiConsent.value = false; requestController?.abort() }, { flush: 'sync' })

function commit(change: (draft: Workspace) => void, label: string) {
  if (!current.value) return false
  if (switching.value) { fail('正在保存或切换空间，请稍候。'); return false }
  if (externalChange.value) { fail('另一个标签页已修改此空间。请先保留本地副本或载入最新版本，不会覆盖对方内容。'); return false }
  try {
    const draft = clone(current.value); change(draft); draft.updatedAt = Math.max(Date.now(), current.value.updatedAt + 1)
    const valid = validateWorkspace(draft); current.value = valid
    const snapshot = clone(valid)
    if (writeFailed) { saveState.value = 'error'; return true }
    saveState.value = 'saving'
    saveQueue = saveQueue.then(async () => {
      if (writeFailed) return
      const saved = await saveWorkspace(snapshot, label, persistedRevision)
      persistedRevision = saved.revision; channel?.postMessage(saved.id)
      if (current.value?.id === saved.id) {
        current.value.revision = saved.revision
        if (current.value.updatedAt === snapshot.updatedAt) saveState.value = 'saved'
      }
      await refresh()
    }).catch(e => { writeFailed = true; saveState.value = 'error'; fail(e); void checkExternal() })
    return true
  } catch (e) { fail(e); return false }
}
async function retrySave() {
  return withDocumentLock(async () => {
  await saveQueue
  if (!current.value) return
  const snapshot = clone(current.value)
  saveState.value = 'saving'
  try {
    const saved = await saveWorkspace(snapshot, '重试保存', persistedRevision)
    persistedRevision = saved.revision; current.value.revision = saved.revision; writeFailed = false
    if (current.value.updatedAt === snapshot.updatedAt) saveState.value = 'saved'
    else { saveState.value = 'error'; writeFailed = true; fail('重试期间有新编辑，请再次保存这些变更。'); return }
    error.value = ''; channel?.postMessage(saved.id); await refresh()
  } catch (e) { saveState.value = 'error'; writeFailed = true; fail(e); void checkExternal() }

  })
}
async function withDocumentLock(action: () => Promise<void>) {
  if (switching.value) return
  switching.value = true
  try { await saveQueue; await action() } catch (e) { fail(e) }
  finally { switching.value = false }
}
function adoptWorkspace(item: Workspace) {
  requestController?.abort()
  current.value = item; persistedRevision = item.revision; writeFailed = false; saveState.value = 'saved'; externalChange.value = false
  selectedId.value = item.nodes[0]?.id ?? ''; viewId.value = item.views[0]?.id ?? ''; mode.value = 'explore'; tab.value = 'map'; scope.value = 'all'; step.value = 0
  artifact.value = undefined; aiDraft.value = undefined; generated.value = undefined; focusedCitation.value = undefined; nodeSearch.value = ''; error.value = ''
  try { backupAt.value = Number(localStorage.getItem(`onelook-backup:${item.id}`)) || 0 } catch { backupAt.value = 0 }
}
async function openWorkspace(id: string) {
  return withDocumentLock(async () => {
  await saveQueue
  if (saveState.value === 'error') { fail('当前内容未保存，请先重试保存、保留副本或导出备份。'); return }
  try { const item = await getWorkspace(id); if (!item) throw new Error('工作空间不存在。'); adoptWorkspace(item) } catch (e) { fail(e) }

  })
}
async function reloadLatest() {
  return withDocumentLock(async () => {
  if (!current.value) return
  await saveQueue
  if (saveState.value !== 'saved' && !confirm('放弃本页未保存的更改并载入最新版本？建议先导出备份或保留副本。')) return
  try { const item = await getWorkspace(current.value.id); if (!item) throw new Error('空间已被删除。请导出本页内容或保留副本。'); adoptWorkspace(item); await refresh() } catch (e) { fail(e) }

  })
}
async function saveCopy() {
  return withDocumentLock(async () => {
  await saveQueue
  if (!current.value) return
  try {
    const copy = clone(current.value); copy.id = crypto.randomUUID(); copy.revision = 0; copy.title = `${copy.title.slice(0, 180)}（本地副本）`; copy.updatedAt = Date.now()
    adoptWorkspace(await saveWorkspace(copy)); await refresh(); notify('已保存独立副本，其他标签页的版本没有被覆盖。')
  } catch (e) { fail(e) }

  })
}
async function home() {
  return withDocumentLock(async () => { await saveQueue; if (saveState.value === 'error') { fail('请先保存或导出当前内容。'); return }; requestController?.abort(); current.value = undefined; mode.value = 'explore'; await refresh()
  })
}
async function addExample(scenario: Scenario) {
  return withDocumentLock(async () => { try { await saveQueue; const saved = await saveWorkspace(exampleWorkspace(scenario)); await refresh(); adoptWorkspace(saved) } catch (e) { fail(e) }
  })
}
function showNew(scenario: Scenario = 'architecture') { newScenario.value = scenario; newTitle.value = ''; newMaterial.value = ''; modal.value = 'new' }
async function create() {
  return withDocumentLock(async () => {
  if (!newTitle.value.trim()) return
  try {
    const doc = createWorkspace(newScenario.value, newTitle.value.trim())
    if (newMaterial.value.trim()) doc.sources.push(makeSource('初始资料', newMaterial.value))
    const saved = await saveWorkspace(doc); await refresh(); adoptWorkspace(saved); modal.value = ''; notify('空间已创建。添加对象，或用 AI 生成初稿。')
  } catch (e) { fail(e) }

  })
}
async function removeWorkspace(id: string) {
  const item = workspaces.value.find(w => w.id === id)
  if (!item || !confirm('删除当前工作空间及普通历史？此操作不可撤销；迁移前备份会保留，建议先导出备份。')) return
  try { await deleteWorkspace(id, item.revision); channel?.postMessage(id); await refresh() } catch (e) { fail(e) }
}
function updateNode(field: keyof KnowledgeNode, value: unknown) { const id = selectedId.value; commit(doc => { const node = doc.nodes.find(n => n.id === id); if (node) Object.assign(node, { [field]: value }) }, '编辑对象') }
function addNode() {
  const scenario = activeView.value?.scenario ?? current.value?.scenario
  const node = makeNode('新对象', scenario === 'architecture' ? 'component' : scenario === 'product' ? 'requirement' : 'concept'), target = activeView.value?.id
  if (commit(doc => { doc.nodes.push(node); const view = doc.views.find(v => v.id === target)!; view.nodeIds.push(node.id); view.path.push(node.id) }, '添加对象')) { selectedId.value = node.id; mode.value = 'edit'; tab.value = 'map' }
}
function removeNode() {
  const id = selectedId.value
  if (!confirm('删除此对象及所有视图中的位置、相关连线、请求步骤、主要关联题目和作答？其他记录只移除对象关联。')) return
  if (commit(doc => {
    doc.nodes = doc.nodes.filter(n => n.id !== id); doc.relations = doc.relations.filter(r => r.from !== id && r.to !== id)
    doc.views.forEach(v => { v.nodeIds = v.nodeIds.filter(n => n !== id); v.path = v.path.filter(n => n !== id); delete v.positions[id] })
    doc.questions = doc.questions.filter(q => q.nodeId !== id); doc.questions.forEach(q => q.relatedNodeIds = q.relatedNodeIds.filter(n => n !== id)); doc.attempts = doc.attempts.filter(a => doc.questions.some(q => q.id === a.questionId))
    doc.flows.forEach(f => f.steps = f.steps.filter(s => s.from !== id && s.to !== id)); doc.decisions.forEach(d => d.nodeIds = d.nodeIds.filter(n => n !== id)); doc.productItems.forEach(i => i.nodeIds = i.nodeIds.filter(n => n !== id))
  }, '删除对象')) selectedId.value = current.value?.nodes[0]?.id ?? ''
}
function openRelation() { relationFrom.value = selectedId.value || current.value?.nodes[0]?.id || ''; relationTo.value = current.value?.nodes.find(n => n.id !== relationFrom.value)?.id ?? ''; relationKind.value = activeView.value?.scenario === 'course' ? 'prerequisite' : activeView.value?.scenario === 'product' ? 'next' : 'calls'; relationLabel.value = ''; modal.value = 'relation' }
function addRelation() {
  if (!relationFrom.value || !relationTo.value || relationFrom.value === relationTo.value) { fail('请选择两个不同的对象。'); return }
  if (commit(doc => doc.relations.push({ id: crypto.randomUUID(), from: relationFrom.value, to: relationTo.value, kind: relationKind.value, label: relationLabel.value.trim() || relationKinds[relationKind.value] }), '添加关系')) modal.value = ''
}
function movePath(index: number, delta: number) {
  const key = activeView.value?.id
  commit(doc => { const path = doc.views.find(v => v.id === key)!.path; const next = index + delta; if (next >= 0 && next < path.length) [path[index], path[next]] = [path[next]!, path[index]!] }, '调整视图讲解顺序')
}
function moveNode(id: string, x: number, y: number) { const key = activeView.value?.id; commit(d => { d.views.find(v => v.id === key)!.positions[id] = { x, y } }, '调整视图布局') }
function addView() {
  if (!current.value || !viewTitle.value.trim()) return
  const view = makeView(clone(current.value), viewScenario.value, viewTitle.value.trim())
  if (commit(d => d.views.push(view), '添加独立视图')) { viewId.value = view.id; viewTitle.value = ''; tab.value = 'map' }
}
function removeView() { const id = activeView.value?.id; if (!current.value || current.value.views.length < 2 || !confirm('删除这个视图？共享内容与学习记录不会被删除。')) return; if (commit(d => d.views = d.views.filter(v => v.id !== id), '删除视图')) viewId.value = current.value?.views[0]?.id ?? '' }
function toggleViewNode(id: string) {
  const key = activeView.value?.id
  commit(d => {
    const view = d.views.find(v => v.id === key)!
    if (view.nodeIds.includes(id)) { view.nodeIds = view.nodeIds.filter(n => n !== id); view.path = view.path.filter(n => n !== id); delete view.positions[id]; return }
    view.nodeIds.push(id)
    const remaining = [...view.path, id], ordered: string[] = []
    while (remaining.length) {
      const index = remaining.findIndex(node => !d.relations.some(r => r.kind === 'prerequisite' && r.to === node && remaining.includes(r.from)))
      if (index < 0) throw new Error('先修关系成环，无法生成讲解顺序。')
      ordered.push(...remaining.splice(index, 1))
    }
    view.path = ordered
  }, '调整视图对象')
}
function inspectNode(id: string) { if (!activeView.value?.nodeIds.includes(id)) { const view = current.value?.views.find(v => v.nodeIds.includes(id)); if (view) viewId.value = view.id }; selectedId.value = id; tab.value = 'map' }
function present() { if (!pathNodes.value.length) return; mode.value = 'present'; tab.value = 'explain'; step.value = 0; selectedId.value = pathNodes.value[0]!.id }
function goStep(delta: number) { step.value = Math.max(0, Math.min(pathNodes.value.length - 1, step.value + delta)); selectedId.value = pathNodes.value[step.value]?.id ?? '' }
function locateCitation(citation: Citation) { focusedCitation.value = { ...citation }; tab.value = 'sources' }
async function readMaterial(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return
  try { if (!/\.(txt|md|markdown)$/i.test(file.name) || file.size > 1000000) throw new Error('初始资料支持 1 MB 以内的 TXT / Markdown；PDF 和源码请创建后在资料库导入。'); newMaterial.value = await file.text() } catch (e) { fail(e) }
  ;(event.target as HTMLInputElement).value = ''
}
function removeSource(id: string) {
  if (!confirm('删除资料及所有版本和引用？相关内容保留，但依赖该资料的证据会降为待核实。')) return
  commit(d => {
    d.sources = d.sources.filter(s => s.id !== id); d.nodes.forEach(n => n.citations = n.citations.filter(c => c.sourceId !== id)); d.decisions.forEach(a => a.citations = a.citations.filter(c => c.sourceId !== id))
    d.flows.forEach(f => f.steps.forEach(s => { s.citations = s.citations.filter(c => c.sourceId !== id); if (!s.citations.length) s.evidence = 'unverified' }))
    d.productItems.forEach(i => { i.citations = i.citations.filter(c => c.sourceId !== id); if (i.type === 'evidence' && !i.citations.length && i.status === 'confirmed') i.status = 'unverified' })
  }, '删除资料')
}
async function showHistory() { if (!current.value) return; await saveQueue; try { revisions.value = await listRevisions(current.value.id); modal.value = 'history' } catch (e) { fail(e) } }
async function restore(revision: Revision) {
  return withDocumentLock(async () => {
  await saveQueue
  if (saveState.value !== 'saved' || externalChange.value) { fail('请先解决未保存内容或多标签页冲突，再恢复历史。'); return }
  if (!confirm('恢复此版本？当前内容先存为历史；保留仍有效题目的最新作答记录。')) return
  try { const saved = await restoreRevision(clone(revision), persistedRevision); adoptWorkspace(saved); channel?.postMessage(saved.id); await refresh(); modal.value = ''; notify('内容版本已恢复。') } catch (e) { fail(e); void checkExternal() }

  })
}
function download(content: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportJSON() {
  if (!current.value) return
  download(JSON.stringify(current.value, null, 2), `${current.value.title}.onelook.json`, 'application/json')
  backupAt.value = Date.now()
  try { localStorage.setItem(`onelook-backup:${current.value.id}`, String(backupAt.value)) } catch { /* Download remains usable when browser metadata storage is unavailable. */ }
}
async function exportMigrationBackup() {
  try { const backups = await listMigrationBackups(current.value?.id); if (!backups.length) { notify('没有 V1 迁移前备份；新建的 V2 空间无需迁移。'); return }; for (const backup of backups) download(JSON.stringify(backup.snapshot, null, 2), `onelook-v1-${backup.workspaceId}.json`, 'application/json') } catch (e) { fail(e) }
}
function exportMarkdown() {
  const d = current.value; if (!d) return
  const text = `# ${d.title}\n\n${d.summary}\n\n` + d.nodes.map(n => `## ${n.title}\n\n${n.body}\n\n### 例子\n${n.example}\n\n### 常见误区\n${n.pitfall}\n\n### 笔记\n${n.notes}\n\n### 验收条件\n${n.acceptance}\n\n` + n.citations.map(c => `> ${c.quote}\n> ${d.sources.find(s => s.id === c.sourceId)?.title} · v${c.version} · 字符 ${c.start + 1}–${c.end}`).join('\n')).join('\n')
    + '\n\n## 视图\n' + d.views.map(v => `### ${v.title}\n场景：${scenarios[v.scenario].name}\n讲解顺序：${v.path.map(nodeTitle).join(' → ')}`).join('\n\n')
    + '\n\n## 关系\n' + d.relations.map(r => `- ${nodeTitle(r.from)} → ${nodeTitle(r.to)}：${r.label}（${relationKinds[r.kind]}）`).join('\n')
    + '\n\n## 请求链路\n' + d.flows.map(f => `### ${f.title}\n` + f.steps.map((s, i) => `${i + 1}. ${nodeTitle(s.from)} → ${nodeTitle(s.to)}：${s.message} [${s.branch}; ${s.condition || '无附加条件'}; ${s.evidence}]`).join('\n')).join('\n\n')
    + '\n\n## 架构决策\n' + d.decisions.map(a => `### ${a.title}\n问题：${a.context}\n选择：${a.choice}\n备选：${a.alternatives}\n影响：${a.consequences}`).join('\n\n')
    + '\n\n## 产品记录\n' + d.productItems.map(i => `### ${i.title} [${i.type} / ${i.status}]\n${i.body}\n` + i.alternatives.map(a => `- ${a.title}：收益 ${a.benefits}；代价 ${a.costs}`).join('\n') + '\n' + i.criteria.map(c => `- [${c.state}] ${c.text}；验证依据：${c.evidence || '尚无'}`).join('\n')).join('\n\n')
    + '\n\n## 作答与错因\n' + d.attempts.map(a => `- ${d.questions.find(q => q.id === a.questionId)?.prompt}\n  自评：${a.rating}；作答：${a.answer}\n  错因：${a.errorReason}\n  安排复习：${new Date(a.dueAt).toISOString()}`).join('\n')
    + '\n\n## 资料\n' + d.sources.map(s => `### ${s.title} · v${s.version}\n${s.url ?? ''}\n${s.filePath ?? ''} ${s.revision ?? ''}\n\n${s.text}`).join('\n\n') + '\n\n完整历史、引用位置与布局请使用 JSON 备份。\n'
  download(text, `${d.title}.md`, 'text/markdown')
}
async function importJSON(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return
  try { if (file.size > 50000000) throw new Error('备份文件不能超过 50 MB。'); importPreview.value = validateWorkspace(JSON.parse(await file.text())) } catch (e) { fail(e) }
  ;(event.target as HTMLInputElement).value = ''
}
async function confirmImport() {
  return withDocumentLock(async () => {
  if (!importPreview.value) return
  try { const doc = clone(importPreview.value); doc.id = crypto.randomUUID(); doc.revision = 0; doc.title = `${doc.title.slice(0, 180)}（导入）`; doc.updatedAt = Date.now(); const saved = await saveWorkspace(doc); importPreview.value = undefined; await refresh(); adoptWorkspace(saved); notify('已导入独立副本，未覆盖任何现有空间。') } catch (e) { fail(e) }

  })
}
function checkAI() { if (!settings.value.apiKey.trim()) { modal.value = 'settings'; fail('请填写模型 API Key，密钥只在当前页面内存中保留。'); return false }; if (!aiConsent.value) { modal.value = 'settings'; fail('请先确认资料发送范围。'); return false }; return true }
function beginRequest(label: string) { const controller = new AbortController(); requestController = controller; busy.value = label; error.value = ''; return controller }
function cancelRequest() { requestController?.abort(); requestController = undefined; busy.value = ''; notify('已取消请求，不会采用迟到的响应。') }
function finishRequest(controller: AbortController) { if (requestController === controller) { requestController = undefined; busy.value = '' } }
function draftBasis(doc: Workspace) { return JSON.stringify({ title: doc.title, scenario: doc.scenario, summary: doc.summary, sources: doc.sources }) }
async function generate() {
  if (busy.value || !current.value || !checkAI()) return
  if (current.value.nodes.length) { fail('AI 初稿只能填充空白空间；已有对象请使用局部追问。'); return }
  const doc = clone(current.value), controller = beginRequest('正在生成结构化初稿…'); generated.value = undefined
  try { const result = await generateContent(doc, { ...settings.value }, controller.signal); if (controller.signal.aborted || current.value?.id !== doc.id) return; applyGenerated(doc, result); generated.value = result; generatedFor.value = doc.id; generatedFrom.value = draftBasis(doc); modal.value = 'generate' } catch (e) { if (!controller.signal.aborted) fail(e) } finally { finishRequest(controller) }
}
async function understand() {
  if (busy.value || !current.value || !checkAI()) return
  if (!current.value.sources.length) { fail('先添加资料，再让 AI 生成可核对的理解报告。'); return }
  const doc = clone(current.value), controller = beginRequest('正在生成材料理解报告…'); understanding.value = undefined
  try { const result = await understandWorkspace(doc, { ...settings.value }, controller.signal); if (controller.signal.aborted || current.value?.id !== doc.id) return; understanding.value = result; understandingFor.value = doc.id; modal.value = 'understand' } catch (e) { if (!controller.signal.aborted) fail(e) } finally { finishRequest(controller) }
}
function entityTitle(understanding: MaterialUnderstanding, id: string) { return understanding.entities.find(e => e.id === id)?.title ?? id }
function acceptGenerated() {
  if (!current.value || !generated.value || generatedFor.value !== current.value.id) return
  if (draftBasis(current.value) !== generatedFrom.value) { fail('资料或生成上下文已改变，请重新生成初稿。'); return }
  const payload = generated.value
  if (commit(doc => Object.assign(doc, applyGenerated(doc, payload)), '采用 AI 初稿')) { selectedId.value = current.value?.nodes[0]?.id ?? ''; generated.value = undefined; modal.value = '' }
}
async function askAI() {
  if (busy.value || !current.value || !selected.value || !checkAI() || !aiQuestion.value.trim()) return
  const doc = clone(current.value), node = clone(selected.value), controller = beginRequest('正在生成局部建议…')
  try { const body = await explainNode(doc, node.id, aiQuestion.value.trim(), { ...settings.value }, controller.signal); if (!controller.signal.aborted && current.value?.id === doc.id && selectedId.value === node.id) aiDraft.value = { workspaceId: doc.id, nodeId: node.id, original: node.body, body } } catch (e) { if (!controller.signal.aborted) fail(e) } finally { finishRequest(controller) }
}
function acceptExplanation() {
  const draft = aiDraft.value
  if (!draft || draft.workspaceId !== current.value?.id || draft.nodeId !== selectedId.value) return
  if (selected.value?.body !== draft.original) { fail('原文已被修改，请重新生成建议，避免覆盖新编辑。'); return }
  if (commit(doc => { const node = doc.nodes.find(n => n.id === draft.nodeId)!; node.body = draft.body; node.provenance = 'ai'; node.citations = [] }, '采用局部 AI 建议')) aiDraft.value = undefined
}
async function render() {
  if (busy.value || !current.value || !activeView.value?.nodeIds.length) return
  const doc = clone(current.value), target = activeView.value.id, controller = beginRequest('Archify 正在渲染当前视图…')
  try { const result = await renderArchify(doc, target, controller.signal); if (controller.signal.aborted || current.value?.id !== doc.id) return; artifact.value = { ...result, updatedAt: doc.updatedAt, workspaceId: doc.id, viewId: target }; tab.value = 'archify' } catch (e) { if (!controller.signal.aborted) fail(e) } finally { finishRequest(controller) }
}
</script>

<template>
  <div class="ol-app" :class="{ presenting: mode === 'present' }" :inert="switching || undefined" :aria-busy="switching">
    <header class="ol-header">
      <button class="brand" aria-label="OneLook 首页" @click="home"><span class="brand-mark"><Layers3 :size="21" /></span><strong>OneLook<span>一目</span></strong></button>
      <div v-if="current" class="breadcrumb"><ChevronRight :size="14" /><button @click="home">工作空间</button><ChevronRight :size="14" /><span>{{ current.title }}</span></div>
      <span v-else class="brand-caption">可视化工作台</span>
      <div class="header-actions"><button class="icon-button" aria-label="使用帮助" @click="modal = 'help'"><CircleHelp :size="18" /></button><button class="icon-button" aria-label="AI 设置" @click="modal = 'settings'"><Settings2 :size="18" /></button><a class="legacy-link" href="?editor=classic">经典导图</a></div>
    </header>

    <div v-if="error" class="error-banner" role="alert"><span>{{ error }}</span><button v-if="saveState === 'error' && !externalChange" @click="retrySave">重试保存</button><button v-if="saveState === 'error'" @click="saveCopy">保留本地副本</button><button v-if="current" @click="exportJSON">导出备份</button><button aria-label="关闭错误提示" @click="error = ''"><X :size="16" /></button></div>
    <div v-if="notice" class="ol-toast" role="status"><Check :size="16" />{{ notice }}</div>
    <div v-if="busy" class="busy-bar" role="status"><LoaderCircle class="spin" :size="16" />{{ busy }}<span>不会覆盖当前已保存内容</span><button class="text-button" @click="cancelRequest">取消请求</button></div>
    <div v-if="externalChange && current" class="conflict-banner" role="alert"><strong>此空间已在另一标签页更改或删除。</strong><span>当前内容仍保留，保存时不会覆盖另一版本。</span><button class="ol-button" @click="saveCopy">保留本地副本</button><button class="ol-button" @click="reloadLatest">载入最新版本</button></div>
    <details class="service-status"><summary><i :class="['service-dot', { ready: health }]" />{{ healthChecking ? '正在检查本地服务…' : health ? (health.archify ? '本地服务已连接' : '本地服务已连接 · Archify 未就绪') : '本地服务未连接 · 本地编辑仍可使用' }}</summary><div><p>{{ healthError || 'AI 需在设置中配置你自己的提供商与密钥。' }}</p><p>启动：<code>pnpm local</code>（或开发用 <code>pnpm dev:all</code>）。存储归属 <strong>{{ location.origin }}</strong>；更换端口、域名或浏览器前请先导出备份，不要把本地服务暴露到公网。</p><button class="ol-button" :disabled="healthChecking" @click="checkHealth">重新检查</button><button class="text-button" @click="exportMigrationBackup">导出迁移前备份</button></div></details>
    <input ref="importInput" type="file" accept=".json" hidden @change="importJSON" />
    <input ref="materialInput" type="file" accept=".txt,.md,.markdown" hidden @change="readMaterial" />

    <main v-if="!current" class="home-scroll">
      <section class="home-content">
        <div class="section-heading home-heading"><div><h1>工作空间</h1><p class="muted">资料、结构与练习保存在当前浏览器，不会自动上传。</p></div><div class="toolbar-actions"><button class="ol-button" @click="importInput?.click()">导入备份</button><button class="ol-button primary" @click="showNew()">新建空间</button></div></div>
        <div class="workspace-filters"><div class="filter-pills"><button :class="{ active: scenarioFilter === 'all' }" @click="scenarioFilter = 'all'">全部</button><button v-for="(info, scenario) in scenarios" :key="scenario" :class="{ active: scenarioFilter === scenario }" @click="scenarioFilter = scenario">{{ info.name }}</button></div><label class="search-box"><Search :size="15" /><input v-model="search" placeholder="搜索" aria-label="搜索工作空间" /></label></div>
        <div v-if="loading" class="empty-state"><LoaderCircle class="spin" />正在读取…</div>
        <div v-else-if="!filteredWorkspaces.length" class="empty-workspaces"><p>{{ workspaces.length ? '没有匹配的空间。' : '还没有空间。新建一个，或从示例开始。' }}</p></div>
        <div v-else class="workspace-grid"><article v-for="item in filteredWorkspaces" :key="item.id" class="workspace-card"><button class="workspace-open" @click="openWorkspace(item.id)"><span class="workspace-category" :style="{ color: scenarios[item.scenario].color }">{{ scenarios[item.scenario].name }}</span><h3>{{ item.title }}</h3><p>{{ item.summary || '还没有描述。' }}</p><div class="workspace-meta"><span>{{ item.nodes.length }} 个对象 · {{ item.sources.length }} 份资料</span><span>{{ formatDate(item.updatedAt) }}</span></div></button><button class="workspace-delete icon-button" :aria-label="`删除 ${item.title}`" @click="removeWorkspace(item.id)"><Trash2 :size="14" /></button></article></div>
        <section class="scenario-strip"><span class="muted small">从示例开始：</span><button v-for="(info, scenario) in scenarios" :key="scenario" class="text-button" @click="addExample(scenario)">{{ info.name }}示例</button></section>
      </section>
    </main>

    <template v-else>
      <div class="workspace-titlebar"><div class="workspace-title"><span class="scenario-label" :style="{ color: scenarios[current.scenario].color }">{{ scenarios[current.scenario].name }}</span><input :value="current.title" aria-label="工作空间标题" maxlength="160" @change="commit(d => d.title = ($event.target as HTMLInputElement).value.trim(), '修改标题')" /><span class="save-status" :class="saveState"><LoaderCircle v-if="saveState === 'saving'" class="spin" :size="12" /><Check v-else-if="saveState === 'saved'" :size="12" />{{ saveState === 'saved' ? '已保存到本地' : saveState === 'saving' ? '保存中' : '保存失败' }}</span></div><div class="toolbar-actions"><button class="ol-button" @click="showHistory">历史</button><button class="ol-button" @click="exportJSON">备份</button><button class="ol-button" @click="exportMarkdown">导出</button><button class="ol-button primary" :disabled="!pathNodes.length" @click="present">{{ scenarios[current.scenario].action }}</button></div></div>
      <div v-if="activeView" class="view-switchbar"><label>视图<select :value="activeView.id" aria-label="当前视图" @change="viewId = ($event.target as HTMLSelectElement).value"><option v-for="v in current.views" :key="v.id" :value="v.id">{{ v.title }} · {{ scenarios[v.scenario].name }}</option></select></label><span class="small muted">{{ activeView.nodeIds.length }} 个对象</span><button class="text-button" @click="tab = 'views'">管理视图</button><span v-if="needsBackup" class="backup-reminder">{{ backupAt ? '距上次备份已满 7 天' : '尚未备份' }} <button class="text-button" @click="exportJSON">现在备份</button></span></div>
      <div class="workbench-body">
        <aside class="workbench-nav"><button class="back-home" @click="home"><ArrowLeft :size="14" />所有空间</button><div class="nav-group-label">工作台</div><button :class="['nav-item', { active: tab === 'map' }]" @click="tab = 'map'">关系地图<span>{{ current.nodes.length }}</span></button><button :class="['nav-item', { active: tab === 'explain' }]" @click="tab = 'explain'">图文讲解</button><button :class="['nav-item', { active: tab === 'sources' }]" @click="tab = 'sources'">资料与依据<span>{{ current.sources.length }}</span></button><button :class="['nav-item', { active: tab === 'practice' }]" @click="tab = 'practice'">{{ current.scenario === 'course' ? '练习与复习' : '理解自测' }}<span v-if="dueQuestions.length" class="due-count">{{ dueQuestions.length }}</span></button><button :class="['nav-item', { active: tab === 'archify' }]" @click="tab = 'archify'">Archify 视图</button>
          <button :class="['nav-item', { active: tab === 'architecture' }]" @click="tab = 'architecture'">请求链路与决策</button><button :class="['nav-item', { active: tab === 'product' }]" @click="tab = 'product'">产品方案与验收</button><button :class="['nav-item', { active: tab === 'views' }]" @click="tab = 'views'">多视图管理</button>
          <div class="nav-group-label object-label">对象<button class="icon-button" aria-label="添加对象" @click="addNode"><Plus :size="15" /></button></div><label class="node-search"><Search :size="13" /><input v-model="nodeSearch" placeholder="查找…" aria-label="查找对象" /></label><div class="node-list"><button v-for="node in listedNodes" :key="node.id" :class="['node-list-item', { active: selectedId === node.id }]" @click="inspectNode(node.id)">{{ node.title }}</button><p v-if="!listedNodes.length" class="muted small">暂无对象</p></div><div class="nav-bottom"><p class="small muted">保存在当前浏览器，请定期备份。</p></div>
        </aside>

        <section class="workbench-main">
          <div v-if="tab === 'map' || tab === 'explain'" class="canvas-toolbar"><div class="mode-switch"><button :class="{ active: mode === 'explore' }" @click="mode = 'explore'">探索</button><button :class="{ active: mode === 'edit' }" @click="mode = 'edit'">编辑</button></div><div v-if="tab === 'map'" class="reach-tools"><select v-model="scope" aria-label="关系追踪范围"><option value="all">全部关系</option><option value="upstream">上游</option><option value="downstream">下游</option></select></div><div class="toolbar-actions"><button class="text-button" @click="addNode">+ 对象</button><button class="text-button" :disabled="current.nodes.length < 2" @click="openRelation">+ 关系</button><button class="text-button" :disabled="!!busy || !!current.nodes.length" @click="generate">生成初稿</button><button class="text-button" :disabled="!!busy || !current.sources.length" @click="understand">理解材料</button></div></div>
          <GraphCanvas v-if="tab === 'map'" :key="activeView?.id" :nodes="viewNodes" :relations="viewRelations" :selected-id="selectedId" :highlighted="highlighted" :editable="mode === 'edit'" @select="selectedId = $event" @move="moveNode" />

          <div v-if="tab === 'explain'" class="content-scroll explainer"><h1>{{ current.title }}</h1><textarea v-if="mode === 'edit'" :value="current.summary" class="summary-input" aria-label="工作空间简介" @change="commit(d => d.summary = ($event.target as HTMLTextAreaElement).value, '修改简介')" /><p v-else class="document-summary">{{ current.summary }}</p>
            <div v-if="mode === 'present'" class="presentation-controls"><button class="ol-button" :disabled="step === 0" @click="goStep(-1)"><ArrowLeft :size="15" />上一步</button><span>{{ step + 1 }} / {{ pathNodes.length }}</span><button class="ol-button" :disabled="step >= pathNodes.length - 1" @click="goStep(1)">下一步<ArrowRight :size="15" /></button><button class="text-button" @click="mode = 'explore'">退出演示</button></div>
            <div class="explain-layout"><aside class="story-index"><span class="mini-label">{{ current.scenario === 'course' ? '学习路径' : '讲解顺序' }}</span><div v-for="(node, index) in pathNodes" :key="node.id" class="story-step"><button :class="{ active: selectedId === node.id }" @click="selectedId = node.id; step = index"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ node.title }}</button><div v-if="mode === 'edit'" class="order-tools"><button :disabled="index === 0" :aria-label="`上移 ${node.title}`" @click="movePath(index, -1)">↑</button><button :disabled="index === pathNodes.length - 1" :aria-label="`下移 ${node.title}`" @click="movePath(index, 1)">↓</button></div></div></aside><article v-if="selected" class="explain-card"><span class="object-type">{{ nodeKinds[selected.kind] }}</span><h2>{{ selected.title }}</h2><p class="prose">{{ selected.body || '还没有解释。' }}</p><div v-if="selected.example" class="example-box"><span>例子</span><p class="prose">{{ selected.example }}</p></div><div v-if="selected.pitfall" class="pitfall-box"><span>常见误区</span><p class="prose">{{ selected.pitfall }}</p></div><div v-if="selected.acceptance" class="acceptance-box"><h3>验收条件</h3><p class="prose">{{ selected.acceptance }}</p></div><button class="text-button" @click="tab = 'practice'">去练习 <ArrowRight :size="15" /></button></article><div v-else class="empty-state"><p>添加对象后开始讲解。</p></div></div>
          </div>

          <div v-if="tab === 'views' && activeView" class="content-scroll studio-page"><h1>多视图管理</h1><p class="muted">同一个对象可出现在多个视图：正文共享，布局与讲解顺序各自独立。</p><form class="studio-card studio-form" @submit.prevent="addView"><h2>新建视图</h2><div class="form-grid"><label class="form-label">视图名称<input v-model="viewTitle" required maxlength="200" placeholder="例如：登录的产品流程" /></label><label class="form-label">视角<select v-model="viewScenario"><option v-for="(info, scenario) in scenarios" :key="scenario" :value="scenario">{{ info.name }}</option></select></label></div><button class="ol-button primary">创建独立视图</button></form><div class="studio-card studio-form studio-section"><div class="section-heading"><h2>当前视图 · {{ activeView.title }}</h2><button class="text-button danger" :disabled="current.views.length < 2" @click="removeView">删除视图，保留内容</button></div><label class="form-label">修改视图名称<input :value="activeView.title" maxlength="200" @change="commit(d => { d.views.find(v => v.id === activeView!.id)!.title = ($event.target as HTMLInputElement).value }, '重命名视图')" /></label><fieldset class="node-checks"><legend>此视图显示哪些对象？</legend><label v-for="node in current.nodes" :key="node.id"><input type="checkbox" :checked="activeView.nodeIds.includes(node.id)" @change="toggleViewNode(node.id)" />{{ node.title }}</label></fieldset><p class="small muted">取消勾选只移除此视图的位置与讲解步骤，不删除对象、引用或作答。讲解顺序在“图文讲解 → 编辑”中调整。</p><button class="ol-button" @click="tab = 'map'">进入当前视图</button></div></div>
          <SourceLibrary v-if="tab === 'sources'" :workspace="current" :focus="focusedCitation" :commit="commit" @remove="removeSource" />
          <ReviewStudio v-if="tab === 'practice'" :workspace="current" :now="clock" :selected-node="selectedId" :commit="commit" @inspect="inspectNode" />
          <ArchitectureStudio v-if="tab === 'architecture'" :workspace="current" @change="commit" @locate="locateCitation" @inspect="inspectNode" />
          <ProductStudio v-if="tab === 'product'" :workspace="current" @change="commit" @locate="locateCitation" @inspect="inspectNode" />
          <div v-if="tab === 'archify'" class="archify-page"><div class="archify-toolbar"><div><h2>Archify 视图</h2><p class="muted small">由本地 Archify 服务渲染，内容仍由 OneLook 保存</p></div><div class="toolbar-actions"><button v-if="artifact" class="ol-button" @click="download(JSON.stringify(artifact.ir, null, 2), 'diagram.archify.json', 'application/json')">JSON IR</button><button v-if="artifact" class="ol-button" @click="download(artifact.html, `${current.title}.html`, 'text/html')"><Download :size="14" />交互 HTML</button><button class="ol-button primary" :disabled="!!busy || !current.nodes.length" @click="render"><Layers3 :size="15" />{{ artifact ? '重新生成' : '生成视图' }}</button></div></div><div v-if="artifact && !artifactIsCurrent" class="stale-warning">内容已更新，下方为上一次成功生成的视图。请重新生成后再导出最新版本。</div><iframe v-if="artifact" :srcdoc="artifact.html" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Archify 隔离交互视图" /><div v-else class="empty-state"><h3>还没有视图</h3><p>生成可分享的交互 HTML 和 JSON 源。{{ health?.archify ? '' : '需要本地服务与 Archify。' }}</p></div></div>
        </section>

        <aside v-if="selected && (tab === 'map' || tab === 'explain')" class="detail-panel"><div class="detail-heading"><span>详情</span><span :class="['provenance', selected.provenance]">{{ selected.provenance === 'ai' ? 'AI 生成 · 待核实' : selected.provenance === 'demo' ? '示例' : '已编辑' }}</span></div><template v-if="mode === 'edit'"><label class="form-label">标题<input :key="selected.id + '-title'" :value="selected.title" @change="updateNode('title', ($event.target as HTMLInputElement).value)" /></label><label class="form-label">对象类型<select :value="selected.kind" @change="updateNode('kind', ($event.target as HTMLSelectElement).value)"><option v-for="(name, kind) in nodeKinds" :key="kind" :value="kind">{{ name }}</option></select></label><label class="form-label">解释<textarea :key="selected.id + '-body'" :value="selected.body" rows="5" @change="updateNode('body', ($event.target as HTMLTextAreaElement).value)" /></label><label class="form-label">例子<textarea :key="selected.id + '-example'" :value="selected.example" rows="3" @change="updateNode('example', ($event.target as HTMLTextAreaElement).value)" /></label><label class="form-label">常见误区<textarea :key="selected.id + '-pitfall'" :value="selected.pitfall" rows="3" @change="updateNode('pitfall', ($event.target as HTMLTextAreaElement).value)" /></label><label v-if="current.scenario === 'product' || selected.kind === 'requirement'" class="form-label">验收条件 / 待确认项<textarea :key="selected.id + '-acceptance'" :value="selected.acceptance" rows="3" @change="updateNode('acceptance', ($event.target as HTMLTextAreaElement).value)" /></label></template><template v-else><span class="object-type">{{ nodeKinds[selected.kind] }}</span><h2>{{ selected.title }}</h2><p class="detail-body prose">{{ selected.body || '暂无解释。' }}</p><div v-if="selected.pitfall" class="detail-caution"><strong>常见误区</strong><p>{{ selected.pitfall }}</p></div></template>
          <label class="form-label detail-notes">笔记<textarea :key="selected.id + '-notes'" :value="selected.notes" rows="3" placeholder="记录自己的理解…" @change="updateNode('notes', ($event.target as HTMLTextAreaElement).value)" /></label>
          <section class="detail-section"><h3>资料依据 <span>{{ selected.citations.length }}</span></h3><EvidenceEditor :workspace="current" :value="selected.citations" :editable="mode === 'edit'" @change="updateNode('citations', $event)" @locate="locateCitation" /></section>
          <section class="detail-section"><h3>关联关系</h3><div v-for="relation in current.relations.filter(r => r.from === selectedId || r.to === selectedId)" :key="relation.id" class="relation-row"><button @click="selectedId = relation.from === selectedId ? relation.to : relation.from"><span>{{ relationKinds[relation.kind] }} · {{ relation.from === selectedId ? '→' : '←' }}</span>{{ nodeTitle(relation.from === selectedId ? relation.to : relation.from) }}</button><button v-if="mode === 'edit'" class="icon-button" aria-label="删除关系" @click="commit(d => d.relations = d.relations.filter(r => r.id !== relation.id), '删除关系')"><X :size="13" /></button></div></section>
          <section class="detail-section ai-section"><h3>向 AI 追问此对象</h3><textarea v-model="aiQuestion" aria-label="局部追问" rows="3" /><button class="ol-button" :disabled="!!busy" @click="askAI">生成建议</button><div v-if="aiDraft" class="ai-draft"><span class="mini-label">预览 · 尚未替换</span><p class="prose">{{ aiDraft.body }}</p><p class="small muted">采用后清除旧引用关联，原文保留在历史中。</p><div class="toolbar-actions"><button class="ol-button primary" @click="acceptExplanation">采用解释</button><button class="text-button" @click="aiDraft = undefined">放弃</button></div></div></section><button v-if="mode === 'edit'" class="text-button danger remove-object" @click="removeNode"><Trash2 :size="14" />删除对象</button>
        </aside>
      </div>
    </template>

    <div v-if="importPreview" class="modal-backdrop"><section class="ol-modal" role="dialog" aria-modal="true" aria-label="导入预检"><h2>导入预检</h2><p>目标：<strong>{{ importPreview.title }}</strong></p><dl class="import-summary"><dt>格式</dt><dd>V2（V1 文件已在内存中转换）</dd><dt>对象 / 视图</dt><dd>{{ importPreview.nodes.length }} / {{ importPreview.views.length }}</dd><dt>资料 / 作答</dt><dd>{{ importPreview.sources.length }} / {{ importPreview.attempts.length }}</dd><dt>请求链路 / 产品记录</dt><dd>{{ importPreview.flows.length }} / {{ importPreview.productItems.length }}</dd></dl><p class="privacy-box">创建独立副本，不覆盖现有空间，不导入密钥。</p><div class="toolbar-actions"><button class="ol-button primary" @click="confirmImport">确认导入</button><button class="text-button" @click="importPreview = undefined">取消</button></div></section></div>
    <div v-if="modal" class="modal-backdrop" @click.self="!busy && (modal = '')"><section class="ol-modal" :class="{ wide: modal === 'generate' || modal === 'history' }" role="dialog" aria-modal="true" :aria-label="modal === 'new' ? '新建工作空间' : modal === 'settings' ? 'AI 设置' : '工作空间操作'" @keydown.esc="!busy && (modal = '')"><button class="modal-close icon-button" aria-label="关闭弹窗" @click="modal = ''"><X :size="19" /></button>
      <template v-if="modal === 'new'"><h2>新建工作空间</h2><form @submit.prevent="create"><label class="form-label">场景<select v-model="newScenario"><option v-for="(info, scenario) in scenarios" :key="scenario" :value="scenario">{{ info.name }}</option></select></label><label class="form-label">空间名称<input v-model="newTitle" required maxlength="160" placeholder="例如：理解项目的认证架构" autofocus /></label><label class="form-label">初始资料（可选）<textarea v-model="newMaterial" rows="6" placeholder="粘贴需求、技术说明或讲义摘录。不会自动发送给 AI。" /></label><button type="button" class="text-button" @click="materialInput?.click()">导入 TXT / Markdown</button><div class="modal-footer"><span class="small muted">AI 操作前会征求发送授权。</span><button class="ol-button primary" :disabled="!newTitle.trim()">创建工作空间 <ArrowRight :size="15" /></button></div></form></template>
      <template v-if="modal === 'settings'"><h2>AI 设置</h2><p class="modal-intro muted">可选；不配置也能编辑、练习和导出。</p><label class="form-label">OpenAI 兼容 API 地址<input v-model="settings.baseUrl" placeholder="https://api.openai.com/v1" /></label><label class="form-label">模型<input v-model="settings.model" placeholder="gpt-4o-mini" /></label><label class="form-label">API Key · 只在内存中<input v-model="settings.apiKey" type="password" autocomplete="off" placeholder="刷新页面后需要重新输入" /></label><div class="privacy-box"><strong>请求会发送什么？</strong><p>生成初稿发送空间的标题、场景与资料；追问发送当前对象、关联上下文与资料。密钥经本地服务转发，不进入备份或浏览器存储。</p><p>允许的域名：{{ health?.aiHosts?.join('、') || 'api.openai.com（其他域名需在服务端配置）' }}。</p></div><label class="consent"><input v-model="aiConsent" type="checkbox" /><span>我同意点击 AI 操作时把相关内容发送给上述提供商。</span></label><div class="modal-footer"><button class="text-button" @click="cancelRequest(); settings.apiKey = ''; aiConsent = false">清除密钥</button><button class="ol-button primary" @click="modal = ''; error = ''">完成</button></div></template>
      <template v-if="modal === 'relation' && current"><h2>添加关系</h2><form @submit.prevent="addRelation"><label class="form-label">起点<select v-model="relationFrom"><option v-for="n in current.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label><label class="form-label">关系类型<select v-model="relationKind"><option v-for="(name, kind) in relationKinds" :key="kind" :value="kind">{{ name }}</option></select></label><label class="form-label">终点<select v-model="relationTo"><option v-for="n in current.nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label><label class="form-label">连线说明<input v-model="relationLabel" placeholder="例如：提交认证请求" /></label><p class="small muted">先修关系不能成环；起点应位于学习路径中终点之前。其他关系可以形成有意义的循环。</p><div class="modal-footer"><span /><button class="ol-button primary">添加关系</button></div></form></template>
      <template v-if="modal === 'history'"><h2>版本历史</h2><p class="modal-intro muted">保留最近 20 次变更前的内容；恢复不回滚仍有效的学习记录。 <button class="text-button" @click="exportMigrationBackup">导出迁移前备份</button></p><div v-if="!revisions.length" class="empty-state">暂无可恢复的版本。</div><div v-for="revision in revisions" :key="revision.id" class="revision-row"><div><strong>{{ revision.label }}</strong><p>{{ formatDate(revision.createdAt) }} · {{ revision.snapshot.nodes.length }} 个对象</p></div><button class="ol-button" @click="restore(revision)">恢复此版本</button></div></template>
      <template v-if="modal === 'understand' && understanding"><h2>材料理解报告 · {{ documentTypes[understanding.documentType] }}</h2><p class="modal-intro">{{ understanding.summary }}</p>
        <section class="understanding-section"><h3>覆盖范围</h3><p class="small muted">分析了 {{ understanding.coverage.analyzedSourceIds.length }} 份资料{{ understanding.coverage.skippedSourceIds.length ? `，未能利用 ${understanding.coverage.skippedSourceIds.length} 份` : '' }}。</p><ul v-if="understanding.coverage.omissions.length" class="gap-list"><li v-for="(item, i) in understanding.coverage.omissions" :key="i">{{ item }}</li></ul></section>
        <section class="understanding-section"><h3>实体（{{ understanding.entities.length }}）</h3><div class="generated-list"><article v-for="entity in understanding.entities" :key="entity.id"><span>{{ nodeKinds[entity.kind] }}</span><h3>{{ entity.title }}<span :class="['certainty-chip', entity.certainty]">{{ certaintyKinds[entity.certainty] }}</span></h3><p>{{ entity.description }}</p><div v-if="entity.citations.length" class="citation-chips"><button v-for="citation in entity.citations" :key="`${citation.sourceId}-${citation.start}`" class="citation-chip" @click="locateCitation(citation); modal = ''">{{ current?.sources.find(s => s.id === citation.sourceId)?.title ?? citation.sourceId }} · v{{ citation.version }}</button></div></article></div></section>
        <section v-if="understanding.relations.length" class="understanding-section"><h3>关系（{{ understanding.relations.length }}）</h3><ul class="gap-list"><li v-for="relation in understanding.relations" :key="relation.id">{{ entityTitle(understanding, relation.from) }} → {{ entityTitle(understanding, relation.to) }} · {{ relationKinds[relation.semantic] }}{{ relation.label ? `：${relation.label}` : '' }}<span :class="['certainty-chip', relation.certainty]">{{ certaintyKinds[relation.certainty] }}</span></li></ul></section>
        <section v-if="understanding.suggestedViews.length" class="understanding-section"><h3>建议视图</h3><ul class="gap-list"><li v-for="(view, i) in understanding.suggestedViews" :key="i">{{ scenarios[view.scenario].name }} · {{ view.title }}{{ view.reason ? ` — ${view.reason}` : '' }}</li></ul></section>
        <section v-if="understanding.gaps.length" class="understanding-section"><h3>材料未回答的问题</h3><ul class="gap-list"><li v-for="(gap, i) in understanding.gaps" :key="i">{{ gap }}</li></ul></section>
        <p class="small muted">报告不写入空间；确认后再生成逻辑图。</p>
        <div class="modal-footer"><button class="text-button" @click="modal = ''">关闭报告</button><button v-if="!current?.nodes.length" class="ol-button primary" :disabled="!!busy" @click="modal = ''; generate()">据此生成逻辑图</button></div></template>
      <template v-if="modal === 'generate' && generated"><h2>初稿预览</h2><p class="modal-intro">{{ generated.summary }}</p><div class="generated-list"><article v-for="node in generated.nodes" :key="node.id"><span>{{ nodeKinds[node.kind] }}</span><h3>{{ node.title }}</h3><p>{{ node.body }}</p></article></div><p class="small muted">{{ generated.relations.length }} 条关系 · {{ generated.questions.length }} 个练习。生成内容需人工核实。</p><div class="modal-footer"><button class="text-button" @click="generated = undefined; modal = ''">放弃</button><button class="ol-button primary" @click="acceptGenerated">采用这份初稿</button></div></template>
      <template v-if="modal === 'help'"><h2>帮助</h2><div class="help-content"><h3>从资料或示例开始</h3><p>新建架构、产品或课程空间；示例仅作教学。</p><h3>编辑与探索</h3><p>地图中查看关系，编辑模式下修改对象、连线与布局；讲解页可调整顺序。</p><h3>练习与复习</h3><p>先独立作答再核对参考答案。"还需回顾" 10 分钟后到期，"自评理解"按 1、3、7、14、30 天递增，不生成掌握率。</p><h3>备份与导出</h3><p>JSON 备份含资料、对象与学习记录；Markdown 用于文档交流；Archify 可生成交互 HTML。清除浏览器数据会丢失内容，请定期备份。</p><h3>经典导图</h3><p>右上角进入原编辑器，数据与导入导出保持独立。</p></div></template>
    </section></div>
  </div>
</template>
