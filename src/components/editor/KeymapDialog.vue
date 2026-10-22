<template>
  <Teleport to="body">
    <div class="keymap-overlay" @click.self="$emit('close')">
      <div class="keymap-dialog">
        <div class="keymap-header">
          <h3>快捷键映射</h3>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="keymap-body">
          <p class="keymap-note">
            布局模式＝未聚焦节点（序列键：前缀 + 键）；节点模式＝已聚焦节点。
            点击绑定后按下新按键完成重绑。
          </p>

          <div v-for="mode in (['layout', 'node'] as KeymapMode[])" :key="mode" class="keymap-section">
            <div class="section-title">{{ mode === 'layout' ? '布局模式' : '节点模式' }}</div>
            <div
              v-for="action in actionsOf(mode)"
              :key="action.id"
              class="keymap-row"
            >
              <span class="action-label">{{ action.label }}</span>
              <button
                class="binding-btn"
                :class="{ capturing: capturingId === action.id, modified: isModified(action.id) }"
                @click="startCapture(action)"
              >
                <template v-if="capturingId === action.id">
                  {{ captureBuffer.length ? formatSequence(captureBuffer) + ' …' : '按下新按键…' }}
                </template>
                <template v-else>
                  {{ formatSequence(keymapOf(action.id)) }}
                </template>
              </button>
              <button
                v-if="isModified(action.id)"
                class="reset-btn"
                title="恢复默认"
                @click="resetOne(action.id)"
              >↺</button>
            </div>
          </div>
        </div>

        <div class="keymap-footer">
          <span v-if="conflictMessage" class="conflict">{{ conflictMessage }}</span>
          <span v-else-if="savedHint" class="saved">{{ savedHint }}</span>
          <span v-else style="flex:1"></span>
          <button class="reset-all-btn" @click="resetAll">全部恢复默认</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  KEYMAP_ACTIONS, keymapOf, setKeymap, resetKeymap, resetAllKeymaps,
  keyToken, formatSequence, type KeymapMode, type KeymapActionDef,
} from '@/services/keymap'

defineEmits<{ close: [] }>()

const capturingId = ref<string | null>(null)
const captureBuffer = ref<string[]>([])
const conflictMessage = ref('')
const savedHint = ref('')

function actionsOf(mode: KeymapMode): KeymapActionDef[] {
  return KEYMAP_ACTIONS.filter(a => a.mode === mode)
}

function isModified(actionId: string): boolean {
  const def = KEYMAP_ACTIONS.find(a => a.id === actionId)
  if (!def) return false
  return keymapOf(actionId).join(' ') !== def.defaultSequence.join(' ')
}

function startCapture(action: KeymapActionDef) {
  conflictMessage.value = ''
  savedHint.value = ''
  capturingId.value = action.id
  captureBuffer.value = []
}

function resetOne(actionId: string) {
  resetKeymap(actionId)
  conflictMessage.value = ''
  savedHint.value = '已恢复默认'
}

function resetAll() {
  resetAllKeymaps()
  conflictMessage.value = ''
  savedHint.value = '已全部恢复默认'
}

function onCaptureKeydown(event: KeyboardEvent) {
  if (!capturingId.value) return
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    capturingId.value = null
    captureBuffer.value = []
    return
  }

  const token = keyToken(event)
  if (!token) return // 修饰键单独按下

  const action = KEYMAP_ACTIONS.find(a => a.id === capturingId.value)
  if (!action) return

  captureBuffer.value = [...captureBuffer.value, token]

  if (captureBuffer.value.length >= action.defaultSequence.length) {
    const conflict = setKeymap(action.id, captureBuffer.value)
    if (conflict) {
      conflictMessage.value = conflict
    } else {
      savedHint.value = `「${action.label}」已绑定为 ${formatSequence(captureBuffer.value)}`
    }
    capturingId.value = null
    captureBuffer.value = []
  }
}

onMounted(() => {
  window.addEventListener('keydown', onCaptureKeydown, { capture: true })
})
onUnmounted(() => {
  window.removeEventListener('keydown', onCaptureKeydown, { capture: true } as EventListenerOptions)
})
</script>

<style scoped>
.keymap-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.keymap-dialog {
  width: min(480px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.keymap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.keymap-header h3 {
  margin: 0;
  font-size: 15px;
}

.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.keymap-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.keymap-note {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.keymap-section {
  margin-bottom: 14px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 6px;
}

.keymap-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}

.action-label {
  flex: 1;
  font-size: 13px;
}

.binding-btn {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 10px;
  min-width: 110px;
  cursor: pointer;
  font-family: 'SF Mono', Menlo, monospace;
}

.binding-btn:hover {
  border-color: var(--color-primary);
}

.binding-btn.modified {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.binding-btn.capturing {
  border-color: var(--color-primary);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  50% { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
}

.reset-btn {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 6px;
}

.reset-btn:hover {
  color: var(--color-primary);
}

.keymap-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
  font-size: 12px;
}

.conflict {
  color: #dc2626;
}

.saved {
  color: #16a34a;
}

.reset-all-btn {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

.reset-all-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>
