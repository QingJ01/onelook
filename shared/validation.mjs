const scenarios = new Set(['architecture', 'product', 'course'])
const nodeKinds = new Set(['component', 'interface', 'requirement', 'actor', 'state', 'concept'])
const relationKinds = new Set(['calls', 'depends', 'implements', 'next', 'prerequisite', 'compares'])
const ratings = new Set(['again', 'good'])
const viewKinds = new Set(['map', 'flow', 'learning'])
const flowBranches = new Set(['main', 'failure', 'alternative'])
const evidenceKinds = new Set(['unverified', 'static', 'runtime'])
const productTypes = new Set(['evidence', 'hypothesis', 'decision'])
const productStatuses = new Set(['unverified', 'confirmed', 'rejected'])
const criterionStates = new Set(['pending', 'passed', 'failed'])
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/
const MAX_WORKSPACE_JSON_BYTES = 20 * 1024 * 1024

const limits = {
  sources: 100,
  sourceVersions: 50,
  nodes: 60,
  relations: 300,
  views: 100,
  path: 60,
  flows: 100,
  flowSteps: 300,
  decisions: 300,
  productItems: 300,
  criteria: 100,
  alternatives: 100,
  questions: 300,
  attempts: 2000,
}

function fail(path, reason) {
  throw new TypeError(`${path}: ${reason}`)
}

function record(value, path, allowed, required = allowed) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object')
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(path, `contains unknown field "${key}"`)
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(path, `is missing "${key}"`)
  }
  return value
}

function text(value, path, maximum, nonempty = false) {
  if (typeof value !== 'string') fail(path, 'must be a string')
  if (value.length > maximum) fail(path, `must be at most ${maximum} characters`)
  if (nonempty && value.trim().length === 0) fail(path, 'must not be empty')
  return value
}

function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
  return value
}

function integer(value, path, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(path, `must be an integer greater than or equal to ${minimum}`)
  }
  return value
}

function identifier(value, path) {
  if (typeof value !== 'string' || !idPattern.test(value)) fail(path, 'must be a valid identifier')
  return value
}

function enumValue(value, path, values) {
  if (!values.has(value)) fail(path, `must be one of ${[...values].join(', ')}`)
  return value
}

function boundedArray(value, path, maximum) {
  if (!Array.isArray(value)) fail(path, 'must be an array')
  if (value.length > maximum) fail(path, `must contain at most ${maximum} entries`)
  return value
}

function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path, 'contains duplicate identifiers')
}

function jsonStringBytes(value, remaining) {
  let size = 2
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0x22 || code === 0x5c) size += 2
    else if (code < 0x20) size += [8, 9, 10, 12, 13].includes(code) ? 2 : 6
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        size += 4
        index += 1
      } else size += 6
    } else if (code >= 0xdc00 && code <= 0xdfff) size += 6
    else if (code < 0x80) size += 1
    else if (code < 0x800) size += 2
    else size += 3
    if (size > remaining) return size
  }
  return size
}

function assertWorkspaceJsonSize(value) {
  let size = 0
  const active = new WeakSet()
  const add = (amount) => {
    size += amount
    if (size > MAX_WORKSPACE_JSON_BYTES) {
      fail('workspace', 'canonical JSON must be at most 20 MiB')
    }
  }
  const visit = (item, depth = 0) => {
    if (depth > 100) fail('workspace', 'must be a bounded JSON value')
    if (item === null) {
      add(4)
      return
    }
    if (typeof item === 'string') {
      add(jsonStringBytes(item, MAX_WORKSPACE_JSON_BYTES - size))
      return
    }
    if (typeof item === 'boolean') {
      add(item ? 4 : 5)
      return
    }
    if (typeof item === 'number') {
      add(Number.isFinite(item) ? String(item).length : 4)
      return
    }
    if (typeof item !== 'object') fail('workspace', 'must contain only JSON values')
    if (active.has(item)) fail('workspace', 'must not contain cyclic references')
    active.add(item)
    if (Array.isArray(item)) {
      add(2 + Math.max(0, item.length - 1))
      for (const child of item) visit(child === undefined ? null : child, depth + 1)
    } else {
      const entries = Object.keys(item)
        .filter(key => item[key] !== undefined && typeof item[key] !== 'function' && typeof item[key] !== 'symbol')
      add(2 + Math.max(0, entries.length - 1))
      for (const key of entries) {
        add(jsonStringBytes(key, MAX_WORKSPACE_JSON_BYTES - size) + 1)
        visit(item[key], depth + 1)
      }
    }
    active.delete(item)
  }
  visit(value)
}

function validateUrl(value, path) {
  const url = text(value, path, 2048, true)
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    fail(path, 'must be an absolute HTTP(S) URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    fail(path, 'must be an absolute HTTP(S) URL without credentials')
  }
  return url
}

