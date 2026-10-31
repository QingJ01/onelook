import {
  validateGeneratedContentData,
  validateWorkspaceData,
} from '../../shared/validation.mjs'
import type {
  GeneratedContent,
  KnowledgeNode,
  NodeKind,
  Question,
  Scenario,
  Workspace,
  WorkspaceView,
} from './types'

export function validateWorkspace(value: unknown): Workspace {
  return validateWorkspaceData(value) as Workspace
}

export function createWorkspace(scenario: Scenario, title: string): Workspace {
  const now = Date.now()
  const id = crypto.randomUUID()
  return validateWorkspace({
    schemaVersion: 2,
    revision: 0,
    id,
    title,
    scenario,
    summary: '',
    sources: [],
    nodes: [],
    relations: [],
    views: [{
      id: `view-${id}`,
      title,
      scenario,
      kind: viewKind(scenario),
      nodeIds: [],
      path: [],
      positions: {},
    }],
    flows: [],
    decisions: [],
    productItems: [],
    questions: [],
    attempts: [],
    createdAt: now,
    updatedAt: now,
  })
}

export function makeNode(title: string, kind: NodeKind = 'concept'): KnowledgeNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind,
    body: '',
    example: '',
    pitfall: '',
    notes: '',
    acceptance: '',
    citations: [],
    provenance: 'user',
  }
}

function viewKind(scenario: Scenario): WorkspaceView['kind'] {
  if (scenario === 'product') return 'flow'
  if (scenario === 'course') return 'learning'
  return 'map'
}

export function makeView(workspace: Workspace, scenario: Scenario, title: string): WorkspaceView {
  const current = validateWorkspace(workspace)
  const reservedIds = new Set([
    current.id,
    ...current.sources.map(source => source.id),
    ...current.nodes.map(node => node.id),
    ...current.relations.map(relation => relation.id),
    ...current.views.map(view => view.id),
    ...current.flows.flatMap(flow => [flow.id, ...flow.steps.map(step => step.id)]),
    ...current.decisions.map(decision => decision.id),
    ...current.productItems.flatMap(item => [
      item.id,
      ...item.criteria.map(criterion => criterion.id),
      ...item.alternatives.map(alternative => alternative.id),
    ]),
    ...current.questions.map(question => question.id),
    ...current.attempts.map(attempt => attempt.id),
  ])
  let id = crypto.randomUUID()
  while (reservedIds.has(id)) id = crypto.randomUUID()
  const defaultView = current.views[0]
  const view: WorkspaceView = {
    id,
    title,
    scenario,
    kind: viewKind(scenario),
    nodeIds: current.nodes.map(node => node.id),
    path: [...defaultView.path],
    positions: {},
  }
  const views = validateWorkspace({ ...current, views: [...current.views, view] }).views
  return views[views.length - 1]!
}

export function applyGenerated(workspace: Workspace, generated: unknown): Workspace {
  const current = validateWorkspace(workspace)
  if (
    current.nodes.length || current.relations.length || current.questions.length
    || current.flows.length || current.decisions.length || current.productItems.length
    || current.views.some(view => view.nodeIds.length || view.path.length || Object.keys(view.positions).length)
  ) {
    throw new TypeError('Generated content can only initialize an empty workspace.')
  }
  const content = validateGeneratedContentData(generated, current) as GeneratedContent
  const nodes = content.nodes.map(({ x: _x, y: _y, ...node }) => node)
  const firstView = current.views[0]
  const positions = { ...firstView.positions }
  for (const node of content.nodes) {
    if (node.x !== undefined || node.y !== undefined) {
      positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 }
    }
  }
  const views = current.views.map((view, index) => index === 0
    ? { ...view, nodeIds: nodes.map(node => node.id), path: [...content.path], positions }
    : view)
  return validateWorkspace({
    ...current,
    title: content.title,
    summary: content.summary,
    nodes,
    relations: content.relations,
    questions: content.questions,
    views,
    updatedAt: Date.now(),
  })
}

export function getDueQuestions(workspace: Workspace, now = Date.now()): Question[] {
  const current = validateWorkspace(workspace)
  if (!Number.isFinite(now)) throw new TypeError('now must be a finite number.')
  const latest = new Map<string, Workspace['attempts'][number]>()
  for (const attempt of current.attempts) {
    const previous = latest.get(attempt.questionId)
    if (!previous || attempt.at >= previous.at) latest.set(attempt.questionId, attempt)
  }
  return current.questions
    .filter(question => {
      const attempt = latest.get(question.id)
      return attempt !== undefined && attempt.dueAt <= now
    })
    .map(question => structuredClone(question))
}

const REVIEW_DAYS = [1, 3, 7, 14, 30]
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

function intervalFor(attempts: Workspace['attempts'], rating: 'again' | 'good'): number {
  if (rating === 'again') return 10 * MINUTE_MS
  let consecutiveGood = 0
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index].rating !== 'good') break
    consecutiveGood += 1
  }
  return REVIEW_DAYS[Math.min(consecutiveGood, REVIEW_DAYS.length - 1)] * DAY_MS
}

export function nextReviewInterval(
  workspace: Workspace,
  questionId: string,
  rating: 'again' | 'good',
): number {
  const current = validateWorkspace(workspace)
  if (!current.questions.some(question => question.id === questionId)) {
    throw new TypeError(`Unknown question "${questionId}".`)
  }
  if (rating !== 'again' && rating !== 'good') throw new TypeError('rating must be "again" or "good".')
  const history = current.attempts
    .filter(attempt => attempt.questionId === questionId)
    .sort((left, right) => left.at - right.at)
  return intervalFor(history, rating)
}

export function recordAttempt(
  workspace: Workspace,
  questionId: string,
  answer: string,
  rating: 'again' | 'good',
  now = Date.now(),
  errorReason = '',
): Workspace {
  const current = validateWorkspace(workspace)
  if (!current.questions.some(question => question.id === questionId)) {
    throw new TypeError(`Unknown question "${questionId}".`)
  }
  if (typeof answer !== 'string' || answer.length > 20000) {
    throw new TypeError('answer must be a string of at most 20000 characters.')
  }
  if (rating !== 'again' && rating !== 'good') throw new TypeError('rating must be "again" or "good".')
  if (!Number.isFinite(now)) throw new TypeError('now must be a finite number.')
  if (typeof errorReason !== 'string' || errorReason.length > 20000) {
    throw new TypeError('errorReason must be a string of at most 20000 characters.')
  }
  const priorAttempts = current.attempts
    .filter(attempt => attempt.questionId === questionId && attempt.at <= now)
    .sort((left, right) => left.at - right.at)
  const dueAt = now + intervalFor(priorAttempts, rating)
  if (!Number.isFinite(dueAt)) throw new TypeError('dueAt must be a finite number.')
  return validateWorkspace({
    ...current,
    attempts: [
      ...current.attempts,
      { id: crypto.randomUUID(), questionId, answer, rating, at: now, dueAt, errorReason },
    ],
    updatedAt: now,
  })
}
