# Spike 0001：mathlib 依赖子图抽取与投影

- 状态：执行中（core + mathlib 目标已跑通，真实学习任务待做）
- 关联：[项目章程](../CHARTER.md)、[ADR-0001](../adr/0001-graph-substrate-overlay-projection.md)
- 执行产物：[experiments/mathlib-spike](../../experiments/mathlib-spike/)、[执行报告](../../experiments/mathlib-spike/evaluation.md)

## 要验证的假设

从固定 mathlib 版本中，能够以可接受的成本抽取一个目标声明的依赖闭包，并将其聚合成少量概念、投影成一张对学习有指导意义的先修树。

如果这个假设不成立，后面的 overlay、视图和重构都没有意义。

## 为什么这是第一个

整个产品的风险不在图形渲染，而在数据：

- 原始依赖图是否完整、是否可区分类型级与证明级；
- 噪声是否能被剪枝和概念聚合压到可读；
- 投影出来是否真的能回答“先学什么”。

这三件事决定产品是否成立，必须在写 UI 之前验证。

## 环境

- 项目：`/Users/anzhize/.zcode/workspace/math`
- Lean：`v4.33.0`（`lean-toolchain`）
- mathlib：`db584cd6d46c92f209a44c0f1c829460d327499d`（tag `v4.33.0` / `master-2026-08-10`）
- 依赖已就位：`importGraph`、`LeanSearchClient`、`proofwidgets`、`aesop` 等
- 缓存：`~/.cache/mathlib` 约 440M，`.lake` 约 7.5G
- 注意：不要在未拉取缓存的情况下全量 `lake build`；本项目缓存已就位

```bash
export PATH="$HOME/.elan/bin:$PATH"
cd /Users/anzhize/.zcode/workspace/math
lake env lean --version
lake exe graph --help   # 模块级 import 图，可作辅助
```

## 目标选择

### 标准

1. 当前学习正在用（Ch01–Ch02 逻辑/归纳，或正在卡住的 mathlib 定理）；
2. 目标闭包小于约 500 个声明；
3. 概念聚合后小于约 100 个节点；
4. docstring 覆盖尚可；
5. 有跨模块依赖，能体现投影价值。

### 候选

| 目标 | 特点 | 用途 |
|:---|:---|:---|
| `Nat.add_comm` | 基础、熟悉、闭包可能偏底层 | 验证抽取管线 |
| `List.length_append` | 结构简单、证明短 | 验证概念聚合 |
| `Filter.Tendsto` | 经典痛点、闭包较大 | 压力测试 / 对比 |

最终目标在开始时按标准确定，并写入 `graph.json` 的元数据。

## 步骤

### 1. 建立抽取脚本

首选方案：Lean 元程序，遍历 Environment。

需要收集：

- 声明：名称、kind、模块、签名、docstring；
- 类型级依赖：`ConstantInfo.type` 中引用的常量；
- 证明级依赖：`ConstantInfo.value` 中引用的常量（def/thm 等）；
- 实例：typeclass instance 声明及其目标类型；
- 结构/类继承：`extends`；
- simp 定理：`@[simp]` 及其重写头符号（启发式）；
- import：模块级依赖（可用 `lake exe graph` 辅助）。

备选：

- doc-gen4 的 declarations JSON；
- LeanDojo 的 proof trace（补充证明级 premises）。

实现提示：

- 用 `Expr.getUsedConstants` 或等价遍历收集常量；
- 对 `axiomInfo` / `defnInfo` / `thmInfo` / `opaqueInfo` / `inductInfo` / `ctorInfo` / `recInfo` 分别处理；
- 只保留从目标可达的常量，避免把整个环境写进图；
- docstring 用 `Environment.getDocString?`。

### 2. 构建 graph JSON

Schema 草案：

```json
{
  "meta": {
    "mathlibCommit": "db584cd6d46c92f209a44c0f1c829460d327499d",
    "leanVersion": "4.33.0",
    "target": "Nat.add_comm",
    "generatedAt": "2026-10-18T00:00:00Z"
  },
  "nodes": [
    {
      "id": "Nat.add_comm",
      "name": "Nat.add_comm",
      "kind": "theorem",
      "module": "Mathlib.Data.Nat.Defs",
      "signature": "...",
      "docstring": "..."
    }
  ],
  "edges": [
    {
      "source": "Nat.add_comm",
      "target": "Nat.add",
      "type": "type-uses",
      "weight": 1
    }
  ]
}
```

