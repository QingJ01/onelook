<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import Workbench from './workbench/Workbench.vue'
const classic = new URLSearchParams(window.location.search).get('editor') === 'classic'
const LegacyEditor = defineAsyncComponent(() => import('./LegacyEditor.vue'))
</script>

<template>
  <div v-if="classic" class="classic-shell"><div class="classic-return"><a href="/">← 返回 OneLook 工作台</a><span>经典导图 · 原有文档独立保留</span></div><div class="classic-content"><LegacyEditor /></div></div>
  <Workbench v-else />
</template>

<style>
.classic-shell { height: 100%; display: flex; flex-direction: column; }
.classic-return { height: 32px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; font-size: 12px; background: #252b43; color: #dce0f0; }
.classic-return a { color: #fff; text-decoration: none; }
.classic-content { flex: 1; min-height: 0; }
</style>
