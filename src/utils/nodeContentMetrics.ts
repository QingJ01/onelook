import type { MindMapNode } from '@/types'
import { getCodeGeometry, getTableGeometry } from './specialNodes'

const TEXT_WIDTH_PATTERN = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g

const MIN_NODE_WIDTH = 60
const MAX_TEXT_NODE_WIDTH = 300
const MAX_IMAGE_NODE_WIDTH = 420
const MIN_NODE_HEIGHT = 36
const LINE_HEIGHT_RATIO = 1.4

export const NODE_IMAGE_WIDTH_DEFAULT = 220
export const NODE_IMAGE_WIDTH_MIN = 80
export const NODE_IMAGE_WIDTH_MAX = 260

const IMAGE_BASE_WIDTH = NODE_IMAGE_WIDTH_DEFAULT
const IMAGE_MIN_NODE_WIDTH = 220
const IMAGE_MIN_WIDTH = NODE_IMAGE_WIDTH_MIN
const IMAGE_MAX_WIDTH = NODE_IMAGE_WIDTH_MAX
const IMAGE_LAYOUT_HEIGHT_RATIO_FALLBACK = 0.68
const IMAGE_LAYOUT_HEIGHT_RATIO_MIN = 0.35
const IMAGE_LAYOUT_HEIGHT_RATIO_MAX = 1.2
const IMAGE_VERTICAL_GAP = 8

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function getNodeContentSpacing(fontSize = 14): {
    paddingX: number
    paddingY: number
    imageTextGap: number
} {
    const safeFontSize = Number.isFinite(fontSize) ? fontSize : 14
    const paddingX = clamp(Math.round(safeFontSize * 0.85), 10, 20)
    const paddingY = clamp(Math.round(safeFontSize * 0.55), 6, 14)
    const imageTextGap = clamp(Math.round(safeFontSize * 0.55), 6, 14)
    return { paddingX, paddingY, imageTextGap }
}

function estimateTextWidth(text: string): number {
    let width = 0
    for (const char of text) {
        width += TEXT_WIDTH_PATTERN.test(char) ? 14 : 8
    }
    return width
}

function getFontMetrics(node: MindMapNode) {
    const fontSize = node.style?.fontSize || 14
    const fontScale = fontSize / 14
    return { fontSize, fontScale }
}

function getMarkdownImageCount(text: string): number {
    if (!text) return 0
    let count = 0
    const matches = text.matchAll(MARKDOWN_IMAGE_PATTERN)
    for (const _ of matches) {
        count += 1
    }
    return count
}

function hasNodeDataImage(node: MindMapNode): boolean {
    const image = node.data?.image
    return typeof image === 'string' && image.trim().length > 0
}

export function normalizeNodeImageWidth(width?: number): number {
    if (typeof width !== 'number' || !Number.isFinite(width)) return NODE_IMAGE_WIDTH_DEFAULT
    return Math.max(IMAGE_MIN_WIDTH, Math.min(IMAGE_MAX_WIDTH, Math.round(width)))
}

export function normalizeNodeImageAspectRatio(aspectRatio?: number): number {
    if (typeof aspectRatio !== 'number' || !Number.isFinite(aspectRatio)) {
        return IMAGE_LAYOUT_HEIGHT_RATIO_FALLBACK
    }
    return clamp(aspectRatio, IMAGE_LAYOUT_HEIGHT_RATIO_MIN, IMAGE_LAYOUT_HEIGHT_RATIO_MAX)
}

export function estimateNodeImageHeight(width: number, aspectRatio?: number): number {
    const ratio = normalizeNodeImageAspectRatio(aspectRatio)
    return Math.max(1, Math.round(width * ratio))
}

