import { limits } from '../../shared/validation.mjs'
import { validateWorkspace } from './model'
import type { KnowledgeNode, Relation, StoryStep, Workspace } from './types'

interface ClassicNode { text?: unknown; children?: unknown; data?: { note?: unknown } }

export function isClassicMap(value: unknown): boolean {
  const doc = (value as { document?: unknown })?.document ?? value
  const root = (doc as { root?: ClassicNode })?.root
  return !!root && typeof root === 'object' && Array.isArray(root.children) && (value as { schemaVersion?: unknown })?.schemaVersion === undefined
}

/** One-way import of a classic mind map file. The classic editor and its database are not touched. */
export function importClassicMap(value: unknown): Workspace {
  if (!isClassicMap(value)) throw new TypeError('这不是经典导图文件。')
  const doc = ((value as { document?: unknown }).document ?? value) as { name?: unknown; root: ClassicNode }
  const nodes: KnowledgeNode[] = []
  const relations: Relation[] = []
  const story: StoryStep[] = []
  const stageId = 'classic-view'
  const depthOf = new Map<string, number>()
  const clean = (text: unknown) => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '').slice(0, 200) || '未命名'
  const walk = (item: ClassicNode, parent: string | undefined, depth: number): string => {
    if (depth > 50) throw new TypeError('经典导图层级超过 50 层，无法导入。')
    if (nodes.length >= limits.nodes) throw new TypeError(`经典导图超过 ${limits.nodes} 个节点，无法导入。`)
    const id = `classic-${nodes.length + 1}`
    depthOf.set(id, depth)
    const note = typeof item.data?.note === 'string' ? item.data.note.slice(0, 20000) : ''
    nodes.push({ id, title: clean(item.text), kind: 'concept', body: note, example: '', pitfall: '', notes: '', acceptance: '', citations: [], provenance: 'user', certainty: 'unverified' })
    if (parent) relations.push({ id: `classic-edge-${relations.length + 1}`, from: id, to: parent, kind: 'partOf', label: '组成' })
    const children = Array.isArray(item.children) ? item.children.filter((child): child is ClassicNode => !!child && typeof child === 'object') : []
    const childIds = children.map(child => walk(child, id, depth + 1))
    if (!parent || childIds.length) {
      story.push({ id: `classic-step-${id}`, title: nodes.find(node => node.id === id)!.title, narration: '', stageId, reveal: parent ? childIds : [id, ...childIds], focus: [id], citations: [], provenance: 'user' })
    }
    return id
  }
  walk(doc.root, undefined, 0)
  // Steps were collected bottom-up; replay them top-down so nothing is pointed at before it appears.
  const order = new Map(nodes.map((node, index) => [node.id, index]))
  story.sort((a, b) => depthOf.get(a.focus[0]!)! - depthOf.get(b.focus[0]!)! || order.get(a.focus[0]!)! - order.get(b.focus[0]!)!)
  if (story.length > limits.story) {
    const rest = story.splice(limits.story - 1)
    story.push({ ...rest[0]!, title: '其余分支', reveal: rest.flatMap(step => step.reveal), focus: [] })
  }
  const now = Date.now()
  const title = clean(doc.name ?? doc.root.text)
  return validateWorkspace({
    schemaVersion: 3, revision: 0, id: crypto.randomUUID(), title, template: 'concept',
    question: '', takeaway: '', audience: '', summary: '从经典导图导入。',
    sources: [], nodes, relations,
    views: [{ id: stageId, title: '思维图', form: 'tree', nodeIds: nodes.map(node => node.id), positions: {} }],
    story, flows: [], decisions: [], productItems: [], questions: [], attempts: [], createdAt: now, updatedAt: now,
  })
}
