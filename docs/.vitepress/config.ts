import { defineConfig } from 'vitepress'

export default defineConfig({
    title: "OneLook",
    description: "极简、高效的现代化思维导图工具",
    lang: 'zh-CN',
    base: '/',
    head: [['link', { rel: 'icon', href: '/favicon.svg' }]],

    themeConfig: {
        logo: '/logo.svg',
        siteTitle: 'OneLook',

        nav: [
            { text: '首页', link: '/' },
            { text: '指南', link: '/guide/' },
            { text: '快捷键', link: '/guide/shortcuts' },
            { text: '开始使用', link: 'http://localhost:3000' }
        ],

        sidebar: [
            {
                text: '使用指南',
                items: [
                    { text: '快速开始', link: '/guide/' },
                    { text: '核心功能', link: '/guide/features' },
                    { text: '高级技巧', link: '/guide/advanced' },
                    { text: '文件管理', link: '/guide/files' },
                ]
            },
            {
                text: '参考手册',
                items: [
                    { text: '快捷键大全', link: '/guide/shortcuts' },
                    { text: '常见问题', link: '/guide/faq' }
                ]
            }
        ],

        socialLinks: [
            { icon: 'github', link: 'https://github.com/your-repo/onelook' }
        ],

        footer: {
            message: 'Released under the MIT License.',
            copyright: 'Copyright © 2024-present OneLook'
        },

        docFooter: {
            prev: '上一页',
            next: '下一页'
        },

        outline: {
            label: '页面导航'
        },

        lastUpdated: {
            text: '最后更新于',
            formatOptions: {
                dateStyle: 'short',
                timeStyle: 'short'
            }
        },

        search: {
            provider: 'local',
            options: {
                translations: {
                    button: {
                        buttonText: '搜索文档',
                        buttonAriaLabel: '搜索文档'
                    },
                    modal: {
                        noResultsText: '无法找到相关结果',
                        resetButtonTitle: '清除查询条件',
                        footer: {
                            selectText: '选择',
                            navigateText: '切换'
                        }
                    }
                }
            }
        }
    }
})