function stripMarkdownForMeasure(text: string): string {
    if (!text) return ''

    return text
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s*[-+*]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[*_`~>#]/g, '')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function estimateWrappedLineCount(text: string, contentWidth: number, fontScale: number): number {
    if (!text.trim()) return 0

    const lines = text.split('\n')
    let total = 0
    for (const line of lines) {
        const lineText = line.trim()
        if (!lineText) {
            total += 1
            continue
        }
        const lineWidth = estimateTextWidth(lineText) * fontScale
        total += Math.max(1, Math.ceil(lineWidth / contentWidth))
    }
    return Math.max(1, total)
}

/** 估算文本是否超出单行宽度（需走可换行的富文本渲染分支） */
export function willTextWrap(text: string): boolean {
    const longestLine = (text || '').split('\n').reduce((a, b) => (estimateTextWidth(b) > estimateTextWidth(a) ? b : a), '')
    return estimateTextWidth(longestLine) > MAX_TEXT_NODE_WIDTH - 28
}

const TALL_LATEX = /\\(frac|dfrac|tfrac|sqrt|sum|prod|int|iint|iiint|lim|binom|matrix|array|cases|aligned|substack|over|underbrace)/

/**
 * 估算文本中 LaTeX 公式的渲染高度（px）。
 * KaTeX 的 display 公式自带上下留白，且分式/求和/积分/矩阵等结构更高——
 * 节点高度必须容纳它们，否则 overflow:hidden 会裁掉公式（看起来像没渲染）。
 */
export function estimateLatexHeight(text: string, fontSize = 14): number {
    if (!text || !text.includes('$')) return 0
    const lineHeight = fontSize * LINE_HEIGHT_RATIO
    let maxHeight = 0

    const measure = (formula: string, display: boolean): number => {
        let h = lineHeight
        if (display) h += fontSize * 0.45
        if (TALL_LATEX.test(formula)) h += fontSize * 1.15
        if (/\\(matrix|array|cases|aligned|substack)/.test(formula)) h += fontSize * 0.9
        if (/(\\sum|\\prod|\\int)/.test(formula) && /[_^]/.test(formula)) h += fontSize * 0.55
        return h
    }

    for (const match of text.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
        maxHeight = Math.max(maxHeight, measure(match[1], true))
    }
    for (const match of text.matchAll(/\$([^$\n]+?)\$/g)) {
        maxHeight = Math.max(maxHeight, measure(match[1], false))
    }
    return maxHeight
}

export function hasMarkdownImage(text: string): boolean {
    return /!\[[^\]]*\]\(([^)]+)\)/.test(text)
}

export function calculateNodeSize(node: MindMapNode): { width: number; height: number } {
    // 表格/代码块节点：几何由 specialNodes 统一计算（布局锚点与渲染同源）
    if (node.data?.table) {
        const geo = getTableGeometry(node)
        if (geo) return { width: geo.width, height: geo.height }
    }
    if (node.data?.code) {
        return getCodeGeometry(node)
    }

    const { fontSize, fontScale } = getFontMetrics(node)
    const { paddingX, paddingY, imageTextGap } = getNodeContentSpacing(fontSize)
    const totalPaddingX = paddingX * 2
    const totalPaddingY = paddingY * 2
    const iconWidth = node.data?.icon ? 24 : 0
    const markdownImageCount = getMarkdownImageCount(node.text)
    const hasDataImage = hasNodeDataImage(node)
    const imageCount = markdownImageCount + (hasDataImage ? 1 : 0)
    const measuredText = stripMarkdownForMeasure(node.text)
    const textWidth = estimateTextWidth(measuredText) * fontScale

    // Keep text layout stable: image width control should not change node text wrapping width.
    const preferredDataImageWidth = hasDataImage ? IMAGE_BASE_WIDTH : 0
    const preferredImageContentWidth = Math.max(
        markdownImageCount > 0 ? IMAGE_BASE_WIDTH : 0,
        preferredDataImageWidth
    )
    const maxWidth = imageCount > 0 ? MAX_IMAGE_NODE_WIDTH : MAX_TEXT_NODE_WIDTH
    const imagePreferredWidth = imageCount > 0 ? preferredImageContentWidth + totalPaddingX + iconWidth : 0
    const baseWidth = Math.max(textWidth + totalPaddingX + iconWidth, imagePreferredWidth)
    const width = Math.max(
        imageCount > 0 ? IMAGE_MIN_NODE_WIDTH : MIN_NODE_WIDTH,
        Math.min(maxWidth, baseWidth)
    )

    const contentWidth = Math.max(1, width - totalPaddingX - iconWidth)
    const lineCount = estimateWrappedLineCount(measuredText, contentWidth, fontScale)
    const lineHeight = fontSize * LINE_HEIGHT_RATIO
    const textHeight = lineCount > 0 ? lineHeight * lineCount : 0

    const imageHeights: number[] = []
    if (markdownImageCount > 0) {
        const markdownImageWidth = Math.max(IMAGE_MIN_WIDTH, Math.min(contentWidth, IMAGE_BASE_WIDTH))
        const markdownImageHeight = estimateNodeImageHeight(markdownImageWidth)
        for (let i = 0; i < markdownImageCount; i++) {
            imageHeights.push(markdownImageHeight)
        }
    }
    if (hasDataImage) {
        const chosenImageWidth = normalizeNodeImageWidth(node.data?.imageWidth)
        const dataImageWidth = Math.max(IMAGE_MIN_WIDTH, Math.min(contentWidth, chosenImageWidth))
        imageHeights.push(estimateNodeImageHeight(dataImageWidth, node.data?.imageAspectRatio))
    }
    const imageHeight = imageHeights.length > 0
        ? imageHeights.reduce((total, h) => total + h, 0) + Math.max(0, imageHeights.length - 1) * IMAGE_VERTICAL_GAP
        : 0

    const gapBetweenTextAndImage = textHeight > 0 && imageHeight > 0 ? imageTextGap : 0
    // 公式可能比纯文本更高：节点高度需容纳 KaTeX 的真实排版
    const latexHeight = estimateLatexHeight(node.text, fontSize)
    const contentHeight = Math.max(textHeight, latexHeight)
    const height = Math.max(
        MIN_NODE_HEIGHT,
        Math.ceil(contentHeight + imageHeight + gapBetweenTextAndImage + totalPaddingY)
    )

    return { width, height }
}
