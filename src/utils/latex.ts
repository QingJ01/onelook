import katex from 'katex'

/**
 * 渲染文本中的 LaTeX 公式
 * 支持 $...$ 行内公式和 $$...$$ 块级公式
 */
export function renderLatex(text: string): string {
    if (!text) return text

    // 先处理块级公式 $$...$$
    let result = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
        try {
            return `<span class="katex-block">${katex.renderToString(formula.trim(), {
                displayMode: true,
                throwOnError: false
            })}</span>`
        } catch {
            return `<span class="katex-error">$$${formula}$$</span>`
        }
    })

    // 再处理行内公式 $...$
    result = result.replace(/\$([^$\n]+?)\$/g, (_, formula) => {
        try {
            return katex.renderToString(formula.trim(), {
                displayMode: false,
                throwOnError: false
            })
        } catch {
            return `<span class="katex-error">$${formula}$</span>`
        }
    })

    return result
}

/**
 * 检查文本是否包含 LaTeX 公式
 */
export function hasLatex(text: string): boolean {
    if (!text) return false
    return /\$[^$]+\$/.test(text)
}
