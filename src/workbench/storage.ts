import Dexie, { type Table } from 'dexie'
import {
  validateRevisionData,
  validateWorkspaceData,
} from '../../shared/validation.mjs'
import type { Revision, Workspace } from './types'

export interface MigrationBackup {
  id: string
  workspaceId: string
  createdAt: number
  snapshot: unknown
}

class WorkbenchDB extends Dexie {
  workspaces!: Table<Workspace, string>
  revisions!: Table<Revision, string>
  migrationBackups!: Table<MigrationBackup, string>

  constructor() {
    super('OneLookWorkbench')
    this.version(1).stores({
      workspaces: '&id,updatedAt',
      revisions: '&id,workspaceId,createdAt',
    })
    this.version(2).stores({
      workspaces: '&id,updatedAt',
      revisions: '&id,workspaceId,createdAt',
      migrationBackups: '&id,workspaceId,createdAt',
    }).upgrade(async transaction => {
      const workspaces = transaction.table('workspaces')
      const revisions = transaction.table('revisions')
      const backups = transaction.table('migrationBackups')
      for (const raw of await workspaces.toArray()) {
        const canonical = cleanWorkspace(raw)
        if (raw?.schemaVersion === 1) {
          await backups.add({
            id: crypto.randomUUID(),
            workspaceId: raw.id,
            createdAt: Date.now(),
            snapshot: structuredClone(raw),
          })
        }
        await workspaces.put(canonical)
      }
      for (const raw of await revisions.toArray()) {
        await revisions.put(cleanRevision(raw))
      }
    })
  }
}

const db = new WorkbenchDB()

function cleanWorkspace(value: unknown): Workspace {
  return validateWorkspaceData(value) as Workspace
}

function cleanRevision(value: unknown): Revision {
  return validateRevisionData(value) as Revision
}

function assertRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('expectedRevision must be a non-negative integer.')
  }
}

export class ConflictError extends Error {
  readonly expectedRevision: number
  readonly actualRevision: number | undefined

  constructor(expectedRevision: number, actualRevision: number | undefined) {
    super(`Workspace changed or was deleted; expected revision ${expectedRevision}, current revision ${actualRevision ?? 'missing'}.`)
    this.name = 'ConflictError'
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

async function trimRevisions(workspaceId: string): Promise<void> {
  const revisions = await db.revisions.where('workspaceId').equals(workspaceId).sortBy('createdAt')
  const excess = revisions.slice(0, Math.max(0, revisions.length - 20))
  if (excess.length) await db.revisions.bulkDelete(excess.map(revision => revision.id))
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await db.workspaces.toArray()
  return rows.map(cleanWorkspace).sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  const row = await db.workspaces.get(id)
  return row === undefined ? undefined : cleanWorkspace(row)
}

export async function saveWorkspace(
  workspace: Workspace,
  label?: string,
  expectedRevision = workspace.revision,
): Promise<Workspace> {
  const candidate = cleanWorkspace(workspace)
  assertRevision(expectedRevision)
  const revisionLabel = label === undefined ? undefined : label.trim()
  if (label !== undefined && (!revisionLabel || revisionLabel.length > 200)) {
    throw new TypeError('Revision label must contain 1–200 characters.')
  }

  let saved: Workspace | undefined
  await db.transaction('rw', db.workspaces, db.revisions, async () => {
    const existing = await db.workspaces.get(candidate.id)
    const current = existing === undefined ? undefined : cleanWorkspace(existing)
    const actualRevision = current?.revision
    if (actualRevision !== expectedRevision && !(actualRevision === undefined && expectedRevision === 0)) {
      throw new ConflictError(expectedRevision, actualRevision)
    }
    if (current && revisionLabel !== undefined) {
      await db.revisions.add(cleanRevision({
        id: crypto.randomUUID(),
        workspaceId: candidate.id,
        createdAt: Date.now(),
        label: revisionLabel,
        snapshot: current,
      }))
      await trimRevisions(candidate.id)
    }
    saved = cleanWorkspace({ ...candidate, revision: expectedRevision + 1 })
    await db.workspaces.put(saved)
  })
  return cleanWorkspace(saved)
}

export async function listRevisions(id: string): Promise<Revision[]> {
  const rows = await db.revisions.where('workspaceId').equals(id).toArray()
  return rows.map(cleanRevision).sort((left, right) => right.createdAt - left.createdAt)
}

export async function listMigrationBackups(workspaceId?: string): Promise<MigrationBackup[]> {
  const rows = workspaceId === undefined
    ? await db.migrationBackups.toArray()
    : await db.migrationBackups.where('workspaceId').equals(workspaceId).toArray()
  return rows
    .map(row => structuredClone(row))
    .sort((left, right) => right.createdAt - left.createdAt)
}

export async function deleteWorkspace(id: string, expectedRevision: number): Promise<void> {
  assertRevision(expectedRevision)
  await db.transaction('rw', db.workspaces, db.revisions, async () => {
    const existing = await db.workspaces.get(id)
    if (existing === undefined) throw new ConflictError(expectedRevision, undefined)
    const current = cleanWorkspace(existing)
    if (current.revision !== expectedRevision) throw new ConflictError(expectedRevision, current.revision)
    await db.workspaces.delete(id)
    await db.revisions.where('workspaceId').equals(id).delete()
  })
}

export async function restoreRevision(
  revision: Revision,
  expectedRevision: number,
): Promise<Workspace> {
  const selected = cleanRevision(revision)
  assertRevision(expectedRevision)
  let restored: Workspace | undefined
  await db.transaction('rw', db.workspaces, db.revisions, async () => {
    const existing = await db.workspaces.get(selected.workspaceId)
    if (existing === undefined) throw new ConflictError(expectedRevision, undefined)
    const currentWorkspace = cleanWorkspace(existing)
    if (currentWorkspace.revision !== expectedRevision) {
      throw new ConflictError(expectedRevision, currentWorkspace.revision)
    }
    const snapshot = cleanWorkspace(selected.snapshot)
    const validQuestionIds = new Set(snapshot.questions.map(question => question.id))
    restored = cleanWorkspace({
      ...snapshot,
      revision: expectedRevision + 1,
      createdAt: currentWorkspace.createdAt,
      updatedAt: Date.now(),
      attempts: currentWorkspace.attempts.filter(attempt => validQuestionIds.has(attempt.questionId)),
    })
    await db.revisions.add(cleanRevision({
      id: crypto.randomUUID(),
      workspaceId: selected.workspaceId,
      createdAt: Date.now(),
      label: `Before restore: ${selected.label}`.slice(0, 200),
      snapshot: currentWorkspace,
    }))
    await trimRevisions(selected.workspaceId)
    await db.workspaces.put(restored)
  })
  return cleanWorkspace(restored)
}
