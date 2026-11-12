import type { Workspace } from './types'

export interface ClarityIssue {
  level: 'warn' | 'hint'
  rule: 'question' | 'takeaway' | 'steps' | 'points' | 'order' | 'unused' | 'basis' | 'load' | 'narration'
  message: string
  stepId?: string
  nodeId?: string
}

export const MAX_NEW_PER_STEP = 5
const joiners = /[；;。]|以及|并且|同时|还有/

/** Deterministic checks only. They flag what to look at; they do not measure understanding. */
export function checkClarity(workspace: Workspace): ClarityIssue[] {
  const issues: ClarityIssue[] = []
  const title = (id: string) => workspace.nodes.find(node => node.id === id)?.title ?? id
  if (!workspace.question.trim()) issues.push({ level: 'warn', rule: 'question', message: '还没写要讲清的问题。' })
  if (!workspace.takeaway.trim()) issues.push({ level: 'warn', rule: 'takeaway', message: '缺一句话结论。' })
  if (!workspace.story.length) {
    issues.push({ level: 'warn', rule: 'steps', message: '还没有讲解步骤。' })
    return issues
  }

  const revealedAt = new Map<string, number>()
  workspace.story.forEach((step, index) => step.reveal.forEach(id => { if (!revealedAt.has(id)) revealedAt.set(id, index) }))

  workspace.story.forEach((step, index) => {
    const label = `第 ${index + 1} 步`
    if (joiners.test(step.title.trim().replace(/[。；;]$/, ''))) {
      issues.push({ level: 'hint', rule: 'points', message: `${label}的要点可能不止一个，考虑拆开。`, stepId: step.id })
    }
    if (step.reveal.length > MAX_NEW_PER_STEP) {
      issues.push({ level: 'warn', rule: 'load', message: `${label}一次出现 ${step.reveal.length} 个新对象，超过 ${MAX_NEW_PER_STEP} 个。`, stepId: step.id })
    }
    if (!step.narration.trim() && !step.reveal.length && !step.focus.length) {
      issues.push({ level: 'hint', rule: 'narration', message: `${label}没有讲述，也没有指向任何对象。`, stepId: step.id })
    }
    for (const id of step.focus) {
      const at = revealedAt.get(id)
      if (at === undefined || at > index) {
        issues.push({ level: 'warn', rule: 'order', message: `${label}聚焦了还没出现的「${title(id)}」。`, stepId: step.id, nodeId: id })
      }
    }
    for (const node of workspace.nodes) {
      const at = revealedAt.get(node.id)
      if (at !== undefined && at > index && node.title.trim().length >= 2 && step.narration.includes(node.title.trim())) {
        issues.push({ level: 'warn', rule: 'order', message: `${label}的讲述用到了「${node.title}」，但第 ${at + 1} 步才引入它。`, stepId: step.id, nodeId: node.id })
      }
    }
  })

  for (const relation of workspace.relations) {
    if (relation.kind !== 'prerequisite') continue
    const before = revealedAt.get(relation.from), after = revealedAt.get(relation.to)
    if (before !== undefined && after !== undefined && before > after) {
      issues.push({
        level: 'warn', rule: 'order', stepId: workspace.story[after]!.id, nodeId: relation.to,
        message: `「${title(relation.to)}」在第 ${after + 1} 步出现，但它的先修「${title(relation.from)}」到第 ${before + 1} 步才出现。`,
      })
    }
  }

  for (const node of workspace.nodes) {
    if (!revealedAt.has(node.id)) {
      issues.push({ level: 'hint', rule: 'unused', message: `「${node.title}」没有出现在任何一步。`, nodeId: node.id })
    }
    if (node.certainty === 'supported' && !node.citations.length) {
      issues.push({ level: 'warn', rule: 'basis', message: `「${node.title}」标为原文支持，但没有引用。`, nodeId: node.id })
    } else if (node.certainty === 'unverified' && !node.citations.length) {
      issues.push({ level: 'hint', rule: 'basis', message: `「${node.title}」没有引用，也没有标为推断。`, nodeId: node.id })
    }
  }
  return issues
}
