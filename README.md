<div align="center">
  <img src="public/logo.svg" width="120" alt="OneLook Logo" />
  <h1>OneLook 一目</h1>
  <p><b>一目了然，思维如流</b></p>
  <p>极简、高效、现代化的 Web 端思维导图工具</p>
  
  <p>
    <img src="https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js" />
    <img src="https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat-square&logo=typescript" />
    <img src="https://img.shields.io/badge/Vite-6.0-646cff?style=flat-square&logo=vite" />
    <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
  </p>
</div>

<br />

OneLook 是一款专注于**沉浸式创作**的思维导图应用。它摒弃了繁杂的 UI 干扰，结合了 Markdown 的流畅输入与 SVG 的高性能渲染，为您提供所见即所得的思考空间。数据完全存储于本地，隐私无忧。

## ✨ 核心特性

- 📝 **所见即所得**：支持标准 Markdown 语法与 LaTeX 数学公式 (`$E=mc^2$`) 实时预览。
- 🎨 **现代化设计**：内置多种精美主题（亮色/暗色/清新），支持圆角/连线风格深度定制。
- 🚀 **无限画布**：基于 D3.js 的智能布局算法，支持无限缩放、拖拽与平滑自动居中。
- ⚡ **高效交互**：全键盘快捷键驱动，支持多选 (Ctrl+Click)、框选 (Shift+Drag) 与批量操作。
- 📂 **本地优先**：基于 IndexedDB 的本地持久化存储，无需联网；支持多标签页管理。
- 📤 **多格式导出**：支持导出为高清 PNG、矢量 SVG、Markdown 列表及专属 `.olook` 格式。


## 🛠️ 技术栈

- **Core**: Vue 3 (Composition API) + TypeScript
- **Build**: Vite + PostCSS
- **State**: Pinia
- **Icons**: Lucide Vue
- **Rendering**: SVG + D3.js (Algorithms)
- **Rich Text**: Marked (Markdown) + KaTeX (Formula)
- **Storage**: Dexie.js (IndexedDB)
- **Docs**: VitePress

## 📂 目录结构

```bash
src/
├── components/     # Vue 组件
│   ├── editor/     # 编辑器核心 (Canvas, Node, Toolbar...)
│   └── ...
├── composables/    # 组合式函数 (useHistory, useSelection...)
├── core/           # 核心逻辑
│   └── layout/     # 布局算法 (MindLayouter)
├── services/       # 服务层 (Dexie DB, Export)
├── stores/         # Pinia 状态仓库 (mapStore)
├── types/          # TS 类型定义
└── utils/          # 工具函数
    ├── latex.ts    # LaTeX 渲染
    └── markdown.ts # Markdown 渲染
```

## 🗺️ Roadmap

- [x] 基础思维导图功能
- [x] Markdown & LaTeX 支持
- [x] 多主题与自定义样式
- [x] 本地持久化存储
- [ ] 协同编辑 (WebRTC)
- [ ] 插件系统
- [ ] 移动端 App 适配
- [ ] AI 辅助生成导图

## 🤝 贡献指南

我们非常欢迎社区贡献！如果您想参与开发：

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request


## 📦 快速开始

### 环境要求
- Node.js >= 16.0
- pnpm >= 8.0

### 安装运行

```bash
# 1. 克隆项目
git clone https://github.com/your-username/onelook.git

# 2. 进入目录
cd onelook

# 3. 安装依赖
pnpm install

# 4. 启动开发服务器
pnpm dev
# 访问 http://localhost:5173
```

### 文档预览

本项目包含完整的用户使用手册（基于 VitePress）：

```bash
# 启动文档服务器
pnpm docs:dev
# 访问 http://localhost:5173 (端口可能不同)
```

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。
