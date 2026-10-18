# ADR-0001：采用“形式图 substrate + 个人 overlay + 投影视图”

- 状态：提议（Proposed）
- 日期：2026-10-18
- 决策者：项目作者
- 相关文档：[项目章程](../CHARTER.md)、[mathlib-graph 外部项目](../../../mathlib-graph/README.md)

## 背景

OneLook 当前以 `MindMapNode` 的 `parentId` / `children` 嵌套树作为唯一模型：

- 节点定义见 `src/types/index.ts:40-57`，文档只有 `{ root, layout, theme }`（`src/types/index.ts:69-80`）；
- 画布连线由父子关系推导（`src/components/editor/MindMapCanvas.vue:387-422`）；
- 布局是四种递归树算法（`src/core/layout/mindLayout.ts`、`src/core/layout/layouts.ts`）；
- `moveNode` 维护“树不能成环”的不变量（`src/stores/mapStore.ts:313-347`）；
- 导入 XMind 时忽略 sheet 级 `relationships`，FreeMind 的 `arrowlink` 也未处理；
- 历史是整文档 JSON 快照（`src/composables/useHistory.ts`），存储是单文档 IndexedDB 记录（`src/services/db.ts:13-15`）。

这限制了多父、环、n 元陈述和跨维度投影。mathlib 学习场景需要一个能同时承载声明图、概念图、个人笔记和教学投影的模型。

## 决策

1. **引入只读、版本化的形式图 substrate**：mathlib 声明及其类型级依赖、证明级依赖、实例、simp、import 边。
2. **用户编辑个人 overlay，不修改 substrate**：概念、笔记、例子、错误记录、先修边、学习状态。
3. **overlay 通过锚点引用 substrate**：锚点记录完全限定名、模块、mathlib commit，并支持别名解析与失效检测。
4. **视图是投影，不是模型**：`focus`（目标、已知集合、边策略、深度、阈值）+ `view`（关系类型、分组、布局、顺序）生成树/网/表。
5. **边与节点带来源（auto / user / shared）和权重**：自动建议，用户确认。
6. **第一期以独立 spike 验证抽取与投影**，不直接重构现有应用。

## 理由

- 保留 mathlib 作为事实来源，避免个人笔记污染形式库。
- 解决“谁来策展全 mathlib 概念层”的冷启动问题：每个学习者只维护自己的 focus，共享 overlay 是可选增量。
- 同一实体可在多视图中复用，符合学习任务的多面性。
- 允许渐进接入：现有树形 UI 可以作为“层次投影”渲染器保留。

## 后果

### 正面

- 数据模型可表达任意图、边属性、n 元陈述（通过陈述节点）。
- 个人笔记与形式事实可对照校验，这是相对 Obsidian 类工具的核心差异。
- overlay 可导出、分享、fork，社区学习路径可以自然涌现。

### 负面 / 成本

- 需要锚点解析、版本迁移、图存储、投影引擎、图算法和脚手架。
- 需要重新设计编辑语义（视图上下文中的命令）。
- 现有整文档快照历史、O(N) 查找、SVG 全量渲染需要渐进替换。
- 产品范围扩大，需要严格的 MVP 门槛和 go/no-go。

## 备选方案

1. **保留树 + 增加关系线（XMind relationships 级）**：成本低，但无法表达多父、环和投影，放弃作为最终架构。
2. **通用图编辑器**：拓扑表达足够，但缺少 mathlib 数据层与教学脚手架，范围过大，暂不作为第一期。
3. **中心化概念/课程层**：体验可控，但策展成本高、冷启动难，放弃作为唯一方案；可作为共享 overlay 的一种。
4. **直接接 Neo4j**：数据库能力强，但与本地优先、离线、学习工作流不匹配；保留为未来后端选项。
5. **嵌入式图引擎（如 Kùzu WASM）**：可作为 overlay / substrate 的存储候选，待 spike 评估。

## 开放问题

- 锚点的稳定 ID：完全限定名 + 模块 + commit 是否足够？如何处理 rename / alias？
- 概念节点与声明引用的默认粒度？如何避免图过细？
- overlay 存储：JSON + 索引表，还是嵌入式图库？
- focus 算法的默认参数与可解释性？
- 共享 overlay 的合并 / 冲突策略？
- 现有 OneLook UI 的接入点：投影适配器还是逐步替换？
