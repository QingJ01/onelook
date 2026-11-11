import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureWorkspace } from './fixtures'

function legacyWorkspace() {
  const current = fixtureWorkspace('architecture')
  const {
    revision: _revision, views: _views, flows: _flows, decisions: _decisions, productItems: _product,
    template, question: _question, takeaway: _takeaway, audience: _audience, story: _story, ...common
  } = current
  return {
    ...common, schemaVersion: 1, scenario: template, path: current.nodes.map(node => node.id),
    sources: current.sources.map(({ version: _v, versions: _old, ...source }) => source),
    nodes: current.nodes.map(({ certainty: _certainty, ...node }) => ({ ...node, x: 42, y: 84, citations: node.citations.map(({ sourceId, quote }) => ({ sourceId, quote })) })),
    questions: current.questions.map(({ relatedNodeIds: _related, stepId: _step, ...question }) => question),
    attempts: [],
  }
}

function v2Workspace() {
  const current = fixtureWorkspace('product')
  const { template, question: _question, takeaway: _takeaway, audience: _audience, story: _story, ...common } = current
  return {
    ...common, schemaVersion: 2, revision: 4, scenario: template,
    nodes: current.nodes.map(({ certainty: _certainty, ...node }) => node),
    views: current.views.map(({ form: _form, ...view }) => ({ ...view, scenario: template, kind: 'flow', path: current.nodes.map(node => node.id) })),
    questions: current.questions.map(({ stepId: _step, ...item }) => item),
  }
}

function v2Database() {
  const db = new Dexie('OneLookWorkbench')
  db.version(2).stores({ workspaces: '&id,updatedAt', revisions: '&id,workspaceId,createdAt', migrationBackups: '&id,workspaceId,createdAt' })
  return db
}

function v1Database() {
  const db = new Dexie('OneLookWorkbench')
  db.version(1).stores({ workspaces: '&id,updatedAt', revisions: '&id,workspaceId,createdAt' })
  return db
}

beforeEach(async () => { await Dexie.delete('OneLookWorkbench'); vi.resetModules() })
afterEach(async () => { await Dexie.delete('OneLookWorkbench') })

describe('atomic IndexedDB upgrades', () => {
  it('preserves the raw migration backup and prevents stale clients resurrecting deleted migrated data', async () => {
    const raw = legacyWorkspace(), old = v1Database()
    await old.table('workspaces').add(raw); old.close()
    const storage = await import('../../src/workbench/storage')
    const migrated = (await storage.getWorkspace(raw.id))!
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.revision).toBe(1)
    expect(migrated.story.map(step => step.reveal)).toEqual(raw.path.map(id => [id]))
    expect(migrated.views[0].positions[raw.nodes[0].id]).toEqual({ x: 42, y: 84 })
    expect((await storage.listMigrationBackups(raw.id))[0].snapshot).toEqual(raw)
    for (let i = 0, doc = migrated; i < 22; i++) doc = await storage.saveWorkspace({ ...doc, summary: String(i) }, 'Edit', doc.revision)
    expect(await storage.listRevisions(raw.id)).toHaveLength(20)
    expect(await storage.listMigrationBackups(raw.id)).toHaveLength(1)
    const latest = (await storage.getWorkspace(raw.id))!
    await storage.deleteWorkspace(raw.id, latest.revision)
    await expect(storage.saveWorkspace(migrated, 'Stale edit', migrated.revision)).rejects.toMatchObject({ name: 'ConflictError' })
    expect(await storage.getWorkspace(raw.id)).toBeUndefined()
    expect(await storage.listMigrationBackups(raw.id)).toHaveLength(1)
  })

  it('rolls back the entire upgrade when a later row is invalid', async () => {
    const raw = legacyWorkspace(), invalid = { ...legacyWorkspace(), id: 'invalid-migration', title: 42 }
    const old = v1Database(); await old.table('workspaces').bulkAdd([raw, invalid]); old.close()
    const storage = await import('../../src/workbench/storage')
    await expect(storage.listWorkspaces()).rejects.toThrow(/title/)
    const preserved = v1Database()
    await preserved.open()
    expect(preserved.verno).toBe(1)
    expect(await preserved.table('workspaces').get(raw.id)).toEqual(raw)
    expect(await preserved.table('workspaces').get(invalid.id)).toEqual(invalid)
    expect(preserved.tables.map(table => table.name)).not.toContain('migrationBackups')
    preserved.close()
  })

  it('upgrades stored V2 workspaces and revisions to V3, keeping the raw V2 row as a migration backup', async () => {
    const raw = v2Workspace(), old = v2Database()
    await old.table('workspaces').add(raw)
    await old.table('revisions').add({ id: 'revision-old', workspaceId: raw.id, createdAt: 50, label: 'Earlier', snapshot: { ...raw, revision: 3, summary: 'Earlier summary.' } })
    old.close()
    const storage = await import('../../src/workbench/storage')
    const migrated = (await storage.getWorkspace(raw.id))!
    expect(migrated).toMatchObject({ schemaVersion: 3, revision: 4, template: 'product', question: '', takeaway: '' })
    expect(migrated.views[0]).toMatchObject({ form: 'graph', positions: raw.views[0].positions })
    expect(migrated.views[0]).not.toHaveProperty('path')
    expect(migrated.story.map(step => [step.title, step.stageId, step.reveal])).toEqual(raw.nodes.map(node => [node.title, raw.views[0].id, [node.id]]))
    expect(migrated.questions.map(item => item.stepId)).toEqual(migrated.story.map(step => step.id))
    expect(migrated.nodes.map(node => node.certainty)).toEqual(['supported', 'unverified'])
    expect(migrated.attempts).toEqual(raw.attempts)
    const backups = await storage.listMigrationBackups(raw.id)
    expect(backups).toHaveLength(1)
    expect(backups[0].snapshot).toEqual(raw)
    const revisions = await storage.listRevisions(raw.id)
    expect(revisions[0].snapshot).toMatchObject({ schemaVersion: 3, summary: 'Earlier summary.' })
    const saved = await storage.saveWorkspace({ ...migrated, question: 'How does it work?' }, 'Edit', migrated.revision)
    expect(saved).toMatchObject({ revision: 5, question: 'How does it work?' })
  })
})
