<script setup lang="ts">
import { computed } from 'vue'
import { matrixFor } from './player'
import type { KnowledgeNode } from './types'

const props = defineProps<{ nodes: KnowledgeNode[]; selectedId: string; state?: { visible: string[]; focus: string[] }; playing?: boolean }>()
const emit = defineEmits<{ select: [id: string] }>()
const matrix = computed(() => matrixFor(props.nodes))
const shown = (id: string) => !props.state || props.state.visible.includes(id)
</script>

<template>
  <div class="matrix-scroll" role="region" aria-label="对比表" tabindex="0">
    <p v-if="!nodes.length" class="graph-empty">还没有对象。添加一个，或从资料生成。</p>
    <table v-else class="matrix-table">
      <thead><tr><th scope="col">对象</th><th v-for="column in matrix.columns" :key="column" scope="col">{{ column }}</th></tr></thead>
      <TransitionGroup tag="tbody" name="matrix-row">
        <template v-for="row in matrix.rows" :key="row.id">
          <tr v-if="shown(row.id) || !playing" :class="{ 'is-ghost': !shown(row.id), 'is-focus': state?.focus.includes(row.id), selected: selectedId === row.id }" :data-node="row.id">
            <th scope="row"><button class="text-button" @click="emit('select', row.id)">{{ row.title }}</button></th>
            <td v-for="(cell, index) in row.cells" :key="index">{{ cell }}</td>
          </tr>
        </template>
      </TransitionGroup>
    </table>
    <p v-if="nodes.length && !matrix.columns.length" class="small muted">这些对象还没有可对比的说明、例子或误区。</p>
  </div>
</template>
