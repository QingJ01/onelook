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
} from './types'

export function validateWorkspace(value: unknown): Workspace {
  return validateWorkspaceData(value) as Workspace
}

export function createWorkspace(scenario: Scenario, title: string): Workspace {
  const now = Date.now()
  return validateWorkspace({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    scenario,
    summary: '',
    sources: [],
    nodes: [],
    relations: [],
    path: [],
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

export function applyGenerated(workspace: Workspace, generated: unknown): Workspace {
  const current = validateWorkspace(workspace)
  if (current.nodes.length || current.relations.length || current.path.length || current.questions.length) {
    throw new TypeError('Generated content can only initialize an empty workspace.')
  }
  const content = validateGeneratedContentData(generated, current) as GeneratedContent
  return validateWorkspace({
    ...current,
    ...content,
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

export function recordAttempt(
  workspace: Workspace,
  questionId: string,
  answer: string,
  rating: 'again' | 'good',
  now = Date.now(),
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
  const dueAt = now + (rating === 'again' ? 10 * 60 * 1000 : 24 * 60 * 60 * 1000)
  if (!Number.isFinite(dueAt)) throw new TypeError('dueAt must be a finite number.')
  return validateWorkspace({
    ...current,
    attempts: [
      ...current.attempts,
      { id: crypto.randomUUID(), questionId, answer, rating, at: now, dueAt },
    ],
    updatedAt: now,
  })
}
