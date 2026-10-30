const scenarios = new Set(['architecture', 'product', 'course'])
const nodeKinds = new Set(['component', 'interface', 'requirement', 'actor', 'state', 'concept'])
const relationKinds = new Set(['calls', 'depends', 'implements', 'next', 'prerequisite', 'compares'])
const ratings = new Set(['again', 'good'])
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/

const limits = {
  sources: 100,
  nodes: 60,
  relations: 300,
  path: 60,
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

function validateNode(value, index) {
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

function validateWorkspaceData(value) {
  const fields = ['schemaVersion', 'id', 'title', 'scenario', 'summary', 'sources', 'nodes', 'relations', 'path', 'questions', 'attempts', 'createdAt', 'updatedAt']
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
      if (item.url !== undefined) {
        const url = text(item.url, `${path}.url`, 2048, true)
        let parsed
        try {
          parsed = new URL(url)
        } catch {
          fail(`${path}.url`, 'must be an absolute HTTP(S) URL')
        }
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
          fail(`${path}.url`, 'must be an absolute HTTP(S) URL without credentials')
        }
        result.url = url
      }
      return result
    }),
    nodes: boundedArray(workspace.nodes, 'workspace.nodes', limits.nodes).map(validateNode),
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
    path: boundedArray(workspace.path, 'workspace.path', limits.path).map((id, index) => identifier(id, `path[${index}]`)),
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
  const relationIds = new Set(result.relations.map(relation => relation.id))
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

  const prerequisites = new Map([...nodeIds].map(id => [id, []]))
  for (const relation of result.relations) {
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

  const pathPositions = new Map(result.path.map((id, index) => [id, index]))
  for (const relation of result.relations) {
    if (relation.kind !== 'prerequisite') continue
    const fromPosition = pathPositions.get(relation.from)
    const toPosition = pathPositions.get(relation.to)
    if (fromPosition !== undefined && toPosition !== undefined && fromPosition >= toPosition) {
      fail('workspace.path', `must place prerequisite "${relation.from}" before "${relation.to}"`)
    }
  }
  return result
}

function validateGeneratedContentData(value, baseWorkspace) {
  const base = validateWorkspaceData(baseWorkspace)
  const fields = ['title', 'summary', 'nodes', 'relations', 'path', 'questions']
  const generated = record(value, 'generated content', fields)
  const candidate = validateWorkspaceData({
    ...base,
    title: generated.title,
    summary: generated.summary,
    nodes: generated.nodes,
    relations: generated.relations,
    path: generated.path,
    questions: generated.questions,
    attempts: [],
  })
  return {
    title: candidate.title,
    summary: candidate.summary,
    nodes: candidate.nodes,
    relations: candidate.relations,
    path: candidate.path,
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
