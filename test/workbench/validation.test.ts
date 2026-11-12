import { describe, expect, it } from 'vitest'
import {
  validateGeneratedContentData,
  validateUnderstandingData,
  validateWorkspaceData,
} from '../../shared/validation.mjs'

const sourceText = 'a😀 quoted evidence is safe'

function legacyWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'legacy-workspace',
    title: 'Legacy workspace',
    scenario: 'architecture',
    summary: 'Migrated summary.',
    sources: [{
      id: 'source-old',
      title: 'Legacy source',
      text: sourceText,
      createdAt: 10,
    }],
    nodes: [{
      id: 'node-old',
      title: 'Legacy node',
      kind: 'concept',
      body: 'A legacy idea.',
      example: '',
      pitfall: '',
      notes: '',
      acceptance: '',
      citations: [{ sourceId: 'source-old', quote: 'quoted evidence' }],
      provenance: 'user',
      x: 12,
      y: 24,
    }],
    relations: [],
    path: ['node-old'],
    questions: [{
      id: 'question-old',
      nodeId: 'node-old',
      prompt: 'What is it?',
      answer: 'A legacy idea.',
    }],
    attempts: [{
      id: 'attempt-old',
      questionId: 'question-old',
      answer: 'Remembered.',
      rating: 'good',
      at: 20,
      dueAt: 30,
    }],
    createdAt: 5,
    updatedAt: 40,
    ...overrides,
  }
}

function migratedWorkspace() {
  return structuredClone(validateWorkspaceData(legacyWorkspace())) as any
}

