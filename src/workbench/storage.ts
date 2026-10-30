import Dexie, { type Table } from 'dexie'
import {
  validateRevisionData,
  validateWorkspaceData,
} from '../../shared/validation.mjs'
import type { Revision, Workspace } from './types'

class WorkbenchDB extends Dexie {
  workspaces!: Table<Workspace, string>
  revisions!: Table<Revision, string>

  constructor() {
    super('OneLookWorkbench')
    this.version(1).stores({
      workspaces: '&id,updatedAt',
      revisions: '&id,workspaceId,createdAt',
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

export async function saveWorkspace(workspace: Workspace, label?: string): Promise<void> {
  const sanitized = cleanWorkspace(structuredClone(workspace))
  const revisionLabel = label === undefined ? undefined : label.trim()
  if (label !== undefined && (!revisionLabel || revisionLabel.length > 200)) {
    throw new TypeError('Revision label must contain 1–200 characters.')
  }

  await db.transaction('rw', db.workspaces, db.revisions, async () => {
    const existing = await db.workspaces.get(sanitized.id)
    if (existing !== undefined && revisionLabel !== undefined) {
      await db.revisions.add(cleanRevision({
        id: crypto.randomUUID(),
        workspaceId: sanitized.id,
        createdAt: Date.now(),
        label: revisionLabel,
        snapshot: cleanWorkspace(existing),
      }))
      await trimRevisions(sanitized.id)
    }
    await db.workspaces.put(cleanWorkspace(sanitized))
  })
}

export async function listRevisions(id: string): Promise<Revision[]> {
  const rows = await db.revisions.where('workspaceId').equals(id).toArray()
  return rows.map(cleanRevision).sort((left, right) => right.createdAt - left.createdAt)
}

export async function deleteWorkspace(id: string): Promise<void> {
  await db.transaction('rw', db.workspaces, db.revisions, async () => {
    await db.workspaces.delete(id)
    await db.revisions.where('workspaceId').equals(id).delete()
  })
}

export async function restoreRevision(revision: Revision): Promise<Workspace> {
  const selected = cleanRevision(structuredClone(revision))
  let restored: Workspace | undefined
  await db.transaction('rw', db.workspaces, db.revisions, async () => {
    const current = await db.workspaces.get(selected.workspaceId)
    if (current === undefined) throw new TypeError(`Workspace "${selected.workspaceId}" does not exist.`)
    const currentWorkspace = cleanWorkspace(current)
    const snapshot = cleanWorkspace(selected.snapshot)
    const validQuestionIds = new Set(snapshot.questions.map(question => question.id))
    restored = cleanWorkspace({
      ...snapshot,
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
