/**
 * 可变快捷键映射表
 *
 * 三个键盘层：
 * - layout 布局模式：未聚焦节点时的序列键（前缀 + 键，如 t+Enter）
 * - node   节点模式：聚焦节点后的单键/组合键（Tab、Enter、F2…）
 * - editing 编辑模式：节点编辑器内部按键（v1 固定，不参与重绑定）
 *
 * 绑定持久化在 localStorage（onelook:keymaps），覆盖默认值；
 * 键 token 规范：单字符小写、Enter/Tab/Escape/Backspace/Delete/
 * F1-F12/Arrow*、组合键 Ctrl+<token>。
 */

export type KeymapMode = 'layout' | 'node'

export interface KeymapActionDef {
    id: string
    mode: KeymapMode
    label: string
    defaultSequence: string[]
    /** 等效别名（不可重绑定；如 Backspace 等效 Delete） */
    aliases?: string[][]
}

export const KEYMAP_ACTIONS: KeymapActionDef[] = [
    // ---------- 布局模式（未聚焦节点）----------
    { id: 'layout:table-sibling', mode: 'layout', label: '插入表格（并列）', defaultSequence: ['t', 'Enter'] },
    { id: 'layout:table-child', mode: 'layout', label: '插入表格（子级）', defaultSequence: ['t', 'Tab'] },
    { id: 'layout:code-sibling', mode: 'layout', label: '插入代码块（并列）', defaultSequence: ['c', 'Enter'] },
    { id: 'layout:code-child', mode: 'layout', label: '插入代码块（子级）', defaultSequence: ['c', 'Tab'] },

    // ---------- 节点模式（已聚焦节点）----------
    { id: 'node:add-child', mode: 'node', label: '添加子节点', defaultSequence: ['Tab'] },
    { id: 'node:add-sibling', mode: 'node', label: '添加同级节点', defaultSequence: ['Enter'] },
    { id: 'node:edit', mode: 'node', label: '编辑节点', defaultSequence: ['F2'], aliases: [[' ']] },
    { id: 'node:delete', mode: 'node', label: '删除节点', defaultSequence: ['Delete'], aliases: [['Backspace']] },
    { id: 'node:undo', mode: 'node', label: '撤销', defaultSequence: ['Ctrl+z'] },
    { id: 'node:redo', mode: 'node', label: '重做', defaultSequence: ['Ctrl+y'], aliases: [['Ctrl+Shift+z']] },
    { id: 'node:copy', mode: 'node', label: '复制节点', defaultSequence: ['Ctrl+c'] },
    { id: 'node:paste', mode: 'node', label: '粘贴节点', defaultSequence: ['Ctrl+v'] },
    { id: 'node:nav-parent', mode: 'node', label: '聚焦父节点', defaultSequence: ['ArrowLeft'] },
    { id: 'node:nav-child', mode: 'node', label: '聚焦子节点', defaultSequence: ['ArrowRight'] },
    { id: 'node:nav-prev', mode: 'node', label: '聚焦上一同级', defaultSequence: ['ArrowUp'] },
    { id: 'node:nav-next', mode: 'node', label: '聚焦下一同级', defaultSequence: ['ArrowDown'] },
]

const STORAGE_KEY = 'onelook:keymaps'

function loadOverrides(): Record<string, string[]> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
        return {}
    }
}

const overrides = loadOverrides()

function saveOverrides() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function resolvedKeymaps(): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const action of KEYMAP_ACTIONS) {
        result[action.id] = overrides[action.id] ?? action.defaultSequence
    }
    return result
}

export function keymapOf(actionId: string): string[] {
    const def = KEYMAP_ACTIONS.find(a => a.id === actionId)
    if (!def) return []
    return overrides[actionId] ?? def.defaultSequence
}

/** 设置绑定；与同模式其它动作冲突时返回冲突方 label，不写入 */
export function setKeymap(actionId: string, sequence: string[]): string | null {
    const def = KEYMAP_ACTIONS.find(a => a.id === actionId)
    if (!def) return '未知动作'
    const token = sequence.join(' ')
    for (const other of KEYMAP_ACTIONS) {
        if (other.mode !== def.mode || other.id === actionId) continue
        const otherSeq = overrides[other.id] ?? other.defaultSequence
        if (otherSeq.join(' ') === token) {
            return `与「${other.label}」冲突`
        }
    }
    overrides[actionId] = [...sequence]
    saveOverrides()
    return null
}

export function resetKeymap(actionId: string) {
    delete overrides[actionId]
    saveOverrides()
}

export function resetAllKeymaps() {
    for (const key of Object.keys(overrides)) delete overrides[key]
    saveOverrides()
}

export function hasOverrides(): boolean {
    return Object.keys(overrides).length > 0
}

// ---------- 键 token 规范化 ----------

export function keyToken(event: KeyboardEvent): string | null {
    if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Shift' || event.key === 'Alt') {
        return null // 修饰键单独按下不产生 token
    }
    let key = event.key
    if (key.length === 1) key = key.toLowerCase()
    if (event.ctrlKey || event.metaKey) return `Ctrl+${key}`
    return key
}

export function formatSequence(sequence: string[]): string {
    return sequence.map(t => t.replace('Ctrl+', '⌃').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓')).join(' ')
}

/**
 * 序列匹配器：逐 key 消费前缀，返回匹配到的 actionId（完成）、
 * 'pending'（是某序列前缀）或 null（无匹配）。
 */
export interface SequenceMatcher {
    /** mode 内全部（含别名）展开后的序列表 */
    entries: Array<{ actionId: string; sequence: string[] }>
}

export function buildMatcher(mode: KeymapMode): SequenceMatcher {
    const entries: Array<{ actionId: string; sequence: string[] }> = []
    for (const action of KEYMAP_ACTIONS) {
        if (action.mode !== mode) continue
        entries.push({ actionId: action.id, sequence: keymapOf(action.id) })
        for (const alias of action.aliases ?? []) {
            entries.push({ actionId: action.id, sequence: alias })
        }
    }
    return { entries }
}

export function matchSequence(
    matcher: SequenceMatcher,
    pressed: string[],
): { actionId: string } | { pending: true } | null {
    let pending = false
    for (const entry of matcher.entries) {
        if (entry.sequence.length < pressed.length) continue
        const prefix = entry.sequence.slice(0, pressed.length)
        if (prefix.join(' ') !== pressed.join(' ')) continue
        if (entry.sequence.length === pressed.length) return { actionId: entry.actionId }
        pending = true
    }
    return pending ? { pending: true } : null
}

/** 某前缀下可用的后续提示：[{ key, label }] */
export function sequenceHints(matcher: SequenceMatcher, pressed: string[]): Array<{ key: string; label: string }> {
    const labelOf = (actionId: string) => KEYMAP_ACTIONS.find(a => a.id === actionId)?.label ?? actionId
    const out: Array<{ key: string; label: string }> = []
    for (const entry of matcher.entries) {
        if (entry.sequence.length !== pressed.length + 1) continue
        if (entry.sequence.slice(0, pressed.length).join(' ') !== pressed.join(' ')) continue
        const key = entry.sequence[pressed.length]
        if (!out.some(o => o.key === key)) out.push({ key, label: labelOf(entry.actionId) })
    }
    return out
}