function validateLegacyNode(value, index) {
  const path = `nodes[${index}]`
  const fields = ['id', 'title', 'kind', 'body', 'example', 'pitfall', 'notes', 'acceptance', 'citations', 'provenance', 'x', 'y']
  const node = record(value, path, fields, fields.filter(field => field !== 'x' && field !== 'y'))
  const citations = boundedArray(node.citations, `${path}.citations`, 100).map((citation, citationIndex) => {
    const citationPath = `${path}.citations[${citationIndex}]`
    const item = record(citation, citationPath, ['sourceId', 'quote'])
    return {
      sourceId: identifier(item.sourceId, `${citationPath}.sourceId`),
      quote: text(item.quote, `${citationPath}.quote`, 20000, true),
    }
  })
  const result = {
    id: identifier(node.id, `${path}.id`),
    title: text(node.title, `${path}.title`, 200, true),
    kind: enumValue(node.kind, `${path}.kind`, nodeKinds),
    body: text(node.body, `${path}.body`, 20000),
    example: text(node.example, `${path}.example`, 10000),
    pitfall: text(node.pitfall, `${path}.pitfall`, 10000),
    notes: text(node.notes, `${path}.notes`, 10000),
    acceptance: text(node.acceptance, `${path}.acceptance`, 10000),
    citations,
    provenance: enumValue(node.provenance, `${path}.provenance`, new Set(['user', 'ai', 'demo'])),
  }
  if (node.x !== undefined) result.x = finite(node.x, `${path}.x`)
  if (node.y !== undefined) result.y = finite(node.y, `${path}.y`)
  return result
}

function validateLegacyWorkspaceData(value) {
  const fields = [
    'schemaVersion', 'id', 'title', 'scenario', 'summary', 'sources', 'nodes',
    'relations', 'path', 'questions', 'attempts', 'createdAt', 'updatedAt',
  ]
  const workspace = record(value, 'workspace', fields)
  if (workspace.schemaVersion !== 1) fail('workspace.schemaVersion', 'must equal 1')
  const result = {
    schemaVersion: 1,
    id: identifier(workspace.id, 'workspace.id'),
    title: text(workspace.title, 'workspace.title', 200, true),
    scenario: enumValue(workspace.scenario, 'workspace.scenario', scenarios),
    summary: text(workspace.summary, 'workspace.summary', 20000),
    sources: boundedArray(workspace.sources, 'workspace.sources', limits.sources).map((source, index) => {
      const path = `sources[${index}]`
      const item = record(source, path, ['id', 'title', 'text', 'url', 'createdAt'], ['id', 'title', 'text', 'createdAt'])
      const result = {
        id: identifier(item.id, `${path}.id`),
        title: text(item.title, `${path}.title`, 200, true),
        text: text(item.text, `${path}.text`, 300000),
        createdAt: finite(item.createdAt, `${path}.createdAt`),
      }
      if (item.url !== undefined) result.url = validateUrl(item.url, `${path}.url`)
      return result
    }),
    nodes: boundedArray(workspace.nodes, 'workspace.nodes', limits.nodes).map(validateLegacyNode),
    relations: boundedArray(workspace.relations, 'workspace.relations', limits.relations).map((relation, index) => {
      const path = `relations[${index}]`
      const item = record(relation, path, ['id', 'from', 'to', 'kind', 'label'])
      return {
        id: identifier(item.id, `${path}.id`),
        from: identifier(item.from, `${path}.from`),
        to: identifier(item.to, `${path}.to`),
        kind: enumValue(item.kind, `${path}.kind`, relationKinds),
        label: text(item.label, `${path}.label`, 200),
      }
    }),
    path: boundedArray(workspace.path, 'path', limits.path).map((id, index) => identifier(id, `path[${index}]`)),
    questions: boundedArray(workspace.questions, 'workspace.questions', limits.questions).map((question, index) => {
      const path = `questions[${index}]`
      const item = record(question, path, ['id', 'nodeId', 'prompt', 'answer'])
      return {
        id: identifier(item.id, `${path}.id`),
        nodeId: identifier(item.nodeId, `${path}.nodeId`),
        prompt: text(item.prompt, `${path}.prompt`, 3000, true),
        answer: text(item.answer, `${path}.answer`, 20000),
      }
    }),
    attempts: boundedArray(workspace.attempts, 'workspace.attempts', limits.attempts).map((attempt, index) => {
      const path = `attempts[${index}]`
      const item = record(attempt, path, ['id', 'questionId', 'answer', 'rating', 'at', 'dueAt'])
      return {
        id: identifier(item.id, `${path}.id`),
        questionId: identifier(item.questionId, `${path}.questionId`),
        answer: text(item.answer, `${path}.answer`, 20000),
        rating: enumValue(item.rating, `${path}.rating`, ratings),
        at: finite(item.at, `${path}.at`),
        dueAt: finite(item.dueAt, `${path}.dueAt`),
      }
    }),
    createdAt: finite(workspace.createdAt, 'workspace.createdAt'),
    updatedAt: finite(workspace.updatedAt, 'workspace.updatedAt'),
  }

  const allIds = [
    result.id,
    ...result.sources.map(item => item.id),
    ...result.nodes.map(item => item.id),
    ...result.relations.map(item => item.id),
    ...result.questions.map(item => item.id),
    ...result.attempts.map(item => item.id),
  ]
  unique(allIds, 'workspace identifiers')

  const sourceById = new Map(result.sources.map(source => [source.id, source]))
  for (const node of result.nodes) {
    for (const citation of node.citations) {
      const source = sourceById.get(citation.sourceId)
      if (!source) fail(`nodes.${node.id}.citations`, `references missing source "${citation.sourceId}"`)
      if (!source.text.includes(citation.quote)) fail(`nodes.${node.id}.citations`, 'quote must be an exact substring of its source')
    }
  }

  const nodeIds = new Set(result.nodes.map(node => node.id))
  const questionIds = new Set(result.questions.map(question => question.id))
  for (const relation of result.relations) {
    if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to)) fail(`relations.${relation.id}`, 'references a missing node')
  }
  for (const id of result.path) {
    if (!nodeIds.has(id)) fail('workspace.path', `references missing node "${id}"`)
  }
  unique(result.path, 'workspace.path')
  for (const question of result.questions) {
    if (!nodeIds.has(question.nodeId)) fail(`questions.${question.id}`, 'references a missing node')
  }
  for (const attempt of result.attempts) {
    if (!questionIds.has(attempt.questionId)) fail(`attempts.${attempt.id}`, 'references a missing question')
  }
  validatePrerequisites(result.nodes, result.relations, [result.path], 'workspace.path')
  return result
}

