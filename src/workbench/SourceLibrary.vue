<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { makeSource, replaceSource, sourceVersion, citationLocation } from './evidence'
import { readMaterialFile } from './materials'
import type { Citation, Workspace } from './types'

const props = defineProps<{ workspace: Workspace; focus?: Citation; commit: (update: (doc: Workspace) => void, label: string) => boolean }>()
const emit = defineEmits<{ remove: [id: string] }>()
const selectedId = ref(''), version = ref(0), editing = ref(false), creating = ref(false)
const title = ref(''), text = ref(''), url = ref(''), filePath = ref(''), revision = ref(''), error = ref(''), reading = ref(false)
const input = ref<HTMLInputElement>(), highlight = ref<HTMLElement>()
const selected = computed(() => props.workspace.sources.find(s => s.id === selectedId.value) ?? props.workspace.sources[0])
const snapshot = computed(() => selected.value ? sourceVersion(selected.value, version.value || selected.value.version) : undefined)
const activeQuote = computed(() => props.focus?.sourceId === selected.value?.id && props.focus.version === snapshot.value?.version ? props.focus : undefined)
watch(() => props.workspace.sources.map(s => s.id).join('|'), () => {
  if (selectedId.value && !props.workspace.sources.some(s => s.id === selectedId.value)) {
    selectedId.value = ''; version.value = 0; editing.value = false; creating.value = false
  }
})
watch(() => props.focus, async citation => {
  if (!citation) return
  selectedId.value = citation.sourceId; version.value = citation.version; editing.value = false; creating.value = false
  await nextTick(); highlight.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}, { immediate: true })
function select(id: string) { selectedId.value = id; version.value = 0; editing.value = false; creating.value = false }
function edit(isNew = false) {
  creating.value = isNew; editing.value = true; error.value = ''
  const source = isNew ? undefined : selected.value
  title.value = source?.title ?? ''; text.value = source?.text ?? ''; url.value = source?.url ?? ''
  filePath.value = source?.filePath ?? ''; revision.value = source?.revision ?? ''
}
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  reading.value = true; error.value = ''
  try { const material = await readMaterialFile(file); text.value = material.text; filePath.value = material.filePath ?? ''; if (!title.value) title.value = file.name }
  catch (e) { error.value = (e as Error).message }
  finally { reading.value = false; (event.target as HTMLInputElement).value = '' }
}
function save() {
  if (!title.value.trim() || !text.value.trim()) return
  try {
    const metadata = { filePath: filePath.value.trim() || undefined, revision: revision.value.trim() || undefined }
    const source = creating.value ? makeSource(title.value.trim(), text.value, metadata) : replaceSource(selected.value!, text.value, metadata)
    source.title = title.value.trim()
    if (url.value.trim()) {
      const parsed = new URL(url.value.trim())
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('来源链接必须为无凭据的 HTTP / HTTPS 地址。')
      source.url = parsed.href
    } else delete source.url
    if (!props.commit(doc => { const i = doc.sources.findIndex(s => s.id === source.id); if (i < 0) doc.sources.push(source); else doc.sources[i] = source }, creating.value ? '添加资料' : '更新资料版本')) return
    selectedId.value = source.id; version.value = 0; editing.value = false; creating.value = false
  } catch (e) { error.value = (e as Error).message }
}
</script>

<template>
  <div class="content-scroll sources-page">
    <div class="section-heading"><div><div class="document-eyebrow">EVIDENCE LIBRARY</div><h1>资料与依据</h1><p>原文、版本与位置一起保留。资料更新不会把旧引用冒充为新证据。</p></div><button class="ol-button primary" @click="edit(true)">添加资料</button></div>
    <div class="source-layout">
      <nav class="source-index" aria-label="资料目录"><button v-for="item in workspace.sources" :key="item.id" :class="{ active: selected?.id === item.id }" @click="select(item.id)"><strong>{{ item.title }}</strong><span>v{{ item.version }} · {{ item.versions.length }} 个旧版本</span></button></nav>
      <section class="source-document">
        <form v-if="editing" class="studio-form" @submit.prevent="save">
          <h2>{{ creating ? '新资料' : '保存为新版本' }}</h2>
          <p class="muted small">文件仅在浏览器读取，不自动上传。支持文本 PDF、TXT / Markdown 和所选源码文件；不含 OCR、整仓分析。路径和提交标记由你确认，不代表已验证运行行为。</p>
          <input ref="input" type="file" hidden @change="importFile" />
          <button class="ol-button" type="button" :disabled="reading" @click="input?.click()">{{ reading ? '正在提取文本…' : '选择 PDF / 文本 / 源码文件' }}</button>
          <label class="form-label">资料标题<input v-model="title" required maxlength="200" /></label>
          <label class="form-label">来源网址（可选）<input v-model="url" type="url" /></label>
          <div class="form-grid"><label class="form-label">文件相对路径<input v-model="filePath" placeholder="src/auth.ts" /></label><label class="form-label">版本 / Git 提交标记<input v-model="revision" placeholder="由你填写并核对" /></label></div>
          <label class="form-label">原文<textarea v-model="text" required rows="16" maxlength="300000" spellcheck="false" /></label>
          <p v-if="!creating" class="privacy-box">当前原文会作为历史版本保留。已有引用标记为待核对，仍可跳回当时的准确原文。</p>
          <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
          <div class="toolbar-actions"><button class="ol-button primary" :disabled="reading">保存资料</button><button class="text-button" type="button" @click="editing = false; creating = false">取消</button></div>
        </form>
        <template v-else-if="selected && snapshot">
          <div class="section-heading"><div><h2>{{ selected.title }}</h2><p class="small muted">{{ snapshot.filePath || '文本材料' }}{{ snapshot.revision ? ` · ${snapshot.revision}` : '' }}</p></div><div class="toolbar-actions"><button class="ol-button" @click="edit()">更新原文</button><button class="text-button danger" @click="emit('remove', selected.id)">删除资料</button></div></div>
          <label class="form-label">查看版本<select v-model="version"><option :value="0">v{{ selected.version }} · 当前原文</option><option v-for="old in [...selected.versions].reverse()" :key="old.version" :value="old.version">v{{ old.version }} · {{ new Date(old.createdAt).toLocaleString('zh-CN') }}</option></select></label>
          <p v-if="snapshot.version !== selected.version" class="privacy-box">正在查看历史原文，不代表当前资料仍支持这个结论。</p>
          <a v-if="selected.url" :href="selected.url" target="_blank" rel="noopener noreferrer">打开来源网址 ↗</a>
          <p v-if="activeQuote" class="status-chip">已定位：{{ citationLocation(selected, activeQuote) }}</p>
          <pre class="source-original"><template v-if="activeQuote">{{ snapshot.text.slice(0, activeQuote.start) }}<mark ref="highlight">{{ snapshot.text.slice(activeQuote.start, activeQuote.end) }}</mark>{{ snapshot.text.slice(activeQuote.end) }}</template><template v-else>{{ snapshot.text }}</template></pre>
        </template>
        <div v-else class="empty-state"><h3>把理解建立在材料上</h3><p>导入文本、PDF 或精选源码，再将结论关联到原文位置。</p><button class="ol-button" @click="edit(true)">添加第一份资料</button></div>
      </section>
    </div>
  </div>
</template>
