import type { NodeKind, RelationKind } from './types'

// Colour follows the authored type, never guesses at a node's title.
export const nodeVisuals: Record<NodeKind, { tone: string; sigil: string }> = {
  component: { tone: 'green', sigil: '{}' },
  interface: { tone: 'cyan', sigil: '↔' },
  requirement: { tone: 'amber', sigil: '◇' },
  actor: { tone: 'slate', sigil: '◎' },
  state: { tone: 'violet', sigil: '▤' },
  concept: { tone: 'cyan', sigil: '◈' },
  claim: { tone: 'orange', sigil: '⊢' },
  step: { tone: 'green', sigil: '→' },
  example: { tone: 'slate', sigil: '≡' },
}

export function relationTone(kind?: RelationKind): string {
  if (kind === 'contradicts') return 'rose'
  if (kind === 'depends') return 'violet'
  if (kind === 'supports') return 'green'
  if (kind === 'prerequisite') return 'cyan'
  return 'slate'
}