function validatePrerequisites(nodes, relations, paths, pathLabel) {
  const nodeIds = new Set(nodes.map(node => node.id))
  const prerequisites = new Map([...nodeIds].map(id => [id, []]))
  for (const relation of relations) {
    if (relation.kind === 'prerequisite') prerequisites.get(relation.from).push(relation.to)
  }
  const visiting = new Set()
  const visited = new Set()
  const visit = id => {
    if (visiting.has(id)) fail('workspace.relations', 'prerequisite relationships must not contain cycles')
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of prerequisites.get(id)) visit(next)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of nodeIds) visit(id)

  for (const [index, ids] of paths.entries()) {
    const positions = new Map(ids.map((id, position) => [id, position]))
    for (const relation of relations) {
      if (relation.kind !== 'prerequisite') continue
      const fromPosition = positions.get(relation.from)
      const toPosition = positions.get(relation.to)
      if (fromPosition !== undefined && toPosition !== undefined && fromPosition >= toPosition) {
        fail(`${pathLabel}${paths.length > 1 ? `[${index}]` : ''}`, `must place prerequisite "${relation.from}" before "${relation.to}"`)
      }
    }
  }
}

function defaultViewKind(scenario) {
  if (scenario === 'product') return 'flow'
  if (scenario === 'course') return 'learning'
  return 'map'
}

function stableViewId(workspaceId, reservedIds) {
  const base = `view-${workspaceId.slice(0, 64)}`
  let candidate = base
  let suffix = 1
  while (reservedIds.has(candidate)) {
    const ending = `-${suffix}`
    candidate = `${base.slice(0, 80 - ending.length)}${ending}`
    suffix += 1
  }
  return candidate
}

function migrateLegacyWorkspace(legacy) {
  const reservedIds = new Set([
    legacy.id,
    ...legacy.sources.map(source => source.id),
    ...legacy.nodes.map(node => node.id),
    ...legacy.relations.map(relation => relation.id),
    ...legacy.questions.map(question => question.id),
    ...legacy.attempts.map(attempt => attempt.id),
  ])
  const viewId = stableViewId(legacy.id, reservedIds)
  const sources = legacy.sources.map(source => ({
    id: source.id,
    title: source.title,
    ...(source.url === undefined ? {} : { url: source.url }),
    version: 1,
    text: source.text,
    createdAt: source.createdAt,
    versions: [],
  }))
  const sourceById = new Map(sources.map(source => [source.id, source]))
  const nodes = legacy.nodes.map(node => ({
    id: node.id,
    title: node.title,
    kind: node.kind,
    body: node.body,
    example: node.example,
    pitfall: node.pitfall,
    notes: node.notes,
    acceptance: node.acceptance,
    citations: node.citations.map(citation => {
      const source = sourceById.get(citation.sourceId)
      const start = source.text.indexOf(citation.quote)
      return {
        sourceId: citation.sourceId,
        quote: citation.quote,
        version: 1,
        start,
        end: start + citation.quote.length,
      }
    }),
    provenance: node.provenance,
  }))
  const positions = {}
  for (const node of legacy.nodes) {
    if (node.x !== undefined || node.y !== undefined) {
      positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 }
    }
  }
  return validateV2WorkspaceData({
    schemaVersion: 2,
    revision: 0,
    id: legacy.id,
    title: legacy.title,
    scenario: legacy.scenario,
    summary: legacy.summary,
    sources,
    nodes,
    relations: legacy.relations,
    views: [{
      id: viewId,
      title: legacy.title,
      scenario: legacy.scenario,
      kind: defaultViewKind(legacy.scenario),
      nodeIds: nodes.map(node => node.id),
      path: legacy.path,
      positions,
    }],
    flows: [],
    decisions: [],
    productItems: [],
    questions: legacy.questions.map(question => ({ ...question, relatedNodeIds: [] })),
    attempts: legacy.attempts.map(attempt => ({ ...attempt, errorReason: '' })),
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  })
}

