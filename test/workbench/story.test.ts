import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApplicationServer } from '../../server/index.mjs'
import { validateOutlineData } from '../../shared/validation.mjs'
import { checkClarity } from '../../src/workbench/clarity'
import { importClassicMap, isClassicMap } from '../../src/workbench/classic'
import { exampleWorkspace } from '../../src/workbench/examples'
import { layoutView, ROOT_ID, timelineOrder } from '../../src/workbench/layout'
import { applyOutline, makeStep, makeView, repairStory, stageStateAt, validateWorkspace } from '../../src/workbench/model'
import { exportPlayerHtml, playerData } from '../../src/workbench/player'
import { templates, type Template } from '../../src/workbench/types'
import { fixtureWorkspace } from './fixtures'

const outline = () => ({
  question: 'How does the idea build up?',
  takeaway: 'The application rests on the foundation.',
  audience: '',
  steps: [
    { title: 'Foundation first', narration: 'Start here.', form: 'tree', reveal: ['node-a'], focus: ['node-a'], citations: [{ sourceId: 'source-1', quote: 'Foundation definition' }] },
    { title: 'Then the application', narration: 'Inferred from the foundation.', form: 'flow', reveal: ['node-b'], focus: ['node-a', 'node-b'], citations: [] },
  ],
})

