/**
 * OneLook 核心类型定义
 */

// 节点形状类型
export type NodeShape = 'rect' | 'round' | 'diamond' | 'ellipse'

// 节点样式
export interface NodeStyle {
    background?: string
    color?: string
    fontSize?: number
    fontWeight?: 'normal' | 'bold'
    shape?: NodeShape
    borderColor?: string
    borderWidth?: number
}

// 节点扩展数据
export interface NodeData {
    note?: string
    hyperlink?: string
    image?: string
    imageWidth?: number
    imageAspectRatio?: number
    icon?: string     // 图标标识
    priority?: number  // 1-9
    progress?: number  // 0-100
    tags?: string[]
    // 代码块节点：node.text 即代码内容
    code?: { language: string }
    // 表格节点
    table?: { header: string[]; rows: string[][] }
    // 表格节点的子节点：挂靠的单元格（row 含表头，0=表头行）
    cellAnchor?: { row: number; col: number }
    // vault 引用节点：本节点是 (docId, nodeId) 处节点的活镜像——
    // 负载（text/data/style）双向同步，子节点各自本地、互不继承
    ref?: { docId: string; nodeId: string; docName?: string }
}

// 概要定义
export interface NodeSummary {
    text: string       // 概要文本
    startIndex: number // 起始子节点索引
    endIndex: number   // 结束子节点索引
}

// 思维导图节点
export interface MindMapNode {
    id: string
    text: string  // 支持 Markdown + LaTeX ($...$)
    parentId?: string
    children: MindMapNode[]
    isExpanded: boolean
    style?: NodeStyle
    data?: NodeData
    // 概要（对子节点的归纳）
    summary?: NodeSummary
    // 自定义位置（相对于父节点的偏移，用于自由拖拽）
    position?: { x: number; y: number }
    // 运行时数据（不持久化）
    _x?: number
    _y?: number
    _width?: number
    _height?: number
}

// 布局类型
export type LayoutType = 'mind' | 'tree' | 'fishbone' | 'org'

// 主题类型
export type ThemeType = 'light' | 'dark' | 'fresh'

// 连线样式
export type ConnectionStyle = 'curve' | 'straight' | 'polyline'

// 思维导图文档
export interface MindMapDocument {
    id: string
    // 文档类型标记：缺省/`mindmap` 均为导图（向后兼容旧 .olook）
    type?: 'mindmap'
    name: string
    root: MindMapNode
    layout: LayoutType
    theme: ThemeType
    connectionStyle?: ConnectionStyle  // 连线样式
    rainbowBranch?: boolean  // 彩虹分支
    createdAt: number
    updatedAt: number
    version: string
}

// 视图状态
export interface ViewState {
    zoom: number
    panX: number
    panY: number
}

// 选中状态
export interface SelectionState {
    selectedIds: string[]
    focusedId?: string
}

// ==================== 流程图（独立文档类型） ====================
//
// 流程图与思维导图是两种独立文档：节点模型不同（图 vs 树）、布局器不同，
// 不共享绑定关系（vault 只扫导图），也不提供任何类型互转。

export type FlowNodeKind = 'start' | 'end' | 'process' | 'decision' | 'io' | 'note'

/** 流程图节点：图节点（无 children，连接由 FlowEdge 表达） */
export interface FlowNode {
    id: string
    kind: FlowNodeKind
    text: string
    /** 手动位置（可选）；未指定时由分层布局器计算 */
    position?: { x: number; y: number }
    style?: NodeStyle
    // 运行时字段（不持久化）
    _x?: number
    _y?: number
    _width?: number
    _height?: number
}

/** 流程图边：有向连接 */
export interface FlowEdge {
    id: string
    from: string
    to: string
    label?: string
}

/** 流程图文档 */
export interface FlowDocument {
    id: string
    type: 'flowchart'
    name: string
    nodes: FlowNode[]
    edges: FlowEdge[]
    theme?: ThemeType
    createdAt: number
    updatedAt: number
    version: string
}

/** 存储层的文档联合类型 */
export type AnyDocument = MindMapDocument | FlowDocument

export function isFlowDocument(doc: AnyDocument): doc is FlowDocument {
    return (doc as FlowDocument).type === 'flowchart'
}

export function isMindMapDocument(doc: AnyDocument): doc is MindMapDocument {
    return !isFlowDocument(doc)
}
