# OneLook Graph Notebook — 项目文档

把 OneLook 从“思维导图工具”演进为“以形式化库为 substrate、以个人图笔记为 overlay、以多投影为界面的学习工作台”。

## 文档索引

| 文档 | 内容 |
|:---|:---|
| [CHARTER.md](./CHARTER.md) | 项目章程：问题、范围、MVP、指标、里程碑、风险 |
| [ADR-0001](./adr/0001-graph-substrate-overlay-projection.md) | 架构决策：形式图 substrate + 个人 overlay + 投影视图 |
| [mathlib-graph](../../mathlib-graph/README.md) | 外部项目：mathlib → 多层图结构的转换与资产 |

## 当前状态

- 阶段：M1 数据管线已跑通（外部项目 mathlib-graph），真实学习任务待做
- 代码基线：OneLook 0.2.3（MIT）
- 数据环境：`/Users/anzhize/.zcode/workspace/math`
  - Lean `v4.33.0`
  - mathlib `db584cd6d46c92f209a44c0f1c829460d327499d`（tag `v4.33.0` / `master-2026-08-10`）
  - 预编译缓存与 7.5G `.lake` 依赖已就位
  - 可用依赖包括 `importGraph`、`LeanSearchClient`、`proofwidgets`

M1 实验与报告：[mathlib-graph](../../mathlib-graph/README.md)（外部项目，不在本仓库）。

## 第一步

不是重构代码，而是完成两件事：

1. 用本章程和 ADR 固定产品边界与架构原则；
2. 在外部 `mathlib-graph` 项目跑通 Spike 0001：抽取一个目标声明的依赖闭包，聚合成概念，投影成一版先修树，判断它是否真的比 docs + Loogle 更有用。

Spike 通过后再进入 overlay 原型；否则及时止损或调整方向。