describe('explanation story', () => {
  it('every built-in example is a valid, playable explanation with no clarity warnings', () => {
    for (const template of Object.keys(templates) as Template[]) {
      const workspace = exampleWorkspace(template)
      expect(workspace.template).toBe(template)
      expect(workspace.question).not.toBe('')
      expect(workspace.story.length).toBeGreaterThanOrEqual(4)
      expect(checkClarity(workspace).filter(issue => issue.level === 'warn')).toEqual([])
      expect(playerData(workspace).steps).toHaveLength(workspace.story.length)
    }
  })

  it('accumulates what each step has shown on its stage and defaults focus to what it introduces', () => {
    const workspace = fixtureWorkspace()
    expect(stageStateAt(workspace, 0)).toEqual({ stageId: workspace.views[0]!.id, visible: ['node-a'], focus: ['node-a'] })
    expect(stageStateAt(workspace, 1)).toEqual({ stageId: workspace.views[0]!.id, visible: ['node-a', 'node-b'], focus: ['node-a', 'node-b'] })
    expect(stageStateAt(workspace, 2)).toBeUndefined()

    // An object introduced on one view stays known when a later step switches to another view.
    const second = makeView(workspace, 'matrix', 'Compare')
    const withView = validateWorkspace({ ...workspace, views: [...workspace.views, second] })
    const step = { ...makeStep(withView, second.id, 'Compare them'), reveal: ['node-b'] }
    const story = [withView.story[0]!, step]
    const switched = validateWorkspace({ ...withView, story, questions: withView.questions.map(question => ({ ...question, stepId: '' })) })
    expect(stageStateAt(switched, 1)).toEqual({ stageId: second.id, visible: ['node-a', 'node-b'], focus: ['node-b'] })
  })

  it('repairs story references when a stage or an object leaves a view', () => {
    const workspace = fixtureWorkspace()
    const second = makeView(workspace, 'tree', 'Tree')
    const draft = structuredClone(validateWorkspace({ ...workspace, views: [...workspace.views, second] }))
    draft.story[1]!.stageId = second.id
    expect(validateWorkspace(draft).story[1]!.stageId).toBe(second.id)
    draft.views = draft.views.filter(view => view.id !== second.id)
    draft.views[0]!.nodeIds = ['node-b']
    draft.views[0]!.positions = { 'node-b': { x: 1, y: 2 } }
    draft.story = draft.story.filter(step => step.id !== 'step-a')
    expect(() => validateWorkspace(draft)).toThrow()
    expect(repairStory(draft)).toBe(1)
    const repaired = validateWorkspace(draft)
    expect(repaired.story).toMatchObject([{ id: 'step-b', stageId: repaired.views[0]!.id, reveal: ['node-b'], focus: ['node-b'] }])
    expect(repaired.questions.map(question => question.stepId)).toEqual(['', 'step-b'])
  })

  it('reports deterministic clarity issues and clears them when the story is fixed', () => {
    const workspace = fixtureWorkspace()
    const rules = (value: typeof workspace) => checkClarity(value).map(issue => issue.rule)
    expect(rules(workspace)).toEqual(['question', 'takeaway', 'basis'])

    const messy = validateWorkspace({
      ...workspace,
      question: 'Q', takeaway: 'T',
      story: [
        { ...workspace.story[1]!, title: 'Apply it；and define it', narration: 'Uses Foundation before it appears.', focus: ['node-a', 'node-b'] },
        workspace.story[0]!,
      ],
    })
    const issues = checkClarity(messy)
    expect(issues.map(issue => issue.rule)).toEqual(['points', 'order', 'order', 'order', 'basis'])
    expect(issues.filter(issue => issue.rule === 'order').map(issue => issue.message).join('\n')).toMatch(/聚焦了还没出现的「Foundation」[\s\S]*讲述用到了「Foundation」[\s\S]*先修「Foundation」/)

    const crowded = validateWorkspace({
      ...workspace, question: 'Q', takeaway: 'T',
      nodes: [...workspace.nodes, ...Array.from({ length: 5 }, (_, index) => ({ ...workspace.nodes[1]!, id: `extra-${index}`, title: `Extra ${index}`, certainty: 'inferred' as const }))],
    })
    crowded.views[0]!.nodeIds.push(...Array.from({ length: 5 }, (_, index) => `extra-${index}`))
    crowded.story[1]!.reveal.push(...Array.from({ length: 5 }, (_, index) => `extra-${index}`))
    expect(checkClarity(validateWorkspace(crowded)).map(issue => issue.rule)).toContain('load')

    const clean = validateWorkspace({ ...workspace, question: 'Q', takeaway: 'T', nodes: workspace.nodes.map(node => ({ ...node, certainty: node.citations.length ? 'supported' as const : 'inferred' as const })) })
    expect(checkClarity(clean)).toEqual([])
    expect(checkClarity(validateWorkspace({ ...clean, story: [], questions: clean.questions.map(question => ({ ...question, stepId: '' })) })).map(issue => issue.rule)).toEqual(['steps'])
  })

  it('lays the same objects out as a graph, flow, mind map and timeline', () => {
    const workspace = exampleWorkspace('course')
    const input = { nodeIds: workspace.nodes.map(node => node.id), relations: workspace.relations, title: workspace.title }
    const overlaps = (layout: ReturnType<typeof layoutView>) => {
      const boxes = Object.values(layout.boxes)
      return boxes.some((a, i) => boxes.some((b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h))
    }
    for (const form of ['graph', 'flow', 'tree', 'timeline'] as const) {
      const layout = layoutView({ ...input, form })
      expect(Object.keys(layout.boxes)).toHaveLength(6)
      expect(overlaps(layout)).toBe(false)
      for (const box of Object.values(layout.boxes)) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.w).toBeLessThanOrEqual(layout.width)
        expect(box.y + box.h).toBeLessThanOrEqual(layout.height)
      }
    }
    const flow = layoutView({ ...input, form: 'flow' })
    expect(flow.boxes['node-1']!.y).toBeLessThan(flow.boxes['node-2']!.y)
    const graph = layoutView({ ...input, form: 'graph', positions: { 'node-1': { x: 700, y: 500 } } })
    expect(graph.boxes['node-1']).toMatchObject({ x: 700, y: 500 })
    expect(graph.edges).toHaveLength(workspace.relations.length)

    const tree = layoutView({ ...input, form: 'tree' })
    expect(tree.root).toBeUndefined()
    expect(tree.boxes['node-1']!.x).toBeLessThan(tree.boxes['node-2']!.x)
    expect(tree.edges.every(edge => !edge.cross)).toBe(true)

    // Supports/contradicts point at the claim, so the claim is the parent; several roots get a centre topic.
    const book = exampleWorkspace('book')
    const argument = layoutView({ form: 'tree', nodeIds: book.nodes.map(node => node.id), relations: book.relations, title: book.title })
    expect(argument.root).toBeUndefined()
    expect(argument.boxes['node-1']!.x).toBeLessThan(argument.boxes['node-2']!.x)
    const forest = layoutView({ form: 'tree', nodeIds: ['node-2', 'node-3'], relations: book.relations, title: 'Topic' })
    expect(forest.root?.title).toBe('Topic')
    expect(forest.edges.map(edge => edge.from)).toEqual([ROOT_ID, ROOT_ID])

    expect(timelineOrder(['node-3', 'node-2', 'node-1'], workspace.relations)).toEqual(['node-1', 'node-2', 'node-3'])
    expect(layoutView({ ...input, form: 'timeline' }).axis?.ticks).toHaveLength(6)
  })

  it('exports a self-contained offline player that cannot run injected markup', () => {
    const workspace = exampleWorkspace('architecture')
    workspace.title = 'Login </script><script>alert(1)</script>'
    workspace.story[0]!.narration = '<img src=x onerror=alert(2)> & more'
    const html = exportPlayerHtml(validateWorkspace(workspace))
    expect(html).toContain("default-src 'none'")
    expect(html).not.toMatch(/<script[^>]*\ssrc=|<link\b|@import|url\((?!#)|fetch\(|XMLHttpRequest|<iframe|<img/)
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    expect(html).toContain('<title>Login &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>')
    const json = html.match(/<script type="application\/json" id="onelook-data">([\s\S]*?)<\/script>/)![1]!
    const data = JSON.parse(json)
    expect(data.steps[0].narration).toBe('<img src=x onerror=alert(2)> & more')
    expect(data.steps.map((step: { visible: string[] }) => step.visible.length)).toEqual([2, 4, 5, 6, 0, 0])
    expect(Object.values(data.stages).map((stage: any) => stage.type)).toEqual(['diagram', 'block', 'block'])
    expect(data.steps[0].questions).toHaveLength(1)
  })

  it('imports a classic mind map one way as a tree explanation', () => {
    const classic = {
      id: 'doc', name: 'Classic map', layout: 'mind', theme: 'light', createdAt: 1, updatedAt: 2, version: '1.0.0',
      root: { id: 'r', text: 'Root topic', isExpanded: true, children: [
        { id: 'a', text: 'Branch A', isExpanded: true, data: { note: 'A note' }, children: [{ id: 'a1', text: 'Leaf A1', isExpanded: true, children: [] }] },
        { id: 'b', text: '  ', isExpanded: true, children: [] },
      ] },
    }
    expect(isClassicMap(classic)).toBe(true)
    expect(isClassicMap({ document: classic })).toBe(true)
    expect(isClassicMap(fixtureWorkspace())).toBe(false)
    const workspace = importClassicMap({ version: '1.0.0', app: 'OneLook', document: classic })
    expect(workspace).toMatchObject({ title: 'Classic map', template: 'concept', views: [{ form: 'tree' }] })
    expect(workspace.nodes.map(node => node.title)).toEqual(['Root topic', 'Branch A', 'Leaf A1', '未命名'])
    expect(workspace.nodes[1]!.body).toBe('A note')
    expect(workspace.relations.every(relation => relation.kind === 'partOf')).toBe(true)
    expect(workspace.story.map(step => [step.title, step.reveal.length])).toEqual([['Root topic', 3], ['Branch A', 1]])
    expect(checkClarity(workspace).filter(issue => issue.rule === 'order' || issue.rule === 'unused')).toEqual([])
    const layout = layoutView({ form: 'tree', nodeIds: workspace.views[0]!.nodeIds, relations: workspace.relations })
    expect(layout.root).toBeUndefined()
    expect(layout.boxes['classic-1']!.x).toBeLessThan(layout.boxes['classic-3']!.x)

    const wide = { name: 'Too big', root: { text: 'r', children: Array.from({ length: 200 }, (_, index) => ({ text: `n${index}`, children: [] })) } }
    expect(() => importClassicMap(wide)).toThrow(/超过 200 个节点/)
    expect(() => importClassicMap({ nope: true })).toThrow(/不是经典导图/)
  })

  it('validates and applies an AI outline without touching objects', () => {
    const workspace = fixtureWorkspace()
    const validated = validateOutlineData(outline(), workspace) as any
    expect(validated.steps[0].citations[0]).toMatchObject({ sourceId: 'source-1', version: 1, start: 0, end: 21 })
    const applied = applyOutline(workspace, outline())
    expect(applied.nodes).toEqual(workspace.nodes)
    expect(applied).toMatchObject({ question: 'How does the idea build up?', takeaway: 'The application rests on the foundation.' })
    expect(applied.views.map(view => view.form)).toEqual(['graph', 'tree', 'flow'])
    expect(applied.views[1]!.nodeIds).toEqual(['node-a'])
    expect(applied.views[2]!.nodeIds).toEqual(['node-b', 'node-a'])
    expect(applied.story.map(step => [step.title, step.provenance, step.reveal])).toEqual([['Foundation first', 'ai', ['node-a']], ['Then the application', 'ai', ['node-b']]])
    expect(applied.questions.map(question => question.stepId)).toEqual(applied.story.map(step => step.id))
    expect(stageStateAt(applied, 1)?.visible.sort()).toEqual(['node-a', 'node-b'])

    const bad = (change: (value: ReturnType<typeof outline>) => void) => { const value = outline(); change(value); return () => validateOutlineData(value, workspace) }
    expect(bad(value => { value.steps[1]!.reveal = ['node-a'] })).toThrow(/twice/)
    expect(bad(value => { value.steps[0]!.focus = ['node-b'] })).toThrow(/before it is introduced/)
    expect(bad(value => { value.steps[0]!.reveal = ['ghost'] })).toThrow(/missing node/)
    expect(bad(value => { value.steps[0]!.citations = [{ sourceId: 'source-1', quote: 'not in the source' }] })).toThrow(/exact substring/)
    expect(bad(value => { value.steps[0]!.form = 'spiral' })).toThrow(/must be one of/)
    expect(bad(value => { value.steps = [] })).toThrow(/at least one step/)
    expect(bad(value => { value.takeaway = '' })).toThrow(/takeaway/)
  })
})

describe('outline and restep endpoints with a controlled provider', () => {
  const servers: Array<ReturnType<typeof createApplicationServer>> = []
  afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))) })
  const settings = { baseUrl: 'https://api.openai.com/v1', model: 'mock-model', apiKey: 'secret-key-never-returned' }
  async function call(path: string, body: unknown, content: unknown) {
    const provider = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 }))
    const server = createApplicationServer({ allowedHosts: new Set(['api.openai.com']), fetchImpl: provider, archifyRoot: '/does-not-exist' })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify(body) })
    return { response, text: await response.text(), provider }
  }

  it('returns a validated outline and sends only objects, relations and current sources', async () => {
    const workspace = fixtureWorkspace()
    const { response, text, provider } = await call('/api/outline', { workspace, settings }, outline())
    expect(response.status).toBe(200)
    expect(text).not.toContain(settings.apiKey)
    expect(JSON.parse(text).outline.steps).toHaveLength(2)
    const sent = JSON.parse(JSON.parse(String(provider.mock.calls[0]![1]!.body)).messages[1].content)
    expect(Object.keys(sent).sort()).toEqual(['nodes', 'question', 'relations', 'sources', 'summary', 'template', 'title'])
    expect(sent.nodes[0]).toEqual({ id: 'node-a', title: 'Foundation', kind: 'concept', body: 'A foundational idea.', certainty: 'supported' })
  })

  it('rejects an outline that invents objects, and outlines for an empty explanation', async () => {
    const workspace = fixtureWorkspace()
    const invented = outline(); invented.steps[0]!.reveal = ['invented-node']
    expect((await call('/api/outline', { workspace, settings }, invented)).response.status).toBeGreaterThanOrEqual(400)
    const empty = validateWorkspace({ ...workspace, nodes: [], relations: [], story: [], questions: [], views: workspace.views.map(view => ({ ...view, nodeIds: [], positions: {} })) })
    const { response, provider } = await call('/api/outline', { workspace: empty, settings }, outline())
    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it('rewrites one step narration and validates the step and mode before calling the provider', async () => {
    const workspace = fixtureWorkspace()
    const ok = await call('/api/restep', { workspace, settings, stepId: 'step-a', mode: 'analogy' }, { narration: '类比，非原文：像打地基。' })
    expect(ok.response.status).toBe(200)
    expect(JSON.parse(ok.text)).toEqual({ narration: '类比，非原文：像打地基。' })
    const sent = JSON.parse(JSON.parse(String(ok.provider.mock.calls[0]![1]!.body)).messages[1].content)
    expect(sent).toMatchObject({ mode: 'analogy', step: { title: 'Start from the foundation' }, nodes: [{ id: 'node-a' }] })
    expect(sent).not.toHaveProperty('sources')
    for (const body of [{ workspace, settings, stepId: 'missing', mode: 'simpler' }, { workspace, settings, stepId: 'step-a', mode: 'poem' }]) {
      const bad = await call('/api/restep', body, { narration: 'x' })
      expect(bad.response.status).toBe(400)
      expect(bad.provider).not.toHaveBeenCalled()
    }
    expect((await call('/api/restep', { workspace, settings, stepId: 'step-a', mode: 'simpler' }, { narration: '' })).response.status).toBe(502)
  })
})
