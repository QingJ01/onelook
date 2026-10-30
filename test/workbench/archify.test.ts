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
      if (scenario === 'architecture') {
        expect(ir.connections).toHaveLength(workspace.relations.length)
      } else if (scenario === 'product') {
        expect(ir.edges).toHaveLength(workspace.relations.length)
      } else {
        expect(ir.nodes).toHaveLength(workspace.nodes.length)
      }
    }
  }, 120_000)

  it('preserves the source graph relationships in its deterministic IR mapping', () => {
    const workspace = exampleWorkspace('architecture')
    const ir = mapWorkspaceToIR(workspace)
    expect(ir.diagram_type).toBe('architecture')
    expect(ir.connections.map(edge => [edge.from, edge.to])).toEqual(
      workspace.relations.map((relation, index) => [`node_${workspace.nodes.findIndex(node => node.id === relation.from) + 1}`, `node_${workspace.nodes.findIndex(node => node.id === relation.to) + 1}`]),
    )
  })
})
