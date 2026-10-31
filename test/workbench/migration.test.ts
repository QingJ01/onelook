import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureWorkspace } from './fixtures'

function legacyWorkspace() {
  const current = fixtureWorkspace('architecture')
  const { revision: _revision, views, flows: _flows, decisions: _decisions, productItems: _product, ...common } = current
  return {
    ...common, schemaVersion: 1, path: views[0].path,
    sources: current.sources.map(({ version: _v, versions: _old, ...source }) => source),
    nodes: current.nodes.map(node => ({ ...node, x: 42, y: 84, citations: node.citations.map(({ sourceId, quote }) => ({ sourceId, quote })) })),
    questions: current.questions.map(({ relatedNodeIds: _related, ...question }) => question),
    attempts: [],
  }
}

function v1Database() {
  const db = new Dexie('OneLookWorkbench')
  db.version(1).stores({ workspaces: '&id,updatedAt', revisions: '&id,workspaceId,createdAt' })
  return db
}

beforeEach(async () => { await Dexie.delete('OneLookWorkbench'); vi.resetModules() })
afterEach(async () => { await Dexie.delete('OneLookWorkbench') })

describe('atomic IndexedDB V1 upgrade', () => {
  it('preserves the raw migration backup and prevents stale clients resurrecting deleted migrated data', async () => {
    const raw = legacyWorkspace(), old = v1Database()
    await old.table('workspaces').add(raw); old.close()
    const storage = await import('../../src/workbench/storage')
    const migrated = (await storage.getWorkspace(raw.id))!
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.revision).toBe(1)
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
})
