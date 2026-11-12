import runtime from './player-runtime.js?raw'
import styles from './player-runtime.css?raw'
import themeStyles from './themes.css?raw'
import { nodeVisuals, relationTone } from './visual'
import { layoutView } from './layout'
import { stageStateAt } from './model'
import { nodeKinds, type KnowledgeNode, type Workspace } from './types'

type Stage =
  | ({ type: 'diagram'; title: string; nodes: { id: string; title: string; kind: string; tone: string; sigil: string; body: string; x: number; y: number; w: number; h: number }[] } & Omit<ReturnType<typeof layoutView>, 'boxes'>)
  | { type: 'matrix'; title: string; columns: string[]; rows: { id: string; title: string; cells: string[] }[] }
  | { type: 'block'; title: string; fields: [string, string][] }

export const matrixColumns: [keyof KnowledgeNode & ('body' | 'example' | 'pitfall' | 'acceptance'), string][] = [
  ['body', '说明'], ['example', '例子'], ['pitfall', '常见误区'], ['acceptance', '验收条件'],
]

export function matrixFor(nodes: KnowledgeNode[]) {
  const columns = matrixColumns.filter(([field]) => nodes.some(node => node[field].trim()))
  return {
    columns: columns.map(([, name]) => name),
    rows: nodes.map(node => ({ id: node.id, title: node.title, cells: columns.map(([field]) => node[field]) })),
  }
}

function stageFor(workspace: Workspace, stageId: string): Stage {
  const title = (id: string) => workspace.nodes.find(node => node.id === id)?.title ?? id
  const view = workspace.views.find(item => item.id === stageId)
  if (view) {
    const nodes = view.nodeIds.flatMap(id => workspace.nodes.filter(node => node.id === id))
    if (view.form === 'matrix') return { type: 'matrix', title: view.title, ...matrixFor(nodes) }
    const { boxes, ...layout } = layoutView({ form: view.form, nodeIds: view.nodeIds, relations: workspace.relations, positions: view.positions, title: workspace.title })
    return { type: 'diagram', title: view.title, ...layout,
      edges: layout.edges.map(edge => ({ ...edge, tone: relationTone(workspace.relations.find(relation => relation.id === edge.id)?.kind) })),
      nodes: nodes.map(node => ({ id: node.id, title: node.title, kind: nodeKinds[node.kind], body: node.body, ...nodeVisuals[node.kind], ...boxes[node.id]! })) }
  }
  const flow = workspace.flows.find(item => item.id === stageId)
  if (flow) {
    return { type: 'block', title: flow.title, fields: flow.steps.map((step, index) => [`${index + 1} · ${step.branch === 'failure' ? '失败分支' : step.branch === 'alternative' ? '备选分支' : '主流程'}${step.condition ? ` · ${step.condition}` : ''}`, `${title(step.from)} → ${title(step.to)}：${step.message}`]) }
  }
  const decision = workspace.decisions.find(item => item.id === stageId)
  if (decision) {
    return { type: 'block', title: decision.title, fields: [['背景', decision.context], ['选择', decision.choice], ['放弃的备选', decision.alternatives], ['影响', decision.consequences]] }
  }
  const item = workspace.productItems.find(entry => entry.id === stageId)!
  return {
    type: 'block', title: item.title,
    fields: [['内容', item.body], ...item.alternatives.map(option => [`备选：${option.title}`, `收益：${option.benefits}\n代价：${option.costs}`] as [string, string]), ...item.criteria.map(criterion => ['验收条件', criterion.text] as [string, string])],
  }
}

export function playerData(workspace: Workspace) {
  const stages: Record<string, Stage> = {}
  const steps = workspace.story.map((step, index) => {
    stages[step.stageId] ??= stageFor(workspace, step.stageId)
    const state = stageStateAt(workspace, index)!
    return {
      title: step.title,
      narration: step.narration,
      stageId: step.stageId,
      visible: state.visible,
      focus: state.focus,
      details: state.focus.flatMap(id => workspace.nodes.filter(node => node.id === id)).map(({ title, body, example, pitfall }) => ({ title, body, example, pitfall })),
      citations: step.citations.map(citation => ({ quote: citation.quote, source: `${workspace.sources.find(source => source.id === citation.sourceId)?.title ?? ''} · v${citation.version}` })),
      questions: workspace.questions.filter(question => question.stepId === step.id).map(({ prompt, answer }) => ({ prompt, answer })),
    }
  })
  return { title: workspace.title, question: workspace.question, takeaway: workspace.takeaway, audience: workspace.audience, stages, steps }
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
const escapeJson = (text: string) => text.replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)

/** A single HTML file that plays the explanation step by step with no network access. */
export function exportPlayerHtml(workspace: Workspace): string {
  const data = escapeJson(JSON.stringify(playerData(workspace)))
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>${escapeHtml(workspace.title)}</title>
<style>${themeStyles}\n${styles}</style>
</head>
<body>
<div id="app"></div>
<script type="application/json" id="onelook-data">${data}</script>
<script>${runtime}</script>
</body>
</html>
`
}
