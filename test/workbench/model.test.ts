import { describe, expect, it } from 'vitest'
import {
  applyGenerated,
  createWorkspace,
  getDueQuestions,
  makeNode,
  recordAttempt,
  validateWorkspace,
} from '../../src/workbench/model'
import { fixtureWorkspace, generatedFixture } from './fixtures'

describe('workbench domain model', () => {
  it('creates valid empty workspaces and user-provenance nodes', () => {
    const workspace = createWorkspace('architecture', 'New workspace')
    expect(validateWorkspace(workspace)).toEqual(workspace)
    expect(workspace.nodes).toEqual([])

    const node = makeNode('A concept')
    expect(node).toMatchObject({
      title: 'A concept',
      kind: 'concept',
      body: '',
      citations: [],
      provenance: 'user',
    })
  })

  it('rejects unknown fields, broken citations, and invalid source URLs', () => {
    const valid = fixtureWorkspace()
    expect(() => validateWorkspace({ ...valid, unexpected: true })).toThrow(/unexpected/)
    expect(() => validateWorkspace({
      ...valid,
      nodes: valid.nodes.map(node => ({ ...node, citations: [{ sourceId: 'source-1', quote: 'not a quote' }] })),
    })).toThrow(/exact substring/)
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
    expect(() => validateWorkspace({ ...valid, path: ['node-b', 'node-a'] })).toThrow(/prerequisite/)
    expect(() => validateWorkspace({
      ...valid,
      questions: [{ id: 'question-a', nodeId: 'missing-node', prompt: 'q', answer: 'a' }],
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
        createdAt: 5,
      }],
      createdAt: 10,
      updatedAt: 11,
    })
    const result = applyGenerated(emptyWithSource, generatedFixture())
    expect(result.id).toBe(emptyWithSource.id)
    expect(result.createdAt).toBe(emptyWithSource.createdAt)
    expect(result.sources).toEqual(emptyWithSource.sources)
    expect(result.nodes[0]?.provenance).toBe('ai')
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

  it('records exact review intervals and returns due questions from the latest attempt only', () => {
    const workspace = fixtureWorkspace()
    const againAt = 1_700_000_000_000
    const retried = recordAttempt(workspace, 'question-a', 'Still learning', 'again', againAt)
    expect(retried.attempts.at(-1)?.dueAt).toBe(againAt + 10 * 60 * 1000)
    const goodAt = againAt + 2000
    const mastered = recordAttempt(retried, 'question-b', 'Understood', 'good', goodAt)
    expect(mastered.attempts.at(-1)?.dueAt).toBe(goodAt + 24 * 60 * 60 * 1000)
    expect(workspace.attempts).toEqual([])

    const withHistory = validateWorkspace({
      ...mastered,
      questions: [
        ...mastered.questions,
        { id: 'question-never', nodeId: 'node-a', prompt: 'Unseen?', answer: 'Answer.' },
      ],
      attempts: [
        { id: 'older-a', questionId: 'question-a', answer: '', rating: 'again', at: 10, dueAt: 11 },
        { id: 'latest-a', questionId: 'question-a', answer: '', rating: 'again', at: 20, dueAt: 500 },
        { id: 'due-b', questionId: 'question-b', answer: '', rating: 'good', at: 30, dueAt: 40 },
      ],
    })
    expect(getDueQuestions(withHistory, 100).map(question => question.id)).toEqual(['question-b'])
    expect(() => recordAttempt(workspace, 'missing-question', '', 'good', 0)).toThrow(/Unknown question/)
  })
})
