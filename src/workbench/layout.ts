import dagre from '@dagrejs/dagre'
import type { Relation, RelationKind, ViewForm } from './types'

export interface Box { x: number; y: number; w: number; h: number }
export interface LayoutEdge { id: string; from: string; to: string; label: string; d: string; lx: number; ly: number; cross: boolean }
export interface Layout {
  form: ViewForm
  boxes: Record<string, Box>
  edges: LayoutEdge[]
  width: number
  height: number
  /** Mind map centre, drawn when the content has no single root of its own. */
  root?: { title: string; box: Box }
  /** Timeline axis with one tick per object. */
  axis?: { y: number; x1: number; x2: number; ticks: { id: string; x: number; y1: number; y2: number }[] }
}
export interface LayoutInput {
  form: ViewForm
  nodeIds: string[]
  relations: Relation[]
  positions?: Record<string, { x: number; y: number }>
  title?: string
}

export const NODE_W = 210
export const NODE_H = 96
export const ROOT_ID = '__root__'
const MARGIN = 40

/** Relations read "child → parent" for these kinds, so the hierarchy runs against the arrow. */
const upward = new Set<RelationKind>(['partOf', 'supports', 'contradicts', 'evaluates', 'implements'])
const sequential = new Set<RelationKind>(['next', 'causes', 'prerequisite', 'calls'])

