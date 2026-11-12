export type Template = 'architecture' | 'product' | 'course' | 'concept' | 'book'
export type NodeKind = 'component' | 'interface' | 'requirement' | 'actor' | 'state' | 'concept' | 'claim' | 'step' | 'example'
export type ViewForm = 'graph' | 'tree' | 'flow' | 'matrix' | 'timeline'
export type Provenance = 'user' | 'ai' | 'demo'
export type RelationKind = 'calls' | 'depends' | 'implements' | 'next' | 'prerequisite' | 'compares' | 'supports' | 'contradicts' | 'partOf' | 'causes' | 'defines' | 'evaluates'
export type DocumentType = 'article' | 'paper' | 'code' | 'product' | 'course' | 'mixed' | 'unknown'
export type Certainty = 'supported' | 'inferred' | 'unverified'
export interface SourceVersion { version: number; text: string; createdAt: number; filePath?: string; revision?: string }
export interface Source extends SourceVersion { id: string; title: string; url?: string; versions: SourceVersion[] }
export interface Citation { sourceId: string; quote: string; version: number; start: number; end: number }
export interface KnowledgeNode {
  id: string; title: string; kind: NodeKind; body: string; example: string;
  pitfall: string; notes: string; acceptance: string; citations: Citation[];
  provenance: Provenance; certainty: Certainty; x?: number; y?: number
}
export interface Relation { id: string; from: string; to: string; kind: RelationKind; label: string }
export interface Question { id: string; nodeId: string; prompt: string; answer: string; relatedNodeIds: string[]; stepId: string }
export interface Attempt { id: string; questionId: string; answer: string; rating: 'again' | 'good'; at: number; dueAt: number; errorReason: string }
export interface WorkspaceView {
  id: string; title: string; form: ViewForm;
  nodeIds: string[]; positions: Record<string, { x: number; y: number }>
}
/** One step of the explanation: a single point, shown on one stage (a view or a content block). */
export interface StoryStep {
  id: string; title: string; narration: string; stageId: string;
  reveal: string[]; focus: string[]; citations: Citation[]; provenance: Provenance
}
export interface FlowStep {
  id: string; from: string; to: string; message: string; condition: string;
  branch: 'main' | 'failure' | 'alternative'; evidence: 'unverified' | 'static' | 'runtime'; citations: Citation[]
}
export interface RequestFlow { id: string; title: string; steps: FlowStep[] }
export interface DesignDecision {
  id: string; title: string; context: string; choice: string; alternatives: string;
  consequences: string; nodeIds: string[]; citations: Citation[]
}
export interface AcceptanceCriterion { id: string; text: string; state: 'pending' | 'passed' | 'failed'; evidence: string }
export interface ProductAlternative { id: string; title: string; benefits: string; costs: string }
export interface ProductItem {
  id: string; title: string; type: 'evidence' | 'hypothesis' | 'decision';
  status: 'unverified' | 'confirmed' | 'rejected'; body: string; nodeIds: string[];
  relatedIds: string[]; citations: Citation[]; criteria: AcceptanceCriterion[]; alternatives: ProductAlternative[]
}
export interface Workspace {
  schemaVersion: 3; revision: number; id: string; title: string; template: Template;
  question: string; takeaway: string; audience: string; summary: string;
  sources: Source[]; nodes: KnowledgeNode[]; relations: Relation[]; views: WorkspaceView[]; story: StoryStep[];
  flows: RequestFlow[]; decisions: DesignDecision[]; productItems: ProductItem[];
  questions: Question[]; attempts: Attempt[]; createdAt: number; updatedAt: number
}
export interface Revision { id: string; workspaceId: string; createdAt: number; label: string; snapshot: Workspace }
export interface AISettings { baseUrl: string; model: string; apiKey: string }
export interface GeneratedContent { title: string; summary: string; nodes: KnowledgeNode[]; relations: Relation[]; path: string[]; story: StoryStep[]; questions: Question[] }
export interface OutlineStep { title: string; narration: string; form: ViewForm; reveal: string[]; focus: string[]; citations: Citation[] }
export interface StoryOutline { question: string; takeaway: string; audience: string; steps: OutlineStep[] }
export type RestepMode = 'simpler' | 'example' | 'analogy'
export const templates: Record<Template, { name: string; hint: string; form: ViewForm; kind: NodeKind }> = {
  architecture: { name: '编程项目', hint: '结构、一条主链路、关键取舍', form: 'graph', kind: 'component' },
  product: { name: '产品方案', hint: '问题、流程、取舍与验收', form: 'flow', kind: 'requirement' },
  course: { name: '课程学习', hint: '概念、先修关系与练习', form: 'graph', kind: 'concept' },
  concept: { name: '概念', hint: '定义、例子、反例与相邻概念', form: 'tree', kind: 'concept' },
  book: { name: '书或文章', hint: '核心主张、论证与脉络', form: 'tree', kind: 'claim' },
}
export const viewForms: Record<ViewForm, { name: string; answers: string }> = {
  graph: { name: '关系图', answers: '它们之间有什么关系' },
  tree: { name: '思维图', answers: '它是什么、由什么组成' },
  flow: { name: '流程图', answers: '它怎么运作、先后顺序' },
  matrix: { name: '对比表', answers: '有什么不同、怎么选' },
  timeline: { name: '时间线', answers: '它怎么演变' },
}
export const nodeKinds: Record<NodeKind, string> = { component: '组件', interface: '接口', requirement: '需求', actor: '角色', state: '状态', concept: '概念', claim: '主张', step: '步骤', example: '例子' }
export const relationKinds: Record<RelationKind, string> = { calls: '调用', depends: '依赖', implements: '实现', next: '下一步', prerequisite: '先修', compares: '对比', supports: '支持', contradicts: '矛盾', partOf: '组成', causes: '导致', defines: '定义', evaluates: '评估' }
export const documentTypes: Record<DocumentType, string> = { article: '技术文章', paper: '论文', code: '项目源码', product: '产品材料', course: '课程材料', mixed: '混合材料', unknown: '未识别' }
export const certaintyKinds: Record<Certainty, string> = { supported: '原文支持', inferred: 'AI 推断', unverified: '待核实' }
export interface UnderstandingEntity { id: string; title: string; kind: NodeKind; description: string; certainty: Certainty; citations: Citation[] }
export interface UnderstandingRelation { id: string; from: string; to: string; semantic: RelationKind; label: string; certainty: Certainty; citations: Citation[] }
export interface SuggestedView { title: string; form: ViewForm; reason: string }
export interface MaterialUnderstanding {
  documentType: DocumentType; summary: string;
  coverage: { analyzedSourceIds: string[]; skippedSourceIds: string[]; omissions: string[] };
  entities: UnderstandingEntity[]; relations: UnderstandingRelation[];
  suggestedViews: SuggestedView[]; gaps: string[]; questions: { prompt: string; answer: string }[]
}
export interface RepoImport { repo: string; ref: string; files: { path: string; text: string }[]; skipped: { path: string; reason: string }[] }
