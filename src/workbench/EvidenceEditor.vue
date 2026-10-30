<script setup lang="ts">
import { computed, ref } from 'vue'
import { citationLocation, citeSource } from './evidence'
import type { Citation, Workspace } from './types'

const props = withDefaults(defineProps<{ workspace: Workspace; value: Citation[]; editable?: boolean }>(), { editable: true })
const emit = defineEmits<{ change: [citations: Citation[]]; locate: [citation: Citation] }>()
const sourceId = ref(''), quote = ref(''), error = ref(''), offset = ref(0)
const source = computed(() => props.workspace.sources.find(item => item.id === sourceId.value))
const matches = computed(() => {
  const found: number[] = []
  if (!source.value || !quote.value.trim()) return found
  let start = source.value.text.indexOf(quote.value)
  while (start >= 0 && found.length < 100) { found.push(start); start = source.value.text.indexOf(quote.value, start + 1) }
  return found
})
function add() {
  try {
    if (!source.value) throw new Error('请选择资料。')
    emit('change', [...props.value, citeSource(source.value, quote.value, matches.value[offset.value] ?? -1)])
    quote.value = ''; offset.value = 0; error.value = ''
  } catch (e) { error.value = (e as Error).message }
}
</script>

<template>
  <div class="evidence-editor">
    <p v-if="!value.length" class="muted small">尚无原文依据，结论待核实。</p>
    <article v-for="(citation, index) in value" :key="`${citation.sourceId}-${citation.version}-${index}`" class="citation">
      <template v-for="item in workspace.sources.filter(s => s.id === citation.sourceId)" :key="item.id">
        <button class="text-button citation-jump" @click="emit('locate', citation)">{{ citationLocation(item, citation) }} ↗</button>
        <span v-if="item.version !== citation.version" class="status-chip warning">资料已更新 · 待重新核对</span>
        <blockquote>{{ citation.quote }}</blockquote>
        <div v-if="editable" class="toolbar-actions">
          <button v-if="item.version !== citation.version && item.text.includes(citation.quote)" class="text-button" @click="emit('change', value.map((c, i) => i === index ? citeSource(item, c.quote) : c))">已人工核对，关联当前版本（首个匹配）</button>
          <button class="text-button danger" @click="emit('change', value.filter((_, i) => i !== index))">移除引用</button>
        </div>
      </template>
    </article>
    <details v-if="editable && workspace.sources.length" class="citation-editor">
      <summary>关联精确原文</summary>
      <label class="form-label">引用来源<select v-model="sourceId" @change="offset = 0"><option value="">选择资料</option><option v-for="s in workspace.sources" :key="s.id" :value="s.id">{{ s.title }} · v{{ s.version }}</option></select></label>
      <label class="form-label">连续原文<textarea v-model="quote" rows="3" placeholder="粘贴原文，保留换行和空格" @input="offset = 0" /></label>
      <label v-if="matches.length > 1" class="form-label">同文位置<select v-model="offset"><option v-for="(start, index) in matches" :key="start" :value="index">第 {{ source!.text.slice(0, start).split('\n').length }} 行 · 字符 {{ start + 1 }}</option></select></label>
      <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
      <button class="ol-button" :disabled="!matches.length" @click="add">保存引用</button>
    </details>
  </div>
</template>