function connect(a: Box, b: Box): Pick<LayoutEdge, 'd' | 'lx' | 'ly'> {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2
  const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay)
  const forward = horizontal ? bx > ax : by > ay
  const x1 = horizontal ? (forward ? a.x + a.w : a.x) : ax
  const y1 = horizontal ? ay : (forward ? a.y + a.h : a.y)
  const x2 = horizontal ? (forward ? b.x : b.x + b.w) : bx
  const y2 = horizontal ? by : (forward ? b.y : b.y + b.h)
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const d = horizontal
    ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
    : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`
  return { d, lx: mx, ly: my - 10 }
}

function finish(form: ViewForm, boxes: Record<string, Box>, edges: LayoutEdge[], extra: Partial<Layout> = {}): Layout {
  const all = [...Object.values(boxes), ...(extra.root ? [extra.root.box] : [])]
  return {
    form,
    boxes,
    edges,
    width: Math.max(560, ...all.map(box => box.x + box.w + MARGIN)),
    height: Math.max(320, ...all.map(box => box.y + box.h + MARGIN)),
    ...extra,
  }
}

function inView(input: LayoutInput): Relation[] {
  const ids = new Set(input.nodeIds)
  return input.relations.filter(relation => ids.has(relation.from) && ids.has(relation.to))
}

function relationEdges(relations: Relation[], boxes: Record<string, Box>, crossIds = new Set<string>()): LayoutEdge[] {
  return relations.flatMap(relation => {
    const a = boxes[relation.from], b = boxes[relation.to]
    if (!a || !b || relation.from === relation.to) return []
    return [{ id: relation.id, from: relation.from, to: relation.to, label: relation.label, cross: crossIds.has(relation.id), ...connect(a, b) }]
  })
}

function layered(input: LayoutInput, direction: 'LR' | 'TB'): Record<string, Box> {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: direction, nodesep: direction === 'LR' ? 34 : 46, ranksep: direction === 'LR' ? 90 : 64, marginx: MARGIN, marginy: MARGIN })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const id of input.nodeIds) graph.setNode(id, { width: NODE_W, height: NODE_H })
  for (const relation of inView(input)) if (relation.from !== relation.to) graph.setEdge(relation.from, relation.to)
  dagre.layout(graph)
  const boxes: Record<string, Box> = {}
  for (const id of input.nodeIds) {
    const node = graph.node(id)
    boxes[id] = { x: Math.round(node.x - NODE_W / 2), y: Math.round(node.y - NODE_H / 2), w: NODE_W, h: NODE_H }
  }
  return boxes
}

function layoutGraph(input: LayoutInput): Layout {
  const relations = inView(input)
  const boxes = relations.length
    ? layered(input, 'LR')
    : Object.fromEntries(input.nodeIds.map((id, index) => [id, { x: MARGIN + (index % 3) * 270, y: MARGIN + Math.floor(index / 3) * 150, w: NODE_W, h: NODE_H }]))
  for (const [id, position] of Object.entries(input.positions ?? {})) {
    if (boxes[id]) boxes[id] = { x: position.x, y: position.y, w: NODE_W, h: NODE_H }
  }
  return finish('graph', boxes, relationEdges(relations, boxes))
}

function layoutFlow(input: LayoutInput): Layout {
  const boxes = layered(input, 'TB')
  return finish('flow', boxes, relationEdges(inView(input), boxes))
}

function layoutTree(input: LayoutInput): Layout {
  const relations = inView(input)
  const children = new Map<string, { id: string; relation: Relation }[]>(input.nodeIds.map(id => [id, []]))
  const incoming = new Map<string, number>(input.nodeIds.map(id => [id, 0]))
  for (const relation of relations) {
    if (relation.from === relation.to) continue
    const [parent, child] = upward.has(relation.kind) ? [relation.to, relation.from] : [relation.from, relation.to]
    children.get(parent)!.push({ id: child, relation })
    incoming.set(child, incoming.get(child)! + 1)
  }
  const kids = new Map<string, string[]>(input.nodeIds.map(id => [id, []]))
  const treeRelations = new Set<string>()
  const placed = new Set<string>()
  const roots: string[] = []
  const grow = (root: string) => {
    roots.push(root)
    placed.add(root)
    const queue = [root]
    for (let index = 0; index < queue.length; index += 1) {
      for (const { id, relation } of children.get(queue[index]!)!) {
        if (placed.has(id)) continue
        placed.add(id)
        kids.get(queue[index]!)!.push(id)
        treeRelations.add(relation.id)
        queue.push(id)
      }
    }
  }
  for (const id of input.nodeIds) if (!incoming.get(id) && !placed.has(id)) grow(id)
  for (const id of input.nodeIds) if (!placed.has(id)) grow(id)

  const virtual = roots.length !== 1
  const boxes: Record<string, Box> = {}
  const gap = 18, step = NODE_W + 76
  let cursor = MARGIN
  const place = (id: string, depth: number): number => {
    const list = kids.get(id)!
    let centre: number
    if (!list.length) {
      centre = cursor + NODE_H / 2
      cursor += NODE_H + gap
    } else {
      const centres = list.map(child => place(child, depth + 1))
      centre = (centres[0]! + centres[centres.length - 1]!) / 2
    }
    boxes[id] = { x: MARGIN + depth * step, y: Math.round(centre - NODE_H / 2), w: NODE_W, h: NODE_H }
    return centre
  }
  const offset = virtual ? 1 : 0
  const centres = roots.map(root => place(root, offset))
  const rootBox = virtual
    ? { x: MARGIN, y: Math.round(((centres[0] ?? MARGIN + 28) + (centres[centres.length - 1] ?? MARGIN + 28)) / 2 - 28), w: 180, h: 56 }
    : undefined
  if (rootBox) for (const box of Object.values(boxes)) box.x -= NODE_W - rootBox.w

  const cross = new Set(relations.filter(relation => !treeRelations.has(relation.id)).map(relation => relation.id))
  const edges = relations.flatMap(relation => {
    const a = boxes[relation.from], b = boxes[relation.to]
    if (!a || !b || relation.from === relation.to) return []
    const isCross = cross.has(relation.id)
    const [parent, child] = !isCross && upward.has(relation.kind) ? [b, a] : [a, b]
    return [{ id: relation.id, from: relation.from, to: relation.to, label: relation.label, cross: isCross, ...connect(parent, child) }]
  })
  if (rootBox) {
    for (const root of roots) edges.push({ id: `${ROOT_ID}-${root}`, from: ROOT_ID, to: root, label: '', cross: false, ...connect(rootBox, boxes[root]!) })
  }
  return finish('tree', boxes, edges, rootBox ? { root: { title: input.title || '主题', box: rootBox } } : {})
}

/** Stable order: sequential relations first, then the order the objects were added to the view. */
export function timelineOrder(nodeIds: string[], relations: Relation[]): string[] {
  const ids = new Set(nodeIds)
  const remaining = [...nodeIds]
  const edges = relations.filter(relation => sequential.has(relation.kind) && ids.has(relation.from) && ids.has(relation.to) && relation.from !== relation.to)
  const ordered: string[] = []
  while (remaining.length) {
    const index = remaining.findIndex(id => !edges.some(edge => edge.to === id && remaining.includes(edge.from)))
    ordered.push(...remaining.splice(Math.max(0, index), 1))
  }
  return ordered
}

function layoutTimeline(input: LayoutInput): Layout {
  const order = timelineOrder(input.nodeIds, inView(input))
  const axisY = MARGIN + NODE_H + 44
  const boxes: Record<string, Box> = {}
  const ticks: NonNullable<Layout['axis']>['ticks'] = []
  order.forEach((id, index) => {
    const above = index % 2 === 0
    const x = MARGIN + index * (NODE_W / 2 + 34)
    const y = above ? MARGIN : axisY + 44
    boxes[id] = { x, y, w: NODE_W, h: NODE_H }
    ticks.push({ id, x: x + NODE_W / 2, y1: above ? y + NODE_H : axisY, y2: above ? axisY : y })
  })
  const last = order.length ? boxes[order[order.length - 1]!]! : { x: MARGIN, w: NODE_W }
  return finish('timeline', boxes, [], { axis: { y: axisY, x1: MARGIN, x2: last.x + last.w, ticks } })
}

export function layoutView(input: LayoutInput): Layout {
  if (input.form === 'flow') return layoutFlow(input)
  if (input.form === 'tree') return layoutTree(input)
  if (input.form === 'timeline') return layoutTimeline(input)
  return layoutGraph(input)
}
