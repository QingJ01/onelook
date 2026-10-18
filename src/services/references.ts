import { nextTick } from 'vue'
import { documentService } from './db'
import type { useMapStore } from '@/stores/mapStore'

export type ReferenceOpenResult =
  | 'ok'
  | 'invalid'
  | 'missing-document'
  | 'missing-node'

export interface InternalReference {
  documentId: string
  nodeId?: string
}

type MapStore = ReturnType<typeof useMapStore>

const INTERNAL_REFERENCE_PREFIX = 'onelook://'

/**
 * Internal cross-map reference format:
 *   onelook://doc/<documentId>
 *   onelook://doc/<documentId>?node=<nodeId>
 */
export function parseInternalReference(href?: string): InternalReference | null {
  if (!href || !href.startsWith(INTERNAL_REFERENCE_PREFIX)) return null

  try {
    const url = new URL(href)
    if (url.protocol !== 'onelook:' || url.hostname !== 'doc') return null

    const documentId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!documentId) return null

    const nodeId = url.searchParams.get('node') || undefined
    return { documentId, nodeId }
  } catch {
    return null
  }
}

export function isInternalReference(href?: string): boolean {
  return parseInternalReference(href) !== null
}

export function makeInternalReference(documentId: string, nodeId?: string): string {
  const base = `${INTERNAL_REFERENCE_PREFIX}doc/${encodeURIComponent(documentId)}`
  return nodeId ? `${base}?node=${encodeURIComponent(nodeId)}` : base
}

export async function openInternalReference(
  href: string,
  mapStore: MapStore,
): Promise<ReferenceOpenResult> {
  const reference = parseInternalReference(href)
  if (!reference) return 'invalid'

  let target
  try {
    target = await documentService.get(reference.documentId)
  } catch {
    return 'missing-document'
  }
  if (!target) return 'missing-document'

  // Best-effort save of the current document before switching maps.
  try {
    await documentService.save(JSON.parse(JSON.stringify(mapStore.document)))
  } catch {
    // A failed pre-save should not block navigation.
  }

  mapStore.loadDocument(JSON.parse(JSON.stringify(target)))
  await nextTick()

  if (reference.nodeId) {
    if (!mapStore.findNode(reference.nodeId)) return 'missing-node'
    mapStore.selectNode(reference.nodeId)
  } else {
    mapStore.selectNode(target.root.id)
  }

  return 'ok'
}
