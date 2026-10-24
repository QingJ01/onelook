import katex from 'katex'

/**
 * 渲染文本中的 LaTeX 公式
 * 支持 $...$ 行内公式和 $$...$$ 块级公式
 */
function decodeEntities(input: string): string {
    return input
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
}

export interface LatexRenderOptions {
    /**
     * KaTeX 输出形态：
     * - html（默认）：排版最精细，适用于普通 HTML 容器（编辑器预览/属性面板）
     * - mathml：仅输出原生 MathML。画布节点在 SVG foreignObject 内绘制时，
     *   WebKit（WKWebView/Safari）不绘制 KaTeX 的 HTML 子树，节点里必须用
     *   MathML 才能显示公式。
     */
    output?: 'html' | 'mathml'
}

export function renderLatex(text: string, options: LatexRenderOptions = {}): string {
    if (!text) return text
    const output = options.output ?? 'html'

    // 先处理块级公式 $$...$$
    let result = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
        try {
            const rendered = katex.renderToString(decodeEntities(formula).trim(), {
                displayMode: true,
                throwOnError: false,
                output
            })
            const wrapped = output === 'mathml'
                ? `<span class="katex-mathml-node">${rendered}</span>`
                : rendered
            return `<span class="katex-block">${wrapped}</span>`
        } catch {
            return `<span class="katex-error">$$${formula}$$</span>`
        }
    })

    // 再处理行内公式 $...$
    result = result.replace(/\$([^$\n]+?)\$/g, (_, formula) => {
        try {
            const rendered = katex.renderToString(decodeEntities(formula).trim(), {
                displayMode: false,
                throwOnError: false,
                output
            })
            return output === 'mathml'
                ? `<span class="katex-mathml-node">${rendered}</span>`
                : rendered
        } catch {
            return `<span class="katex-error">$${formula}$</span>`
        }
    })

    return result
}

/**
 * 渲染单个公式片段（含定界符），供 Markdown 预处理阶段使用。
 * 直接作用于原始 LaTeX 文本，避免 marked 把 `\\` 等转义吃掉。
 */
export function renderMathSpan(raw: string, options: LatexRenderOptions = {}): string {
    const output = options.output ?? 'html'
    const block = /^\$\$([\s\S]+?)\$\$$/.exec(raw)
    if (block) {
        try {
            return `<span class="katex-block">${katex.renderToString(decodeEntities(block[1]).trim(), {
                displayMode: true,
                throwOnError: false,
                output
            })}</span>`
        } catch {
            return `<span class="katex-error">${raw}</span>`
        }
    }
    const inline = /^\$([\s\S]+?)\$$/.exec(raw)
    if (inline) {
        try {
            return katex.renderToString(decodeEntities(inline[1]).trim(), {
                displayMode: false,
                throwOnError: false,
                output
            })
        } catch {
            return `<span class="katex-error">${raw}</span>`
        }
    }
    return raw
}

/**
 * 检查文本是否包含 LaTeX 公式
 */
export function hasLatex(text: string): boolean {
    if (!text) return false
    return /\$[^$]+\$/.test(text)
}
