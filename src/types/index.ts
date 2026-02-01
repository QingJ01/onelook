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
    icon?: string     // 图标标识
    priority?: number  // 1-9
    progress?: number  // 0-100
    tags?: string[]
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
