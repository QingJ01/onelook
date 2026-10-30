export type Scenario = 'architecture' | 'product' | 'course'
export type NodeKind = 'component' | 'interface' | 'requirement' | 'actor' | 'state' | 'concept'
export type RelationKind = 'calls' | 'depends' | 'implements' | 'next' | 'prerequisite' | 'compares'
export interface Source { id: string; title: string; text: string; url?: string; createdAt: number }
export interface Citation { sourceId: string; quote: string }
export interface KnowledgeNode {
  id: string; title: string; kind: NodeKind; body: string; example: string;
  pitfall: string; notes: string; acceptance: string; citations: Citation[];
  provenance: 'user' | 'ai' | 'demo'; x?: number; y?: number
}
export interface Relation { id: string; from: string; to: string; kind: RelationKind; label: string }
export interface Question { id: string; nodeId: string; prompt: string; answer: string }
export interface Attempt { id: string; questionId: string; answer: string; rating: 'again' | 'good'; at: number; dueAt: number }
export interface Workspace {
  schemaVersion: 1; id: string; title: string; scenario: Scenario; summary: string;
  sources: Source[]; nodes: KnowledgeNode[]; relations: Relation[]; path: string[];
  questions: Question[]; attempts: Attempt[]; createdAt: number; updatedAt: number
}
export interface Revision { id: string; workspaceId: string; createdAt: number; label: string; snapshot: Workspace }
export interface AISettings { baseUrl: string; model: string; apiKey: string }
export interface GeneratedContent { title: string; summary: string; nodes: KnowledgeNode[]; relations: Relation[]; path: string[]; questions: Question[] }
export const scenarios: Record<Scenario, { name: string; description: string; color: string; action: string }> = {
  architecture: { name: '项目 / 技术架构', description: '看清结构，沿着真实链路理解系统', color: '#5366d9', action: '开始链路讲解' },
  product: { name: '产品设计', description: '从用户问题，到流程、取舍与验收', color: '#bc7844', action: '开始方案演示' },
  course: { name: '课程备考', description: '连接知识、练习与每一次复习', color: '#258b78', action: '开始学习' },
}
export const nodeKinds: Record<NodeKind, string> = { component: '组件', interface: '接口', requirement: '需求', actor: '角色', state: '状态', concept: '概念' }
export const relationKinds: Record<RelationKind, string> = { calls: '调用', depends: '依赖', implements: '实现', next: '下一步', prerequisite: '先修', compares: '对比' }
