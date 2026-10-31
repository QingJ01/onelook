import { createWorkspace, makeNode, validateWorkspace } from '../../src/workbench/model'
import type { Scenario, Workspace } from '../../src/workbench/types'

export function fixtureWorkspace(
  scenario: Scenario = 'course',
  id = `workspace-${crypto.randomUUID()}`,
): Workspace {
  const base = createWorkspace(scenario, 'Sample workspace')
  const source = {
    id: 'source-1',
    title: 'Sample material',
    text: 'Foundation definition is stable and cited exactly.',
    version: 1,
    createdAt: 100,
    versions: [],
  }
  const quote = 'Foundation definition'
  const first = {
    ...makeNode('Foundation'),
    id: 'node-a',
    body: 'A foundational idea.',
    citations: [{
      sourceId: source.id,
      quote,
      version: 1,
      start: source.text.indexOf(quote),
      end: source.text.indexOf(quote) + quote.length,
    }],
  }
  const second = {
    ...makeNode('Application'),
    id: 'node-b',
    body: 'An applied idea.',
  }
  return validateWorkspace({
    ...base,
    revision: 0,
    id,
    summary: 'A short fixture.',
    sources: [source],
    nodes: [first, second],
    relations: [{
      id: 'edge-a',
      from: first.id,
      to: second.id,
      kind: scenario === 'product' ? 'next' : scenario === 'course' ? 'prerequisite' : 'depends',
      label: 'extends',
    }],
    views: [{
      ...base.views[0],
      nodeIds: [first.id, second.id],
      path: [first.id, second.id],
      positions: {
        [first.id]: { x: 10, y: 20 },
        [second.id]: { x: 30, y: 40 },
      },
    }],
    flows: [],
    decisions: [],
    productItems: [],
    questions: [
      { id: 'question-a', nodeId: first.id, prompt: 'What is the foundation?', answer: 'A base idea.', relatedNodeIds: [] },
      { id: 'question-b', nodeId: second.id, prompt: 'How is it applied?', answer: 'In a later context.', relatedNodeIds: [] },
    ],
    createdAt: 100,
    updatedAt: 200,
  })
}

export function generatedFixture() {
  return {
    title: 'Generated workspace',
    summary: 'A validated first draft.',
    nodes: [
      {
        id: 'generated-a',
        title: 'Generated concept',
        kind: 'concept',
        body: 'A generated description.',
        example: '',
        pitfall: '',
        notes: '',
        acceptance: '',
        citations: [],
        provenance: 'ai',
      },
    ],
    relations: [],
    path: ['generated-a'],
    questions: [
      { id: 'generated-question', nodeId: 'generated-a', prompt: 'What is it?', answer: 'A concept.' },
    ],
  }
}