边类型初稿：

- `type-uses`：签名依赖；
- `proof-uses`：证明项依赖；
- `extends`：结构/类继承；
- `instance-of`：实例目标；
- `simp-for`：simp 引理与其重写符号；
- `imports`：模块依赖。

### 3. 聚焦与剪枝

- 从目标做后向闭包（类型级 + 证明级分别计算）；
- 去掉纯技术管道（可配置规则：如仅被证明项引用、无 docstring、非 API 的辅助引理）；
- 计算权重：反向依赖中心性、在目标闭包中的出现频率、simp 使用频率；
- 输出统计：节点数、边数、深度、docstring 覆盖率、各类型边数量。

### 4. 概念聚合

- 手工 / 半自动地把闭包聚成 20–50 个概念；
- 每个概念锚定若干声明；
- 概念间先修边由声明级依赖聚合：若 B 的声明有较高比例依赖 A 的声明，则生成 A → B；
- 记录聚合规则与人工修改，保证可复现。

### 5. 投影

- 生成先修树（Markdown 缩进列表 / Graphviz / markmap 均可）；
- 保留跨边（back edges），不强行塞进树；
- 每个概念下标注关键声明与 docstring 摘要；
- 可额外输出一版纯声明级 DAG，作为对照。

### 6. 评估

- 是否回答“学 X 之前要懂什么”；
- 噪声比例：多少节点是证明管道；
- 缺失边 / 错误边；
- 与 docs + Loogle 工作流对比：时间、无效搜索次数、主观负担。

## 产出

```text
experiments/mathlib-spike/        # 或独立临时目录
  extract.lean                    # 抽取脚本
  graph.json                      # 声明级图
  concepts.json                   # 概念层与锚点
  projection.md                   # 先修树投影
  evaluation.md                   # 评估记录
```

可复现命令、mathlib commit、Lean 版本必须记录在 `graph.json` 的 `meta` 中。

## 成功标准

1. 固定 commit 下可复现；
2. 目标陈述所需概念在闭包中完整（人工抽查）；
3. 概念聚合后投影节点小于约 100，仍能解释目标；
4. 人工判断：比直接读 docs + Loogle 更快建立“先学什么”的整体感。

## 不做

- 全量 mathlib；
- 自动概念层；
- UI 集成；
- 性能优化；
- 修改 mathlib 上游。

## 执行结果（2026-10-18）

三个目标已跑通抽取、概念聚合和投影：

| 指标 | Nat.add_comm | List.length_append | List.map_comp_map | Filter.coext |
|:---|---:|---:|---:|---:|
| 全闭包节点 / 边 | 47 / 241 | 77 / 366 | 649 / 6217 | 1327 / 14332 |
| 聚焦节点 | 47（全量） | 77（全量） | 50（半径 2） | 50（半径 2） |
| 类型级闭包 | 9 | 16 | 5 | 12 |
| 证明层新增 | 38 | 61 | 644 | 1315 |
| 聚焦内部管道 | 20（43%） | 25（32%） | 10（20%） | 8（16%） |
| 语义概念 | 3 | 6 | 9 | 8 |
| 目标 docstring | 无 | 无 | 有 | 有 |

结论：

- 数据管线在 core 和 mathlib 规模上都可用；
- mathlib 全闭包 649/1327 节点，直接投影不可读；半径 2 聚焦后都是 50 节点，可读性恢复；
- 证明闭包膨胀主要来自 `ext`/simp/实例拉进来的 `getElem?`、除法、`Quot`、`Set.inst*` 等证明机器；
- 实例层必须单独拆出：Filter 的 Set 概念从 16 个锚点降到 8 个，List 从 9 降到 7；
- 文档密度领域相关：List 聚焦语义覆盖 72%，Filter 只有 45%；
- 类型级闭包是语法闭包，不等于教学先修（`Nat.add`/`List.append` 反而落在证明层）；
- 下一轮必须做真实学习任务对比，并把概念规则半自动化。

详见 [执行报告](../../experiments/mathlib-spike/evaluation.md)。

## 下一步（Spike 通过后）

- 把 `graph.json` / `concepts.json` 作为 overlay 原型的种子数据；
- 定义锚点解析与失效检测；
- 实现第一个投影视图（个人先修树），再评估是否进入 OneLook 的渐进重构。
