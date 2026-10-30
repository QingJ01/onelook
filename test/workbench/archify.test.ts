import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { archifyAvailable, mapWorkspaceToIR, renderWorkspace } from '../../server/archify.mjs'
import { exampleWorkspace } from '../../src/workbench/examples'
import type { Scenario } from '../../src/workbench/types'

const archifyRoot = path.resolve(process.env.ARCHIFY_ROOT || path.join(process.cwd(), '.cache', 'archify'))
const canRender = archifyAvailable(archifyRoot)

describe('Archify upstream render integration', () => {
  it.skipIf(!canRender)('validates, renders, and delivers all three example workspaces with the pinned CLI', async () => {
    const expected = new Map<Scenario, string>([
      ['architecture', 'architecture'],
      ['product', 'workflow'],
      ['course', 'tree'],
    ])
    for (const scenario of ['architecture', 'product', 'course'] as const) {
      const workspace = exampleWorkspace(scenario)
      const { html, ir } = await renderWorkspace(workspace, { archifyRoot })
      expect(ir.diagram_type).toBe(expected.get(scenario))
      expect(html).toMatch(/<html(?:\s|>)/i)
      const firstNode = workspace.nodes[0]!
      const firstSource = workspace.sources.find(source => source.id === firstNode.citations[0]?.sourceId)!
      const firstCard = ir.cards.find(card => card.title === firstNode.title)!
      expect(firstCard.items).toContain('Provenance: Demo content; not external evidence.')
      expect(firstCard.items.some(item => item.includes(`Citation from ${firstSource.title} (v1, current`))).toBe(true)
      if (scenario === 'architecture') {
        expect(ir.connections).toHaveLength(workspace.relations.length)
      } else if (scenario === 'product') {
        expect(ir.edges).toHaveLength(workspace.relations.length)
      } else {
        expect(ir.nodes).toHaveLength(workspace.nodes.length)
      }
    }
  }, 120_000)

  it.skipIf(!canRender)('keeps citation text in cards and safely escapes it in delivered HTML', async () => {
    const workspace = exampleWorkspace('architecture')
    const source = workspace.sources[0]!
    const node = workspace.nodes[0]!
    const quote = '<img src=x onerror=alert(1)>'
    source.title = 'Material <svg onload="alert(1)">'
    source.text += `\n${quote}`
    const start = source.text.indexOf(quote)
    node.citations = [{ sourceId: source.id, quote, version: source.version, start, end: start + quote.length }]

    const { html, ir } = await renderWorkspace(workspace, { archifyRoot })
    const card = ir.cards.find(item => item.title === node.title)!
    expect(card.items.some(item => item.includes(`Citation from ${source.title} (v1, current`))).toBe(true)
    expect(html).toContain('&lt;svg onload=&quot;alert(1)&quot;&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<svg onload="alert(1)">')
  }, 120_000)

  it('preserves the source graph relationships in its deterministic IR mapping', () => {
    const workspace = exampleWorkspace('architecture')
    const ir = mapWorkspaceToIR(workspace)
    expect(ir.diagram_type).toBe('architecture')
    expect(ir.connections.map(edge => [edge.from, edge.to])).toEqual(
      workspace.relations.map((relation, index) => [`node_${workspace.nodes.findIndex(node => node.id === relation.from) + 1}`, `node_${workspace.nodes.findIndex(node => node.id === relation.to) + 1}`]),
    )
  })

  it('maps only the selected view and rejects an unknown view id', () => {
    const workspace = exampleWorkspace('architecture')
    const secondView = {
      ...workspace.views[0]!,
      id: 'view-second',
      title: 'Subset',
      nodeIds: [workspace.nodes[0]!.id],
      path: [workspace.nodes[0]!.id],
      positions: { [workspace.nodes[0]!.id]: workspace.views[0]!.positions[workspace.nodes[0]!.id]! },
    }
    workspace.views.push(secondView)
    const selected = mapWorkspaceToIR(workspace, secondView.id)
    expect(selected.components).toHaveLength(1)
    expect(selected.connections).toHaveLength(0)
    expect(() => mapWorkspaceToIR(workspace, 'missing-view')).toThrow(/Unknown workspace view/)
  })
})
