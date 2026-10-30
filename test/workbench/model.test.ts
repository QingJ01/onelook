import { describe, expect, it } from 'vitest'
import {
  applyGenerated,
  createWorkspace,
  getDueQuestions,
  makeView,
  makeNode,
  nextReviewInterval,
  recordAttempt,
  validateWorkspace,
} from '../../src/workbench/model'
import { fixtureWorkspace, generatedFixture } from './fixtures'

describe('workbench domain model', () => {
  it('creates valid empty workspaces and user-provenance nodes', () => {
    const workspace = createWorkspace('architecture', 'New workspace')
    expect(validateWorkspace(workspace)).toEqual(workspace)
    expect(workspace.schemaVersion).toBe(2)
    expect(workspace.revision).toBe(0)
    expect(workspace.nodes).toEqual([])
    expect(workspace.views).toHaveLength(1)
    expect(workspace.flows).toEqual([])
    expect(workspace.decisions).toEqual([])
    expect(workspace.productItems).toEqual([])

    const node = makeNode('A concept')
    expect(node).toMatchObject({
      title: 'A concept',
      kind: 'concept',
      body: '',
      citations: [],
      provenance: 'user',
    })
  })

  it('creates independent views with all nodes and a cloned default path', () => {
    const workspace = fixtureWorkspace()
    const defaultView = workspace.views[0]!
    const view = makeView(workspace, 'product', 'Alternative flow')
    expect(view).toMatchObject({
      scenario: 'product',
      kind: 'flow',
      nodeIds: workspace.nodes.map(node => node.id),
      path: defaultView.path,
      positions: {},
    })
    expect(view.id).not.toBe(defaultView.id)
    const withView = validateWorkspace({ ...workspace, views: [...workspace.views, view] })
    withView.views[0]!.positions['node-a'] = { x: 900, y: 800 }
    expect(withView.views[1]!.positions).toEqual({})
    expect(makeView(withView, 'course', 'Learning view').kind).toBe('learning')
  })

  it('rejects unknown fields, broken citations, and invalid source URLs', () => {
    const valid = fixtureWorkspace()
    expect(() => validateWorkspace({ ...valid, unexpected: true })).toThrow(/unexpected/)
    expect(() => validateWorkspace({
      ...valid,
      nodes: valid.nodes.map(node => ({ ...node, citations: [{
        sourceId: 'source-1', quote: 'not a quote', version: 1, start: 0, end: 10,
      }] })),
    })).toThrow(/quote and UTF-16 offsets/)
    expect(() => validateWorkspace({
      ...valid,
      sources: valid.sources.map(source => ({ ...source, url: 'javascript:alert(1)' })),
    })).toThrow(/HTTP\(S\)/)
  })

  it('enforces graph integrity, prerequisite acyclicity, and path order', () => {
    const valid = fixtureWorkspace()
    expect(() => validateWorkspace({
      ...valid,
      relations: [
        ...valid.relations,
        { id: 'edge-b', from: 'node-b', to: 'node-a', kind: 'prerequisite', label: '' },
      ],
    })).toThrow(/cycles/)
    expect(() => validateWorkspace({
      ...valid,
      views: valid.views.map((view, index) => index === 0 ? { ...view, path: ['node-b', 'node-a'] } : view),
    })).toThrow(/prerequisite/)
    expect(() => validateWorkspace({
      ...valid,
      questions: [{ id: 'question-a', nodeId: 'missing-node', prompt: 'q', answer: 'a', relatedNodeIds: [] }],
    })).toThrow(/missing node/)
  })

  it('applies validated generation only to an empty graph and preserves workspace identity and sources', () => {
    const base = createWorkspace('course', 'Draft')
    const emptyWithSource = validateWorkspace({
      ...base,
      sources: [{
        id: 'source-1',
        title: 'Local source',
        text: 'Retained source text.',
        version: 1,
        createdAt: 5,
        versions: [],
      }],
      createdAt: 10,
      updatedAt: 11,
    })
    const result = applyGenerated(emptyWithSource, generatedFixture())
    expect(result.id).toBe(emptyWithSource.id)
    expect(result.createdAt).toBe(emptyWithSource.createdAt)
    expect(result.sources).toEqual(emptyWithSource.sources)
    expect(result.nodes[0]?.provenance).toBe('ai')
    expect(result.views[0]).toMatchObject({
      nodeIds: ['generated-a'],
      path: ['generated-a'],
    })
    expect(result.views[0]?.positions).toEqual({})
    expect(result).not.toHaveProperty('path')
    expect(() => applyGenerated(fixtureWorkspace(), generatedFixture())).toThrow(/empty workspace/)
    expect(() => applyGenerated(emptyWithSource, { ...generatedFixture(), unsupported: true })).toThrow(/unknown field/)
  })

  it('rejects empty generation and nodes not marked as AI provenance', () => {
    const base = createWorkspace('architecture', 'Draft')
    expect(() => applyGenerated(base, {
      ...generatedFixture(),
      nodes: [],
      path: [],
      questions: [],
    })).toThrow(/at least one generated node/)

    for (const provenance of ['user', 'demo']) {
      const generated = generatedFixture()
      generated.nodes[0].provenance = provenance
      expect(() => applyGenerated(base, generated)).toThrow(/provenance.*must be ai/)
    }
  })

  it('schedules consecutive good self-ratings, resets on again, and preserves exact historical due times', () => {
    const workspace = fixtureWorkspace()
    const firstAt = 1_700_000_000_000
    const first = recordAttempt(workspace, 'question-a', 'Understood', 'good', firstAt, 'First reflection')
    expect(first.attempts.at(-1)?.dueAt).toBe(firstAt + 24 * 60 * 60 * 1000)
    expect(first.attempts.at(-1)?.errorReason).toBe('First reflection')
    expect(nextReviewInterval(first, 'question-a', 'good')).toBe(3 * 24 * 60 * 60 * 1000)

    const secondAt = firstAt + 1000
    const second = recordAttempt(first, 'question-a', 'Understood', 'good', secondAt)
    expect(second.attempts.at(-1)?.dueAt).toBe(secondAt + 3 * 24 * 60 * 60 * 1000)
    expect(nextReviewInterval(second, 'question-a', 'good')).toBe(7 * 24 * 60 * 60 * 1000)

    const againAt = secondAt + 1000
    const retried = recordAttempt(second, 'question-a', 'Still learning', 'again', againAt)
    expect(retried.attempts.at(-1)?.dueAt).toBe(againAt + 10 * 60 * 1000)
    const restartedAt = againAt + 1000
    const restarted = recordAttempt(retried, 'question-a', 'Understood', 'good', restartedAt)
    expect(restarted.attempts.at(-1)?.dueAt).toBe(restartedAt + 24 * 60 * 60 * 1000)
    expect(first.attempts.at(-1)?.dueAt).toBe(firstAt + 24 * 60 * 60 * 1000)

    const withHistory = validateWorkspace({
      ...restarted,
      questions: [
        ...restarted.questions,
        { id: 'question-never', nodeId: 'node-a', prompt: 'Unseen?', answer: 'Answer.', relatedNodeIds: [] },
      ],
      attempts: [
        { id: 'older-a', questionId: 'question-a', answer: '', rating: 'again', at: 10, dueAt: 11, errorReason: '' },
        { id: 'latest-a', questionId: 'question-a', answer: '', rating: 'again', at: 20, dueAt: 500, errorReason: '' },
        { id: 'due-b', questionId: 'question-b', answer: '', rating: 'good', at: 30, dueAt: 40, errorReason: '' },
      ],
    })
    expect(getDueQuestions(withHistory, 100).map(question => question.id)).toEqual(['question-b'])
    expect(() => recordAttempt(workspace, 'missing-question', '', 'good', 0)).toThrow(/Unknown question/)
  })
})