function validateSourceVersion(value, path) {
  const item = record(value, path, ['version', 'text', 'createdAt', 'filePath', 'revision'], ['version', 'text', 'createdAt'])
  const result = {
    version: integer(item.version, `${path}.version`, 1),
    text: text(item.text, `${path}.text`, 300000),
    createdAt: finite(item.createdAt, `${path}.createdAt`),
  }
  if (item.filePath !== undefined) result.filePath = relativeFilePath(item.filePath, `${path}.filePath`)
  if (item.revision !== undefined) result.revision = text(item.revision, `${path}.revision`, 200)
  return result
}

function relativeFilePath(value, path) {
  const result = text(value, path, 2000, true)
  if (/^[\\/]|^[A-Za-z]:|[\u0000-\u001f]/.test(result) || result.split(/[\\/]/).some(segment => segment === '..')) {
    fail(path, 'must be a relative file path without parent traversal')
  }
  return result
}

function validateSource(value, index) {
  const path = `sources[${index}]`
  const item = record(value, path, [
    'id', 'title', 'version', 'text', 'createdAt', 'url', 'filePath', 'revision', 'versions',
  ], ['id', 'title', 'version', 'text', 'createdAt', 'versions'])
  const result = {
    id: identifier(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`, 200, true),
    version: integer(item.version, `${path}.version`, 1),
    text: text(item.text, `${path}.text`, 300000),
    createdAt: finite(item.createdAt, `${path}.createdAt`),
    versions: boundedArray(item.versions, `${path}.versions`, limits.sourceVersions)
      .map((version, versionIndex) => validateSourceVersion(version, `${path}.versions[${versionIndex}]`)),
  }
  if (item.url !== undefined) result.url = validateUrl(item.url, `${path}.url`)
  if (item.filePath !== undefined) result.filePath = relativeFilePath(item.filePath, `${path}.filePath`)
  if (item.revision !== undefined) result.revision = text(item.revision, `${path}.revision`, 200)
  const historicalVersions = result.versions.map(version => version.version)
  unique(historicalVersions, `${path}.versions`)
  if (historicalVersions.some(version => version >= result.version)) {
    fail(`${path}.versions`, 'must contain only versions older than the current source')
  }
  for (let versionIndex = 1; versionIndex < historicalVersions.length; versionIndex += 1) {
    if (historicalVersions[versionIndex - 1] >= historicalVersions[versionIndex]) {
      fail(`${path}.versions`, 'must be ordered by ascending version')
    }
  }
  return result
}

function validateCitation(value, path) {
  const item = record(value, path, ['sourceId', 'quote', 'version', 'start', 'end'])
  const start = integer(item.start, `${path}.start`)
  const end = integer(item.end, `${path}.end`)
  if (end <= start) fail(path, 'end must be greater than start')
  return {
    sourceId: identifier(item.sourceId, `${path}.sourceId`),
    quote: text(item.quote, `${path}.quote`, 20000, true),
    version: integer(item.version, `${path}.version`, 1),
    start,
    end,
  }
}

function validateNode(value, index) {
  const path = `nodes[${index}]`
  const fields = ['id', 'title', 'kind', 'body', 'example', 'pitfall', 'notes', 'acceptance', 'citations', 'provenance']
  const node = record(value, path, fields)
  return {
    id: identifier(node.id, `${path}.id`),
    title: text(node.title, `${path}.title`, 200, true),
    kind: enumValue(node.kind, `${path}.kind`, nodeKinds),
    body: text(node.body, `${path}.body`, 20000),
    example: text(node.example, `${path}.example`, 10000),
    pitfall: text(node.pitfall, `${path}.pitfall`, 10000),
    notes: text(node.notes, `${path}.notes`, 10000),
    acceptance: text(node.acceptance, `${path}.acceptance`, 10000),
    citations: boundedArray(node.citations, `${path}.citations`, 100).map((citation, citationIndex) => (
      validateCitation(citation, `${path}.citations[${citationIndex}]`)
    )),
    provenance: enumValue(node.provenance, `${path}.provenance`, new Set(['user', 'ai', 'demo'])),
  }
}

function validateRelation(value, index) {
  const path = `relations[${index}]`
  const item = record(value, path, ['id', 'from', 'to', 'kind', 'label'])
  return {
    id: identifier(item.id, `${path}.id`),
    from: identifier(item.from, `${path}.from`),
    to: identifier(item.to, `${path}.to`),
    kind: enumValue(item.kind, `${path}.kind`, relationKinds),
    label: text(item.label, `${path}.label`, 200),
  }
}

function stringIds(value, path, maximum) {
  const result = boundedArray(value, path, maximum).map((id, index) => identifier(id, `${path}[${index}]`))
  unique(result, path)
  return result
}

function validateView(value, index) {
  const path = `views[${index}]`
  const item = record(value, path, ['id', 'title', 'scenario', 'kind', 'nodeIds', 'path', 'positions'])
  const positionsValue = item.positions
  if (positionsValue === null || typeof positionsValue !== 'object' || Array.isArray(positionsValue)) {
    fail(`${path}.positions`, 'must be an object')
  }
  const positionEntries = Object.entries(positionsValue)
  if (positionEntries.length > limits.nodes) fail(`${path}.positions`, `must contain at most ${limits.nodes} entries`)
  const positions = {}
  for (const [nodeId, positionValue] of positionEntries) {
    identifier(nodeId, `${path}.positions key`)
    const position = record(positionValue, `${path}.positions.${nodeId}`, ['x', 'y'])
    positions[nodeId] = {
      x: finite(position.x, `${path}.positions.${nodeId}.x`),
      y: finite(position.y, `${path}.positions.${nodeId}.y`),
    }
  }
  return {
    id: identifier(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`, 200, true),
    scenario: enumValue(item.scenario, `${path}.scenario`, scenarios),
    kind: enumValue(item.kind, `${path}.kind`, viewKinds),
    nodeIds: stringIds(item.nodeIds, `${path}.nodeIds`, limits.nodes),
    path: stringIds(item.path, `${path}.path`, limits.path),
    positions,
  }
}

