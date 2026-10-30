import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'
import { db as legacyDb, documentService } from '../../src/services/db'
import {
  deleteWorkspace,
  getWorkspace,
  listRevisions,
  listWorkspaces,
  restoreRevision,
  saveWorkspace,
} from '../../src/workbench/storage'
import { fixtureWorkspace } from './fixtures'

describe('workbench IndexedDB storage', () => {
  it('round-trips detached workspace data and sorts workspaces by updated time', async () => {
    const older = fixtureWorkspace('architecture')
    const newer = fixtureWorkspace('product')
    older.updatedAt = 100
    newer.updatedAt = 200
    await saveWorkspace(older)
    await saveWorkspace(newer)
    older.summary = 'Mutated after saving'

    expect((await getWorkspace(older.id))?.summary).toBe('A short fixture.')
    const listed = await listWorkspaces()
    const selected = listed.filter(item => [older.id, newer.id].includes(item.id))
    expect(selected.map(item => item.id)).toEqual([newer.id, older.id])
  })

  it('stores labeled snapshots transactionally and retains only the newest twenty', async () => {
    const workspace = fixtureWorkspace('architecture')
    let timestamp = 10_000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => timestamp++)
    try {
      let saved = await saveWorkspace(workspace)
      for (let index = 1; index <= 22; index += 1) {
        saved = await saveWorkspace({ ...saved, summary: `Version ${index}`, updatedAt: index + 1 }, `Edit ${index}`, saved.revision)
      }
      const revisions = await listRevisions(workspace.id)
      expect(revisions).toHaveLength(20)
      expect(revisions[0]?.createdAt).toBeGreaterThan(revisions.at(-1)!.createdAt)
      expect(revisions.map(revision => revision.label)).not.toContain('Edit 1')
      expect(revisions[0]?.snapshot.summary).toBe('Version 21')
    } finally {
      now.mockRestore()
    }
  })

  it('uses compare-and-swap to reject a stale concurrent client', async () => {
    const workspace = fixtureWorkspace('architecture')
    const saved = await saveWorkspace(workspace)
    const left = { ...saved, summary: 'Client A' }
    const right = { ...saved, summary: 'Client B' }
    const results = await Promise.allSettled([
      saveWorkspace(left, undefined, saved.revision),
      saveWorkspace(right, undefined, saved.revision),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((await getWorkspace(workspace.id))?.revision).toBe(saved.revision + 1)
  })

  it('restores a snapshot while retaining only still-valid attempts and backing up current content', async () => {
    const original = fixtureWorkspace('course')
    original.attempts = [{
      id: 'attempt-old',
      questionId: 'question-a',
      answer: 'Earlier attempt',
      rating: 'good',
      at: 1000,
      dueAt: 2000,
      errorReason: '',
    }]
    const first = await saveWorkspace(original)

    const current = {
      ...original,
      summary: 'Current content',
      questions: [
        ...original.questions,
        { id: 'question-new', nodeId: 'node-b', prompt: 'New?', answer: 'New answer.', relatedNodeIds: [] },
      ],
      attempts: [
        ...original.attempts,
        { id: 'attempt-new', questionId: 'question-new', answer: 'New attempt', rating: 'again' as const, at: 3000, dueAt: 4000, errorReason: '' },
      ],
    }
    const savedCurrent = await saveWorkspace({ ...current, revision: first.revision }, 'Current version', first.revision)
    const [snapshot] = await listRevisions(original.id)
    expect(snapshot).toBeDefined()

    const restored = await restoreRevision(snapshot!, savedCurrent.revision)
    expect(restored.summary).toBe(original.summary)
    expect(restored.createdAt).toBe(original.createdAt)
    expect(restored.attempts).toEqual(original.attempts)
    expect((await getWorkspace(original.id))?.summary).toBe(original.summary)
    expect((await listRevisions(original.id)).some(revision => revision.label === 'Before restore: Current version')).toBe(true)
  })

  it('deletes a workspace and its revisions together', async () => {
    const workspace = fixtureWorkspace('product')
    const first = await saveWorkspace(workspace)
    const saved = await saveWorkspace({ ...first, summary: 'Edited' }, 'Edit', first.revision)
    await deleteWorkspace(workspace.id, saved.revision)
    expect(await getWorkspace(workspace.id)).toBeUndefined()
    expect(await listRevisions(workspace.id)).toEqual([])
  })

  it('rejects corrupted stored rows without overwriting the good record', async () => {
    const workspace = fixtureWorkspace('architecture')
    const saved = await saveWorkspace(workspace)
    await expect(saveWorkspace({
      ...workspace,
      title: 'Invalid replacement',
      relations: [{ ...workspace.relations[0], to: 'missing-node' }],
    })).rejects.toThrow()
    expect(await getWorkspace(workspace.id)).toEqual(saved)

    const corruption = new Dexie('OneLookWorkbench')
    corruption.version(1).stores({
      workspaces: '&id,updatedAt',
      revisions: '&id,workspaceId,createdAt',
    })
    await corruption.open()
    await corruption.table('workspaces').put({ ...workspace, title: 42 })
    await corruption.close()

    await expect(getWorkspace(workspace.id)).rejects.toThrow(/title/)
    const after = new Dexie('OneLookWorkbench')
    after.version(1).stores({
      workspaces: '&id,updatedAt',
      revisions: '&id,workspaceId,createdAt',
    })
    await after.open()
    expect((await after.table('workspaces').get(workspace.id)).title).toBe(42)
    await after.close()
  })

  it('keeps the legacy OneLookDB v1 documents available and separate', async () => {
    const document = {
      id: `legacy-${crypto.randomUUID()}`,
      name: 'Original mind map',
      updatedAt: 0,
      nodes: [],
    }
    expect(legacyDb.verno).toBe(1)
    await documentService.save(document as never)
    const workspace = fixtureWorkspace('course')
    await saveWorkspace(workspace)
    expect((await documentService.get(document.id))?.name).toBe(document.name)
    expect(await getWorkspace(workspace.id)).toBeDefined()
  })
})