describe('canonical V3 validation and migration from V1 and V2', () => {
  it('rejects UTF-8 JSON larger than 20 MiB before canonical normalization', () => {
    const oversized = legacyWorkspace({
      sources: [{
        id: 'source-old',
        title: 'Large source',
        text: '你'.repeat(7 * 1024 * 1024),
        createdAt: 10,
      }],
    })
    expect(() => validateWorkspaceData(oversized)).toThrow(/20 MiB/)
  })

  it('migrates valid V1 content deterministically without losing identity, layout, or review timing', () => {
    const input = legacyWorkspace()
    const first = validateWorkspaceData(input) as any
    const second = validateWorkspaceData(input) as any

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      schemaVersion: 3,
      revision: 0,
      id: 'legacy-workspace',
      template: 'architecture',
      question: '',
      takeaway: '',
      createdAt: 5,
      updatedAt: 40,
      views: [{
        id: 'view-legacy-workspace',
        title: 'Legacy workspace',
        form: 'graph',
        nodeIds: ['node-old'],
        positions: { 'node-old': { x: 12, y: 24 } },
      }],
      story: [{
        id: 'step-1', title: 'Legacy node', narration: '', stageId: 'view-legacy-workspace',
        reveal: ['node-old'], focus: ['node-old'], citations: [], provenance: 'user',
      }],
      sources: [{
        id: 'source-old',
        version: 1,
        versions: [],
        text: sourceText,
      }],
      questions: [{ relatedNodeIds: [], stepId: 'step-1' }],
      attempts: [{ dueAt: 30, errorReason: '' }],
    })
    expect(first.nodes[0].certainty).toBe('supported')
    expect(first.views[0]).not.toHaveProperty('path')
    expect(first.nodes[0]).not.toHaveProperty('x')
    expect(first.nodes[0]).not.toHaveProperty('y')
    expect(first.nodes[0].citations).toEqual([{
      sourceId: 'source-old',
      quote: 'quoted evidence',
      version: 1,
      start: 4,
      end: 19,
    }])
  })

  it('rejects unknown V1 data and future schemas instead of repairing them', () => {
    expect(() => validateWorkspaceData({ ...legacyWorkspace(), futureField: true })).toThrow(/unknown field/)
    expect(() => validateWorkspaceData({ schemaVersion: 4 })).toThrow(/must equal 1, 2 or 3/)
  })

  it('requires canonical V3 shapes and validates exact offsets against current or historical source text', () => {
    const workspace = migratedWorkspace()
    workspace.sources[0] = {
      ...workspace.sources[0],
      version: 2,
      text: 'replacement source',
      createdAt: 50,
      versions: [{ version: 1, text: sourceText, createdAt: 10 }],
    }
    expect(validateWorkspaceData(workspace)).toMatchObject({ schemaVersion: 3 })
    expect(() => validateWorkspaceData({
      ...workspace,
      nodes: workspace.nodes.map((node: any) => ({
        ...node,
        citations: [{ ...node.citations[0], start: 3 }],
      })),
    })).toThrow(/UTF-16 offsets/)
    expect(() => validateWorkspaceData({
      ...workspace,
      nodes: workspace.nodes.map((node: any) => ({ ...node, x: 1 })),
    })).toThrow(/unknown field "x"/)
    const { flows: _flows, ...missingField } = workspace
    expect(() => validateWorkspaceData(missingField)).toThrow(/missing "flows"/)
  })

  it('enforces evidence requirements in flows, confirmed product evidence, and criteria', () => {
    const workspace = migratedWorkspace()
    const flow = {
      id: 'flow-a',
      title: 'Request flow',
      steps: [{
        id: 'step-a',
        from: 'node-old',
        to: 'node-old',
        message: 'Request',
        condition: '',
        branch: 'main',
        evidence: 'static',
        citations: [],
      }],
    }
    expect(() => validateWorkspaceData({ ...workspace, flows: [flow] })).toThrow(/static or runtime evidence/)
    expect(() => validateWorkspaceData({
      ...workspace,
      productItems: [{
        id: 'item-a',
        title: 'Confirmed claim',
        type: 'evidence',
        status: 'confirmed',
        body: 'Claim text.',
        nodeIds: ['node-old'],
        relatedIds: [],
        citations: [],
        criteria: [],
        alternatives: [],
      }],
    })).toThrow(/confirmed product evidence/)
    expect(() => validateWorkspaceData({
      ...workspace,
      productItems: [{
        id: 'item-a',
        title: 'Acceptance',
        type: 'hypothesis',
        status: 'unverified',
        body: '',
        nodeIds: [],
        relatedIds: [],
        citations: [],
        criteria: [{ id: 'criterion-a', text: 'Must work', state: 'failed', evidence: '' }],
        alternatives: [],
      }],
    })).toThrow(/must contain evidence/)
  })

  it('normalizes the legacy AI wire citations and question links without weakening storage validation', () => {
    const base = validateWorkspaceData(legacyWorkspace({
      nodes: [],
      relations: [],
      path: [],
      questions: [],
      attempts: [],
    })) as any
    const generated = validateGeneratedContentData({
      title: 'Generated',
      summary: '',
      nodes: [{
        id: 'ai-node',
        title: 'Generated node',
        kind: 'concept',
        body: '',
        example: '',
        pitfall: '',
        notes: '',
        acceptance: '',
        citations: [{ sourceId: 'source-old', quote: 'quoted evidence' }],
        provenance: 'ai',
        x: 7,
        y: 8,
      }],
      relations: [],
      path: ['ai-node'],
      questions: [{
        id: 'ai-question',
        nodeId: 'ai-node',
        prompt: 'Question?',
        answer: 'Answer.',
      }],
    }, base) as any

    expect(generated.nodes[0].citations[0]).toEqual({
      sourceId: 'source-old',
      quote: 'quoted evidence',
      version: 1,
      start: 4,
      end: 19,
    })
    expect(generated.nodes[0]).toMatchObject({ x: 7, y: 8 })
    expect(validateGeneratedContentData(validateGeneratedContentData(generated, base), base)).toEqual(generated)
    expect(generated.questions[0].relatedNodeIds).toEqual([])
    expect(generated.nodes[0].certainty).toBe('supported')
    expect(generated.story).toMatchObject([{ title: 'Generated node', reveal: ['ai-node'], provenance: 'ai' }])
    expect(generated.questions[0].stepId).toBe(generated.story[0].id)
    expect(() => validateWorkspaceData({
      ...base,
      nodes: generated.nodes,
    })).toThrow(/unknown field "x"/)
  })

  it('accepts new semantic relation kinds without treating them as flow order', () => {
    const workspace = migratedWorkspace()
    workspace.nodes.push({
      id: 'node-two', title: 'Second node', kind: 'concept', body: '', example: '', pitfall: '',
      notes: '', acceptance: '', citations: [], provenance: 'user', certainty: 'unverified',
    })
    for (const kind of ['supports', 'contradicts', 'partOf', 'causes', 'defines', 'evaluates']) {
      workspace.relations = [{ id: `edge-${kind}`, from: 'node-old', to: 'node-two', kind, label: '' }]
      expect(validateWorkspaceData(workspace).relations[0].kind).toBe(kind)
    }
    workspace.relations = [{ id: 'edge-bad', from: 'node-old', to: 'node-two', kind: 'because', label: '' }]
    expect(() => validateWorkspaceData(workspace)).toThrow(/must be one of/)
  })

  it('validates a material understanding report against current sources', () => {
    const base = migratedWorkspace()
    const understanding = validateUnderstandingData({
      documentType: 'article',
      summary: 'A technical article about a subsystem.',
      coverage: { analyzedSourceIds: ['source-old'], skippedSourceIds: [], omissions: ['No runtime data included.'] },
      entities: [
        {
          id: 'entity-a', title: 'Foundation', kind: 'concept',
          description: 'The main idea.', certainty: 'supported',
          citations: [{ sourceId: 'source-old', quote: 'quoted evidence' }],
        },
        {
          id: 'entity-b', title: 'Open question', kind: 'concept',
          description: 'Not directly stated.', certainty: 'inferred', citations: [],
        },
      ],
      relations: [{
        id: 'rel-a', from: 'entity-a', to: 'entity-b', semantic: 'causes',
        label: 'motivates', certainty: 'inferred', citations: [],
      }],
      suggestedViews: [{ title: 'Logical map', form: 'graph', reason: 'Shows structure.' }],
      gaps: ['No benchmark numbers.'],
      questions: [{ prompt: 'What does the article claim?', answer: 'That the foundation is stable.' }],
    }, base) as any

    expect(understanding.entities[0].citations[0]).toEqual({
      sourceId: 'source-old', quote: 'quoted evidence', version: 1, start: 4, end: 19,
    })
    expect(understanding.relations[0].semantic).toBe('causes')
  })

  it('rejects understanding reports with uncited support, dangling entities, or unknown sources', () => {
    const base = migratedWorkspace()
    const report = {
      documentType: 'article',
      summary: '',
      coverage: { analyzedSourceIds: ['source-old'], skippedSourceIds: [], omissions: [] },
      entities: [
        { id: 'entity-a', title: 'A', kind: 'concept', description: '', certainty: 'supported', citations: [] },
      ],
      relations: [],
      suggestedViews: [],
      gaps: [],
      questions: [],
    }
    expect(() => validateUnderstandingData(report, base)).toThrow(/supported entity must cite/)

    const withCite = structuredClone(report)
    withCite.entities[0].citations = [{ sourceId: 'source-old', quote: 'quoted evidence' }]
    withCite.relations = [{ id: 'rel-x', from: 'entity-a', to: 'missing', semantic: 'supports', label: '', certainty: 'inferred', citations: [] }]
    expect(() => validateUnderstandingData(withCite, base)).toThrow(/existing entities/)

    const badCoverage = structuredClone(withCite)
    badCoverage.relations = []
    badCoverage.coverage.analyzedSourceIds = ['nope']
    expect(() => validateUnderstandingData(badCoverage, base)).toThrow(/missing source/)

    const badQuote = structuredClone(withCite)
    badQuote.relations = []
    badQuote.entities[0].citations = [{ sourceId: 'source-old', quote: 'not in the source' }]
    expect(() => validateUnderstandingData(badQuote, base)).toThrow(/exact substring/)
  })
})
