import {
  storyFromPath,
  validateGeneratedContentData,
  validateOutlineData,
  validateWorkspaceData,
  workspaceIds,
} from '../../shared/validation.mjs'
import {
  templates,
  viewForms,
  type GeneratedContent,
  type KnowledgeNode,
  type NodeKind,
  type Question,
  type StoryOutline,
  type StoryStep,
  type Template,
  type ViewForm,
  type Workspace,
  type WorkspaceView,
} from './types'

export function validateWorkspace(value: unknown): Workspace {
  return validateWorkspaceData(value) as Workspace
}

export function createWorkspace(template: Template, title: string, question = ''): Workspace {
  const now = Date.now()
  const id = crypto.randomUUID()
  return validateWorkspace({
    schemaVersion: 3,
    revision: 0,
    id,
    title,
    template,
    question,
    takeaway: '',
    audience: '',
    summary: '',
    sources: [],
    nodes: [],
    relations: [],
    views: [{
      id: `view-${id}`,
      title: viewForms[templates[template].form].name,
      form: templates[template].form,
      nodeIds: [],
      positions: {},
    }],
    story: [],
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
    certainty: 'unverified',
  }
}

function freshId(workspace: Workspace): string {
  const reserved = new Set(workspaceIds(workspace) as string[])
  let id = crypto.randomUUID()
  while (reserved.has(id)) id = crypto.randomUUID()
  return id
}

export function makeView(workspace: Workspace, form: ViewForm, title: string, nodeIds?: string[]): WorkspaceView {
  const current = validateWorkspace(workspace)
  const view: WorkspaceView = {
    id: freshId(current),
    title,
    form,
    nodeIds: nodeIds ?? current.nodes.map(node => node.id),
    positions: {},
  }
  const views = validateWorkspace({ ...current, views: [...current.views, view] }).views
  return views[views.length - 1]!
}

export function makeStep(workspace: Workspace, stageId: string, title: string): StoryStep {
  const current = validateWorkspace(workspace)
  const step: StoryStep = {
    id: freshId(current), title, narration: '', stageId, reveal: [], focus: [], citations: [], provenance: 'user',
  }
  const story = validateWorkspace({ ...current, story: [...current.story, step] }).story
  return story[story.length - 1]!
}

export interface StageState { stageId: string; visible: string[]; focus: string[] }

/** What is on screen at a step: everything introduced on that stage so far, and what this step points at. */
export function stageStateAt(workspace: Workspace, index: number): StageState | undefined {
  const step = workspace.story[index]
  if (!step) return undefined
  const visible = new Set<string>()
  for (const earlier of workspace.story.slice(0, index + 1)) {
    if (earlier.stageId === step.stageId) earlier.reveal.forEach(id => visible.add(id))
  }
  const view = workspace.views.find(item => item.id === step.stageId)
  const introducedElsewhere = new Set(workspace.story.slice(0, index).flatMap(item => item.reveal))
  for (const id of view?.nodeIds ?? []) if (introducedElsewhere.has(id)) visible.add(id)
  return {
    stageId: step.stageId,
    visible: (view?.nodeIds ?? []).filter(id => visible.has(id)),
    focus: step.focus.length ? [...step.focus] : [...step.reveal],
  }
}

/**
 * Keep story references valid after content was removed: steps whose stage is gone move to the first
 * view, reveals and focuses outside the stage are dropped, and questions let go of deleted steps.
 * Returns how many steps lost their stage so the caller can tell the user.
 */
export function repairStory(draft: Workspace): number {
  const stages = new Set([
    ...draft.views.map(item => item.id), ...draft.flows.map(item => item.id),
    ...draft.decisions.map(item => item.id), ...draft.productItems.map(item => item.id),
  ])
  let moved = 0
  for (const step of draft.story) {
    if (!stages.has(step.stageId)) { step.stageId = draft.views[0]!.id; moved += 1 }
    const allowed = new Set(draft.views.find(view => view.id === step.stageId)?.nodeIds ?? [])
    step.reveal = step.reveal.filter(id => allowed.has(id))
    step.focus = step.focus.filter(id => allowed.has(id))
    const sources = new Set(draft.sources.map(source => source.id))
    step.citations = step.citations.filter(citation => sources.has(citation.sourceId))
  }
  const steps = new Set(draft.story.map(step => step.id))
  for (const question of draft.questions) if (!steps.has(question.stepId)) question.stepId = ''
  return moved
}

/** Adopt an AI outline: one view per diagram form the outline uses, then the steps. */
export function applyOutline(workspace: Workspace, outline: unknown): Workspace {
  const current = validateWorkspace(workspace)
  const content = validateOutlineData(outline, current) as StoryOutline
  const draft = structuredClone(current)
  const viewByForm = new Map<ViewForm, WorkspaceView>()
  const reserved = new Set(workspaceIds(draft) as string[])
  const newId = () => {
    let id = crypto.randomUUID()
    while (reserved.has(id)) id = crypto.randomUUID()
    reserved.add(id)
    return id
  }
  for (const step of content.steps) {
    if (viewByForm.has(step.form)) continue
    const needed = [...new Set(content.steps.filter(item => item.form === step.form).flatMap(item => [...item.reveal, ...item.focus]))]
    let view = draft.views.find(item => item.form === step.form)
    if (!view) {
      view = { id: newId(), title: viewForms[step.form].name, form: step.form, nodeIds: [], positions: {} }
      draft.views.push(view)
    }
    for (const id of needed) if (!view.nodeIds.includes(id)) view.nodeIds.push(id)
    viewByForm.set(step.form, view)
  }
  draft.question = content.question
  draft.takeaway = content.takeaway
  draft.audience = content.audience
  draft.story = content.steps.map(step => ({
    id: newId(),
    title: step.title,
    narration: step.narration,
    stageId: viewByForm.get(step.form)!.id,
    reveal: step.reveal,
    focus: step.focus,
    citations: step.citations,
    provenance: 'ai',
  }))
  const stepIds = new Set(draft.story.map(step => step.id))
  draft.questions.forEach(question => {
    if (!stepIds.has(question.stepId)) question.stepId = draft.story.find(step => step.reveal.includes(question.nodeId))?.id ?? ''
  })
  draft.updatedAt = Date.now()
  return validateWorkspace(draft)
}

export function applyGenerated(workspace: Workspace, generated: unknown): Workspace {
  const current = validateWorkspace(workspace)
  if (
    current.nodes.length || current.relations.length || current.questions.length
    || current.flows.length || current.decisions.length || current.productItems.length || current.story.length
    || current.views.some(view => view.nodeIds.length || Object.keys(view.positions).length)
  ) {
    throw new TypeError('Generated content can only initialize an empty workspace.')
  }
  const content = validateGeneratedContentData(generated, current) as GeneratedContent
  const nodes = content.nodes.map(({ x: _x, y: _y, ...node }) => node)
  const reserved = new Set(workspaceIds({ ...current, nodes, relations: content.relations, questions: content.questions }) as string[])
  const firstView = current.views[0]
  const positions = { ...firstView.positions }
  for (const node of content.nodes) {
    if (node.x !== undefined || node.y !== undefined) {
      positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 }
    }
  }
  const views = current.views.map((view, index) => index === 0
    ? { ...view, nodeIds: nodes.map(node => node.id), positions }
    : view)
  const story = storyFromPath(content.path, firstView.id, nodes, reserved, 'ai') as StoryStep[]
  return validateWorkspace({
    ...current,
    title: content.title,
    summary: content.summary,
    nodes,
    relations: content.relations,
    questions: content.questions.map(question => ({
      ...question,
      stepId: story.find(step => step.reveal.includes(question.nodeId))?.id ?? '',
    })),
    views,
    story,
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
