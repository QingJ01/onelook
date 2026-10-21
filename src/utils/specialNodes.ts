import type { MindMapNode, NodeData } from '@/types'

/**
 * 特殊节点（表格/代码块）的判定与共享几何。
 * 布局（锚点定位）、尺寸计算、渲染三方必须使用同一套几何，集中在这一处。
 */

// ---------- 判定 ----------

export function isTableNode(node: MindMapNode): boolean {
    return Array.isArray(node.data?.table?.header)
}

export function isCodeNode(node: MindMapNode): boolean {
    return !!node.data?.code
}

export function getCellAnchor(node: MindMapNode): { row: number; col: number } | null {
    const anchor = node.data?.cellAnchor
    if (!anchor || !Number.isFinite(anchor.row) || !Number.isFinite(anchor.col)) return null
    return anchor
}

// ---------- 表格几何 ----------

export const TABLE_ROW_HEIGHT = 30
export const TABLE_MIN_COL_WIDTH = 64
export const TABLE_MAX_COL_WIDTH = 220
export const TABLE_CELL_PAD_X = 12

export interface TableGeometry {
    colWidths: number[]
    width: number
    height: number
    rowCount: number // 含表头
    colCount: number
    /** 单元格中心相对表格左上角的坐标 */
    cellRect(row: number, col: number): { x: number; y: number; width: number; height: number }
}

function estimateCellWidth(text: string): number {
    let w = 0
    for (const ch of String(text ?? '')) {
        w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 14 : 8
    }
    return w
}

export function getTableGeometry(node: MindMapNode): TableGeometry | null {
    const table = node.data?.table
    if (!table || !Array.isArray(table.header)) return null
    const colCount = Math.max(1, table.header.length)
    const rows = table.rows || []

    const colWidths: number[] = []
    for (let c = 0; c < colCount; c++) {
        let max = estimateCellWidth(table.header[c] ?? '')
        for (const row of rows) {
            max = Math.max(max, estimateCellWidth(row?.[c] ?? ''))
        }
        colWidths.push(Math.min(TABLE_MAX_COL_WIDTH, Math.max(TABLE_MIN_COL_WIDTH, max + TABLE_CELL_PAD_X * 2)))
    }

    const width = colWidths.reduce((a, b) => a + b, 0) + 2
    const rowCount = rows.length + 1
    const height = rowCount * TABLE_ROW_HEIGHT + 2

    return {
        colWidths,
        width,
        height,
        rowCount,
        colCount,
        cellRect(row, col) {
            let x = 1
            for (let c = 0; c < col; c++) x += colWidths[c]
            return {
                x,
                y: 1 + row * TABLE_ROW_HEIGHT,
                width: colWidths[col] ?? TABLE_MIN_COL_WIDTH,
                height: TABLE_ROW_HEIGHT,
            }
        },
    }
}

/** 表格行列增删后修正子节点锚点（越界收敛到边缘） */
export function clampCellAnchors(children: MindMapNode[], rowCount: number, colCount: number): void {
    for (const child of children) {
        const anchor = child.data?.cellAnchor
        if (!anchor) continue
        anchor.row = Math.max(0, Math.min(rowCount - 1, anchor.row))
        anchor.col = Math.max(0, Math.min(colCount - 1, anchor.col))
    }
}

// ---------- 代码块几何 ----------

export const CODE_LINE_HEIGHT = 19
export const CODE_FONT_WIDTH = 7.4 // 13px 等宽字体的近似字符宽
export const CODE_HEADER_HEIGHT = 22
export const CODE_MIN_WIDTH = 140
export const CODE_MAX_WIDTH = 460
export const CODE_MAX_HEIGHT = 360

export function getCodeGeometry(node: MindMapNode): { width: number; height: number } {
    const lines = (node.text || '').split('\n')
    // 等宽字体里 CJK 字符宽度接近 ASCII 的两倍；宁可略高估也不截断行尾
    const lineWidth = (line: string) => {
        let w = 0
        for (const ch of line) {
            w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 14 : 8
        }
        return w
    }
    const maxWidth = lines.reduce((m, l) => Math.max(m, lineWidth(l)), 0)
    const width = Math.max(
        CODE_MIN_WIDTH,
        Math.min(CODE_MAX_WIDTH, maxWidth + 28)
    )
    const height = Math.min(
        CODE_MAX_HEIGHT,
        Math.max(CODE_HEADER_HEIGHT + CODE_LINE_HEIGHT, lines.length * CODE_LINE_HEIGHT + CODE_HEADER_HEIGHT + 16)
    )
    return { width, height }
}

// ---------- 默认数据 ----------

export function defaultTableData(): NodeData['table'] {
    return {
        header: ['列 1', '列 2', '列 3'],
        rows: [['', '', '']],
    }
}

export function defaultCodeData(): NodeData['code'] {
    return { language: 'python' }
}

export function defaultCodeText(): string {
    return 'def hello():\n    print("hello")\n\nhello()'
}