function validateFlow(value, index) {
  const path = `flows[${index}]`
  const item = record(value, path, ['id', 'title', 'steps'])
  const steps = boundedArray(item.steps, `${path}.steps`, limits.flowSteps).map((step, stepIndex) => {
    const stepPath = `${path}.steps[${stepIndex}]`
    const value = record(step, stepPath, [
      'id', 'from', 'to', 'message', 'condition', 'branch', 'evidence', 'citations',
    ])
    return {
      id: identifier(value.id, `${stepPath}.id`),
      from: identifier(value.from, `${stepPath}.from`),
      to: identifier(value.to, `${stepPath}.to`),
      message: text(value.message, `${stepPath}.message`, 5000),
      condition: text(value.condition, `${stepPath}.condition`, 5000),
      branch: enumValue(value.branch, `${stepPath}.branch`, flowBranches),
      evidence: enumValue(value.evidence, `${stepPath}.evidence`, evidenceKinds),
      citations: boundedArray(value.citations, `${stepPath}.citations`, 100).map((citation, citationIndex) => (
        validateCitation(citation, `${stepPath}.citations[${citationIndex}]`)
      )),
    }
  })
  return {
    id: identifier(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`, 200, true),
    steps,
  }
}

function validateDecision(value, index) {
  const path = `decisions[${index}]`
  const item = record(value, path, ['id', 'title', 'context', 'choice', 'alternatives', 'consequences', 'nodeIds', 'citations'])
  return {
    id: identifier(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`, 200, true),
    context: text(item.context, `${path}.context`, 20000),
    choice: text(item.choice, `${path}.choice`, 20000),
    alternatives: text(item.alternatives, `${path}.alternatives`, 20000),
    consequences: text(item.consequences, `${path}.consequences`, 20000),
    nodeIds: stringIds(item.nodeIds, `${path}.nodeIds`, limits.nodes),
    citations: boundedArray(item.citations, `${path}.citations`, 100).map((citation, citationIndex) => (
      validateCitation(citation, `${path}.citations[${citationIndex}]`)
    )),
  }
}

