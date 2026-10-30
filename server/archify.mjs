import { execFile as callbackExecFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { validateWorkspaceData } from '../shared/validation.mjs'

const execFile = promisify(callbackExecFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAX_NODES = 60
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
const RENDER_TIMEOUT_MS = 90_000
const VISUAL_SUBLABEL_LENGTH = 30
const PROVENANCE_LABELS = {
  ai: 'AI draft; verify before use; not external evidence.',
  demo: 'Demo content; not external evidence.',
  user: 'User-supplied content.',
}

async function resolveCliPath(archifyRoot) {
  const root = path.resolve(archifyRoot || path.join(ROOT, '.cache', 'archify'))
  for (const candidate of [path.join(root, 'archify', 'bin', 'archify.mjs'), path.join(root, 'bin', 'archify.mjs')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch {
      // Try the alternate supported source-root layout.
    }
  }
  throw new Error(`Archify renderer is not available. Run the Archify setup command or set ARCHIFY_ROOT to its source root (checked: ${root}).`)
}

function idMap(workspace) {
  return new Map(workspace.nodes.map((node, index) => [node.id, `node_${index + 1}`]))
}

function componentType(kind) {
  if (kind === 'interface') return 'frontend'
  if (kind === 'actor') return 'external'
  return 'backend'
}

function compactText(value, maximum = 180) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maximum) return normalized
  return `${normalized.slice(0, maximum - 1).trimEnd()}…`
}

function descriptiveItems(node, workspace) {
  const relationItems = workspace.relations
    .filter(relation => relation.from === node.id || relation.to === node.id)
    .map(relation => {
      const direction = relation.from === node.id ? 'Outgoing' : 'Incoming'
      const relationText = relation.label ? `: ${compactText(relation.label, 200)}` : ''
      return `${direction} ${relation.kind}${relationText}`
    })
  const citationItems = node.citations.map(citation => {
    const source = workspace.sources.find(item => item.id === citation.sourceId)
    return `Citation from ${source.title}: ${citation.quote}`
  })
  const fieldItems = [
    ['Description', node.body],
    ['Example', node.example],
    ['Pitfall', node.pitfall],
    ['Notes', node.notes],
    ['Acceptance', node.acceptance],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${compactText(value, 2000)}`)
  return [
    `Provenance: ${PROVENANCE_LABELS[node.provenance]}`,
    ...fieldItems,
    ...relationItems,
    ...citationItems,
  ]
}

function visualSublabel(node) {
  const text = compactText(node.body, VISUAL_SUBLABEL_LENGTH)
  return text || undefined
}

function relationEdges(workspace, ids, workflow = false) {
  return workspace.relations.map((relation, index) => ({
    id: `relation_${index + 1}`,
    from: ids.get(relation.from),
    to: ids.get(relation.to),
    ...(workflow ? { role: relation.kind === 'next' ? 'main' : 'branch' } : {}),
  }))
}

function hasRootedPrerequisiteTree(workspace) {
  const nodes = workspace.nodes
  if (!nodes.length || workspace.relations.length !== nodes.length - 1) return false
  if (workspace.relations.some(relation => relation.kind !== 'prerequisite')) return false
  const incoming = new Map(nodes.map(node => [node.id, 0]))
  const outgoing = new Map(nodes.map(node => [node.id, []]))
  for (const relation of workspace.relations) {
    incoming.set(relation.to, incoming.get(relation.to) + 1)
    outgoing.get(relation.from).push(relation.to)
  }
  const roots = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  if (roots.length !== 1 || [...incoming.values()].some(count => count > 1)) return false
  const visited = new Set()
  const stack = [roots[0]]
  while (stack.length) {
    const id = stack.pop()
    if (visited.has(id)) return false
    visited.add(id)
    stack.push(...outgoing.get(id))
  }
  return visited.size === nodes.length
}

function mapArchitecture(workspace, ids) {
  const columns = Math.min(4, Math.max(1, workspace.nodes.length))
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: workspace.title,
      subtitle: 'Knowledge map. Connections preserve authored direction; relationship text appears in node detail cards.',
      output: 'workbench-render.html',
      quality_profile: 'standard',
      locale: 'en',
    },
    layout: { mode: 'grid', cols: columns, cellW: 280, cellH: 100, gapX: 80, gapY: 100 },
    components: workspace.nodes.map((node, index) => ({
      id: ids.get(node.id),
      type: componentType(node.kind),
      label: compactText(node.title, 160),
      ...(visualSublabel(node) ? { sublabel: visualSublabel(node) } : {}),
      size: [280, 100],
      row: Math.floor(index / columns),
      col: index % columns,
    })),
    connections: relationEdges(workspace, ids),
    cards: workspace.nodes
      .filter(node => descriptiveItems(node, workspace).length)
      .map((node, index) => ({
        dot: ['cyan', 'emerald', 'violet', 'amber', 'rose', 'orange', 'slate'][index % 7],
        title: compactText(node.title, 100),
        items: descriptiveItems(node, workspace),
      })),
  }
}

function mapWorkflow(workspace, ids) {
  const columns = 3
  const rowCount = Math.ceil(workspace.nodes.length / columns)
  const lanes = Array.from({ length: rowCount }, (_, index) => ({
    id: `row_${index + 1}`,
    label: `Workspace elements ${index * columns + 1}–${Math.min((index + 1) * columns, workspace.nodes.length)}`,
  }))
  const edgePairs = new Set(workspace.relations.map(relation => `${relation.from}\u0000${relation.to}`))
  const mainPath = workspace.path.length >= 2
    && workspace.path.slice(1).every((id, index) => edgePairs.has(`${workspace.path[index]}\u0000${id}`))
    ? workspace.path.map(id => ids.get(id))
    : undefined
  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: {
      title: workspace.title,
      subtitle: 'Product workbench. Row groups are layout only; connections preserve authored direction and relationship text appears in node detail cards.',
      output: 'workbench-render.html',
      quality_profile: 'standard',
      locale: 'en',
    },
    lanes,
    ...(mainPath ? { mainPath } : {}),
    nodes: workspace.nodes.map((node, index) => ({
      id: ids.get(node.id),
      lane: lanes[Math.floor(index / columns)].id,
      col: index % columns,
      type: componentType(node.kind),
      label: compactText(node.title, 160),
      ...(visualSublabel(node) ? { sublabel: visualSublabel(node) } : {}),
      width: 240,
      height: 100,
    })),
    edges: relationEdges(workspace, ids, true),
    cards: workspace.nodes
      .filter(node => descriptiveItems(node, workspace).length)
      .map((node, index) => ({
        dot: ['cyan', 'emerald', 'violet', 'amber', 'rose', 'orange', 'slate'][index % 7],
        title: compactText(node.title, 100),
        items: descriptiveItems(node, workspace),
      })),
  }
}

function mapCourseTree(workspace, ids) {
  const parentByChild = new Map(workspace.relations.map(relation => [relation.to, relation.from]))
  return {
    schema_version: 1,
    diagram_type: 'tree',
    meta: {
      title: workspace.title,
      subtitle: 'Course prerequisite tree from authored prerequisite relationships.',
      output: 'workbench-render.html',
      quality_profile: 'standard',
      locale: 'en',
    },
    layout: { direction: 'down', nodeW: 240, nodeMaxW: 280, gapX: 60, gapY: 40 },
    nodes: workspace.nodes.map(node => ({
      id: ids.get(node.id),
      label: compactText(node.title, 160),
      ...(parentByChild.has(node.id) ? { parent: ids.get(parentByChild.get(node.id)) } : {}),
      ...(visualSublabel(node) ? { sublabel: visualSublabel(node) } : {}),
    })),
    cards: workspace.nodes
      .filter(node => descriptiveItems(node, workspace).length)
      .map((node, index) => ({
        dot: ['cyan', 'emerald', 'violet', 'amber', 'rose', 'orange', 'slate'][index % 7],
        title: compactText(node.title, 100),
        items: descriptiveItems(node, workspace),
      })),
  }
}

function mapWorkspaceToIR(workspace) {
  if (!workspace.nodes.length) throw new TypeError('Add at least one knowledge node before rendering.')
  if (workspace.nodes.length > MAX_NODES) throw new TypeError(`Archify supports at most ${MAX_NODES} nodes per render.`)
  const ids = idMap(workspace)
  if (workspace.scenario === 'product') return mapWorkflow(workspace, ids)
  if (workspace.scenario === 'course' && hasRootedPrerequisiteTree(workspace)) return mapCourseTree(workspace, ids)
  return mapArchitecture(workspace, ids)
}

async function renderWorkspace(value, { archifyRoot = process.env.ARCHIFY_ROOT } = {}) {
  const workspace = validateWorkspaceData(value)
  const ir = mapWorkspaceToIR(workspace)
  const cliPath = await resolveCliPath(archifyRoot)
  const jobDir = await mkdtemp(path.join(os.tmpdir(), 'onelook-archify-'))
  const inputPath = path.join(jobDir, 'workspace.ir.json')
  const outputPath = path.join(jobDir, 'workbench-render.html')
  try {
    await writeFile(inputPath, JSON.stringify(ir), { flag: 'wx', mode: 0o600 })
    try {
      await execFile(process.execPath, [
        cliPath,
        'finalize',
        ir.diagram_type,
        inputPath,
        outputPath,
        '--quality',
        'standard',
        '--json',
      ], {
        cwd: jobDir,
        timeout: RENDER_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1' },
      })
    } catch (error) {
      const detail = error?.killed
        ? `timed out after ${RENDER_TIMEOUT_MS / 1000} seconds`
        : `failed with exit code ${error?.code ?? 'unknown'}`
      throw new Error(`Archify ${ir.diagram_type} validate/render/deliver ${detail}.`)
    }
    const outputStat = await stat(outputPath)
    if (!outputStat.isFile() || outputStat.size < 1 || outputStat.size > MAX_ARTIFACT_BYTES) {
      throw new Error(`Archify HTML output must be between 1 byte and ${MAX_ARTIFACT_BYTES} bytes.`)
    }
    const html = await readFile(outputPath, 'utf8')
    if (!/<html(?:\s|>)/i.test(html)) throw new Error('Archify did not produce a complete HTML document.')
    return { html, ir }
  } finally {
    await rm(jobDir, { recursive: true, force: true })
  }
}

function archifyAvailable(archifyRoot = process.env.ARCHIFY_ROOT) {
  const root = path.resolve(archifyRoot || path.join(ROOT, '.cache', 'archify'))
  for (const candidate of [path.join(root, 'archify', 'bin', 'archify.mjs'), path.join(root, 'bin', 'archify.mjs')]) {
    try {
      if (statSync(candidate).isFile()) return true
    } catch {
      continue
    }
  }
  return false
}

export { archifyAvailable, mapWorkspaceToIR, renderWorkspace }
