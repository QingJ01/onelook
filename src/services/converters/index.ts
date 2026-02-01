/**
 * 思维导图格式转换器
 * 支持 XMind、FreeMind、OPML 等主流格式
 */

export { xmindConverter } from './xmind'
export { freemindConverter } from './freemind'
export { opmlConverter } from './opml'

// 支持的格式类型
export type SupportedFormat = 'xmind' | 'freemind' | 'opml' | 'json' | 'markdown' | 'olook'

// 格式信息
export interface FormatInfo {
    name: string
    extension: string
    mimeType: string
    description: string
}

// 格式注册表
export const formatRegistry: Record<SupportedFormat, FormatInfo> = {
    xmind: {
        name: 'XMind',
        extension: '.xmind',
        mimeType: 'application/zip',
        description: 'XMind 思维导图格式'
    },
    freemind: {
        name: 'FreeMind',
        extension: '.mm',
        mimeType: 'application/xml',
        description: 'FreeMind XML 格式'
    },
    opml: {
        name: 'OPML',
        extension: '.opml',
        mimeType: 'text/x-opml',
        description: '大纲处理标记语言'
    },
    json: {
        name: 'JSON',
        extension: '.json',
        mimeType: 'application/json',
        description: '通用 JSON 格式'
    },
    markdown: {
        name: 'Markdown',
        extension: '.md',
        mimeType: 'text/markdown',
        description: 'Markdown 大纲格式'
    },
    olook: {
        name: 'OneLook',
        extension: '.olook',
        mimeType: 'application/json',
        description: 'OneLook 原生格式'
    }
}

// 根据文件扩展名获取格式
export function getFormatByExtension(filename: string): SupportedFormat | null {
    const ext = filename.toLowerCase().split('.').pop()
    switch (ext) {
        case 'xmind':
            return 'xmind'
        case 'mm':
            return 'freemind'
        case 'opml':
            return 'opml'
        case 'json':
            return 'json'
        case 'md':
        case 'markdown':
            return 'markdown'
        case 'olook':
            return 'olook'
        default:
            return null
    }
}