function validateProductItem(value, index) {
  const path = `productItems[${index}]`
  const item = record(value, path, [
    'id', 'title', 'type', 'status', 'body', 'nodeIds', 'relatedIds', 'citations', 'criteria', 'alternatives',
  ])
  const criteria = boundedArray(item.criteria, `${path}.criteria`, limits.criteria).map((criterion, criterionIndex) => {
    const criterionPath = `${path}.criteria[${criterionIndex}]`
    const value = record(criterion, criterionPath, ['id', 'text', 'state', 'evidence'])
    const state = enumValue(value.state, `${criterionPath}.state`, criterionStates)
    const evidence = text(value.evidence, `${criterionPath}.evidence`, 10000)
    if (state !== 'pending' && !evidence.trim()) {
      fail(`${criterionPath}.evidence`, 'must contain evidence when the criterion is passed or failed')
    }
    return {
      id: identifier(value.id, `${criterionPath}.id`),
      text: text(value.text, `${criterionPath}.text`, 10000, true),
      state,
      evidence,
    }
  })
  const alternatives = boundedArray(item.alternatives, `${path}.alternatives`, limits.alternatives)
    .map((alternative, alternativeIndex) => {
      const alternativePath = `${path}.alternatives[${alternativeIndex}]`
      const value = record(alternative, alternativePath, ['id', 'title', 'benefits', 'costs'])
      return {
        id: identifier(value.id, `${alternativePath}.id`),
        title: text(value.title, `${alternativePath}.title`, 200, true),
        benefits: text(value.benefits, `${alternativePath}.benefits`, 10000),
        costs: text(value.costs, `${alternativePath}.costs`, 10000),
      }
    })
  const result = {
    id: identifier(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`, 200, true),
    type: enumValue(item.type, `${path}.type`, productTypes),
    status: enumValue(item.status, `${path}.status`, productStatuses),
    body: text(item.body, `${path}.body`, 20000),
    nodeIds: stringIds(item.nodeIds, `${path}.nodeIds`, limits.nodes),
    relatedIds: stringIds(item.relatedIds, `${path}.relatedIds`, limits.productItems),
    citations: boundedArray(item.citations, `${path}.citations`, 100).map((citation, citationIndex) => (
      validateCitation(citation, `${path}.citations[${citationIndex}]`)
    )),
    criteria,
    alternatives,
  }
  if (result.type === 'evidence' && result.status === 'confirmed' && !result.citations.length) {
    fail(`${path}.citations`, 'confirmed product evidence must have citations')
  }
  return result
}

function validateQuestion(value, index) {
  const path = `questions[${index}]`
  const item = record(value, path, ['id', 'nodeId', 'prompt', 'answer', 'relatedNodeIds'])
  return {
    id: identifier(item.id, `${path}.id`),
    nodeId: identifier(item.nodeId, `${path}.nodeId`),
    prompt: text(item.prompt, `${path}.prompt`, 3000, true),
    answer: text(item.answer, `${path}.answer`, 20000),
    relatedNodeIds: stringIds(item.relatedNodeIds, `${path}.relatedNodeIds`, limits.nodes),
  }
}

function validateAttempt(value, index) {
  const path = `attempts[${index}]`
  const item = record(value, path, ['id', 'questionId', 'answer', 'rating', 'at', 'dueAt', 'errorReason'])
  return {
    id: identifier(item.id, `${path}.id`),
    questionId: identifier(item.questionId, `${path}.questionId`),
    answer: text(item.answer, `${path}.answer`, 20000),
    rating: enumValue(item.rating, `${path}.rating`, ratings),
    at: finite(item.at, `${path}.at`),
    dueAt: finite(item.dueAt, `${path}.dueAt`),
    errorReason: text(item.errorReason, `${path}.errorReason`, 20000),
  }
}

function validateCitationSource(citation, path, sourceById) {
  const source = sourceById.get(citation.sourceId)
  if (!source) fail(path, `references missing source "${citation.sourceId}"`)
  const version = citation.version === source.version
    ? source
    : source.versions.find(item => item.version === citation.version)
  if (!version) fail(path, `references missing source version ${citation.version}`)
  if (citation.end > version.text.length || version.text.slice(citation.start, citation.end) !== citation.quote) {
    fail(path, 'quote and UTF-16 offsets must match the referenced source version exactly')
  }
}

function validateV2WorkspaceData(value) {
  assertWorkspaceJsonSize(value)
  const fields = [
    'schemaVersion', 'revision', 'id', 'title', 'scenario', 'summary', 'sources',
    'nodes', 'relations', 'views', 'flows', 'decisions', 'productItems',
    'questions', 'attempts', 'createdAt', 'updatedAt',
  ]
  const workspace = record(value, 'workspace', fields)
  if (workspace.schemaVersion !== 2) fail('workspace.schemaVersion', 'must equal 2')
  const result = {
    schemaVersion: 2,
    revision: integer(workspace.revision, 'workspace.revision'),
    id: identifier(workspace.id, 'workspace.id'),
    title: text(workspace.title, 'workspace.title', 200, true),
    scenario: enumValue(workspace.scenario, 'workspace.scenario', scenarios),
    summary: text(workspace.summary, 'workspace.summary', 20000),
    sources: boundedArray(workspace.sources, 'workspace.sources', limits.sources).map(validateSource),
    nodes: boundedArray(workspace.nodes, 'workspace.nodes', limits.nodes).map(validateNode),
    relations: boundedArray(workspace.relations, 'workspace.relations', limits.relations).map(validateRelation),
    views: boundedArray(workspace.views, 'workspace.views', limits.views).map(validateView),
    flows: boundedArray(workspace.flows, 'workspace.flows', limits.flows).map(validateFlow),
    decisions: boundedArray(workspace.decisions, 'workspace.decisions', limits.decisions).map(validateDecision),
    productItems: boundedArray(workspace.productItems, 'workspace.productItems', limits.productItems).map(validateProductItem),
    questions: boundedArray(workspace.questions, 'workspace.questions', limits.questions).map(validateQuestion),
    attempts: boundedArray(workspace.attempts, 'workspace.attempts', limits.attempts).map(validateAttempt),
    createdAt: finite(workspace.createdAt, 'workspace.createdAt'),
    updatedAt: finite(workspace.updatedAt, 'workspace.updatedAt'),
  }
  if (!result.views.length) fail('workspace.views', 'must contain at least one view')

  const allIds = [
    result.id,
    ...result.sources.map(item => item.id),
    ...result.nodes.map(item => item.id),
    ...result.relations.map(item => item.id),
    ...result.views.map(item => item.id),
    ...result.flows.flatMap(flow => [flow.id, ...flow.steps.map(step => step.id)]),
    ...result.decisions.map(item => item.id),
    ...result.productItems.flatMap(item => [
      item.id,
      ...item.criteria.map(criterion => criterion.id),
      ...item.alternatives.map(alternative => alternative.id),
    ]),
    ...result.questions.map(item => item.id),
    ...result.attempts.map(item => item.id),
  ]
  unique(allIds, 'workspace identifiers')

  const sourceById = new Map(result.sources.map(source => [source.id, source]))
  const nodeIds = new Set(result.nodes.map(node => node.id))
  const questionIds = new Set(result.questions.map(question => question.id))
  const productIds = new Set(result.productItems.map(item => item.id))
  const checkCitations = (citations, path) => {
    for (const [index, citation] of citations.entries()) {
      validateCitationSource(citation, `${path}[${index}]`, sourceById)
    }
  }
  for (const node of result.nodes) checkCitations(node.citations, `nodes.${node.id}.citations`)
  for (const relation of result.relations) {
    if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to)) fail(`relations.${relation.id}`, 'references a missing node')
  }
  for (const view of result.views) {
    for (const id of view.nodeIds) {
      if (!nodeIds.has(id)) fail(`views.${view.id}.nodeIds`, `references missing node "${id}"`)
    }
    for (const id of view.path) {
      if (!nodeIds.has(id) || !view.nodeIds.includes(id)) fail(`views.${view.id}.path`, `references node "${id}" outside this view`)
    }
    for (const id of Object.keys(view.positions)) {
      if (!nodeIds.has(id) || !view.nodeIds.includes(id)) fail(`views.${view.id}.positions`, `references node "${id}" outside this view`)
    }
  }
  for (const flow of result.flows) {
    for (const step of flow.steps) {
      if (!nodeIds.has(step.from) || !nodeIds.has(step.to)) fail(`flows.${flow.id}.steps.${step.id}`, 'references a missing node')
      checkCitations(step.citations, `flows.${flow.id}.steps.${step.id}.citations`)
      if (step.evidence !== 'unverified' && !step.citations.length) {
        fail(`flows.${flow.id}.steps.${step.id}.citations`, 'static or runtime evidence must have citations')
      }
    }
  }
  for (const decision of result.decisions) {
    for (const id of decision.nodeIds) {
      if (!nodeIds.has(id)) fail(`decisions.${decision.id}.nodeIds`, `references missing node "${id}"`)
    }
    checkCitations(decision.citations, `decisions.${decision.id}.citations`)
  }
  for (const item of result.productItems) {
    for (const id of item.nodeIds) {
      if (!nodeIds.has(id)) fail(`productItems.${item.id}.nodeIds`, `references missing node "${id}"`)
    }
    for (const id of item.relatedIds) {
      if (!productIds.has(id)) fail(`productItems.${item.id}.relatedIds`, `references missing product item "${id}"`)
    }
    checkCitations(item.citations, `productItems.${item.id}.citations`)
  }
  for (const question of result.questions) {
    if (!nodeIds.has(question.nodeId)) fail(`questions.${question.id}`, 'references a missing node')
    for (const id of question.relatedNodeIds) {
      if (!nodeIds.has(id)) fail(`questions.${question.id}.relatedNodeIds`, `references missing node "${id}"`)
    }
  }
  for (const attempt of result.attempts) {
    if (!questionIds.has(attempt.questionId)) fail(`attempts.${attempt.id}`, 'references a missing question')
  }
  validatePrerequisites(result.nodes, result.relations, result.views.map(view => view.path), 'workspace.views')
  return result
}

function validateWorkspaceData(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('workspace', 'must be an object')
  assertWorkspaceJsonSize(value)
  if (value.schemaVersion === 1) return migrateLegacyWorkspace(validateLegacyWorkspaceData(value))
  if (value.schemaVersion === 2) return validateV2WorkspaceData(value)
  fail('workspace.schemaVersion', 'must equal 1 or 2')
}

function normalizeGeneratedNode(value, index, base) {
  const path = `generated content.nodes[${index}]`
  const fields = ['id', 'title', 'kind', 'body', 'example', 'pitfall', 'notes', 'acceptance', 'citations', 'provenance', 'x', 'y']
  const item = record(value, path, fields, fields.filter(field => field !== 'x' && field !== 'y'))
  const node = {
    id: identifier(item.id, `${path}.id`),
    title: text(item.title, `${path}.title`, 200, true),
    kind: enumValue(item.kind, `${path}.kind`, nodeKinds),
    body: text(item.body, `${path}.body`, 20000),
    example: text(item.example, `${path}.example`, 10000),
    pitfall: text(item.pitfall, `${path}.pitfall`, 10000),
    notes: text(item.notes, `${path}.notes`, 10000),
    acceptance: text(item.acceptance, `${path}.acceptance`, 10000),
    provenance: enumValue(item.provenance, `${path}.provenance`, new Set(['user', 'ai', 'demo'])),
    citations: boundedArray(item.citations, `${path}.citations`, 100).map((citation, citationIndex) => {
      const citationPath = `${path}.citations[${citationIndex}]`
      if (citation && Object.hasOwn(citation, 'version')) {
        const canonical = validateCitation(citation, citationPath)
        const source = base.sources.find(candidate => candidate.id === canonical.sourceId)
        if (!source || canonical.version !== source.version) fail(citationPath, 'must cite the current source version')
        validateCitationSource(canonical, citationPath, new Map([[source.id, source]]))
        return canonical
      }
      const legacyCitation = record(citation, citationPath, ['sourceId', 'quote'])
      const sourceId = identifier(legacyCitation.sourceId, `${citationPath}.sourceId`)
      const quote = text(legacyCitation.quote, `${citationPath}.quote`, 20000, true)
      const source = base.sources.find(candidate => candidate.id === sourceId)
      if (!source) fail(citationPath, `references missing source "${sourceId}"`)
      const start = source.text.indexOf(quote)
      if (start < 0) fail(citationPath, 'quote must be an exact substring of its current source')
      return { sourceId, quote, version: source.version, start, end: start + quote.length }
    }),
  }
  if (item.x !== undefined) node.x = finite(item.x, `${path}.x`)
  if (item.y !== undefined) node.y = finite(item.y, `${path}.y`)
  return node
}

function validateGeneratedContentData(value, baseWorkspace) {
  const base = validateWorkspaceData(baseWorkspace)
  const fields = ['title', 'summary', 'nodes', 'relations', 'path', 'questions']
  const generated = record(value, 'generated content', fields)
  const nodesWithProjection = boundedArray(generated.nodes, 'generated content.nodes', limits.nodes)
    .map((node, index) => normalizeGeneratedNode(node, index, base))
  if (!nodesWithProjection.length) fail('generated content.nodes', 'must contain at least one generated node')
  for (const [index, node] of nodesWithProjection.entries()) {
    if (node.provenance !== 'ai') fail(`generated content.nodes[${index}].provenance`, 'must be ai')
  }
  const relations = boundedArray(generated.relations, 'generated content.relations', limits.relations)
    .map(validateRelation)
  const path = stringIds(generated.path, 'generated content.path', limits.path)
  const generatedNodeIds = new Set(nodesWithProjection.map(node => node.id))
  const questions = boundedArray(generated.questions, 'generated content.questions', limits.questions)
    .map((question, index) => {
      const questionPath = `generated content.questions[${index}]`
      const item = record(question, questionPath, ['id', 'nodeId', 'prompt', 'answer', 'relatedNodeIds'], [
        'id', 'nodeId', 'prompt', 'answer',
      ])
      const relatedNodeIds = item.relatedNodeIds === undefined
        ? []
        : stringIds(item.relatedNodeIds, `${questionPath}.relatedNodeIds`, limits.nodes)
      return {
        id: identifier(item.id, `${questionPath}.id`),
        nodeId: identifier(item.nodeId, `${questionPath}.nodeId`),
        prompt: text(item.prompt, `${questionPath}.prompt`, 3000, true),
        answer: text(item.answer, `${questionPath}.answer`, 20000),
        relatedNodeIds,
      }
    })
  const candidateNodes = nodesWithProjection.map(({ x, y, ...node }) => node)
  const positions = { ...base.views[0].positions }
  for (const node of nodesWithProjection) {
    if (node.x !== undefined || node.y !== undefined) positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 }
  }
  const candidateView = {
    ...base.views[0],
    nodeIds: candidateNodes.map(node => node.id),
    path,
    positions,
  }
  const candidate = validateV2WorkspaceData({
    ...base,
    title: text(generated.title, 'generated content.title', 200, true),
    summary: text(generated.summary, 'generated content.summary', 20000),
    nodes: candidateNodes,
    relations,
    views: [candidateView, ...base.views.slice(1)],
    questions,
  })
  if (candidate.nodes.some(node => !generatedNodeIds.has(node.id))) {
    fail('generated content.nodes', 'must contain only generated nodes')
  }
  return {
    title: candidate.title,
    summary: candidate.summary,
    nodes: nodesWithProjection,
    relations: candidate.relations,
    path: candidateView.path,
    questions: candidate.questions,
  }
}

function validateRevisionData(value) {
  const fields = ['id', 'workspaceId', 'createdAt', 'label', 'snapshot']
  const revision = record(value, 'revision', fields)
  const result = {
    id: identifier(revision.id, 'revision.id'),
    workspaceId: identifier(revision.workspaceId, 'revision.workspaceId'),
    createdAt: finite(revision.createdAt, 'revision.createdAt'),
    label: text(revision.label, 'revision.label', 200, true),
    snapshot: validateWorkspaceData(revision.snapshot),
  }
  if (result.snapshot.id !== result.workspaceId) fail('revision.snapshot', 'must belong to this workspace')
  return result
}

export { limits, validateGeneratedContentData, validateRevisionData, validateWorkspaceData }
