# Spike 0001 执行报告（三轮）

- 日期：2026-10-18
- 环境：Lean `v4.33.0`；项目 `/Users/anzhize/.zcode/workspace/math`
- 目标：
  - Round 1（core）：`Nat.add_comm`、`List.length_append`
  - Round 2（mathlib / List）：`List.map_comp_map`（`Mathlib.Data.List.Basic`）
  - Round 3（mathlib / Filter）：`Filter.coext`（`Mathlib.Order.Filter.Basic`）
- 产出：`out/*.graph.json`、`out/*.concepts.json`、`out/*.projection.md`、`out/comparison.md`

## 结论先行

**数据管线在 core、mathlib List、mathlib Filter 三种规模/领域上都跑通了，但“投影什么”比“能不能抽取”更关键。**

- core 目标闭包只有 47/77 个节点，全量投影可读；
- `List.map_comp_map` 全闭包 **649 个节点 / 6217 条边**，直接投影不可读；半径 2 聚焦后 **50 个节点 / 9 个语义概念**，可读性恢复；
- `Filter.coext` 全闭包 **1327 个节点 / 14332 条边**，半径 2 聚焦后同样 **50 个节点 / 8 个语义概念**；但聚焦语义文档覆盖只有 **19/42（45%）**；
- 证明闭包膨胀主要来自 `ext`/simp/类型类实例拉进来的 `getElem?`、除法、`Quot`、`Set.inst*` 等**证明机器**，不是概念先修；
- 把 `inst*` 单独成层后，Filter 的 Set 概念从 16 个锚点降到 8 个，List 的 List 概念从 9 降到 7。

因此：**聚焦半径必须成为产品的一等参数，默认 1–2 跳、按需展开；概念层必须区分“概念 / 实例 / 内部管道”，并且不能假设 mathlib 处处有 docstring。** 学习效果仍未做真人任务验证，暂不启动 UI 重构。

## 数据

| 指标 | `Nat.add_comm` | `List.length_append` | `List.map_comp_map` | `Filter.coext` |
|:---|---:|---:|---:|---:|
| 全闭包节点 | 47 | 77 | 649 | 1327 |
| 聚焦节点 | 47（全量） | 77（全量） | 50（半径 2） | 50（半径 2） |
| 全闭包边 | 241 | 366 | 6217 | 14332 |
| 聚焦边 | 241 | 366 | 233 | 207 |
| 类型级闭包 | 9 | 16 | 5 | 12 |
| 证明层新增 | 38 | 61 | 644 | 1315 |
| 聚焦内部管道 | 20（43%） | 25（32%） | 10（20%） | 8（16%） |
| 聚焦语义概念 | 3 | 6 | 9 | 8 |
| 聚焦语义 doc 覆盖 | 16/27（59%） | 33/52（63%） | 29/40（72%） | 19/42（45%） |
| 目标自身 docstring | 无 | 无 | 有 | 有 |

> 证明层新增 = 全闭包 − 类型级闭包，包含类型/证明混合路径。单用 proof 边做闭包时，List 目标是 618 个节点，Filter 目标是 1291 个节点；其余节点只能通过混合路径到达。

## Round 1：core 目标

`Nat.add_comm`：

- 47 个节点，其中 20 个是 `._f`、`brecOn`、`below`、`match_*`、`PUnit/PProd`、`outParam` 等内部管道；
- 类型级闭包 9 个，主要是 `Nat`、`HAdd/Add`、`OfNat`、`Eq`、实例；
- 证明层新增 38 个，包括 `Nat.zero_add`、`Nat.succ_add`、`Nat.rec`、`Eq.symm`、`congrArg`；
- 聚合成 3 个语义概念：自然数与加法、加法记号、等式；
- 目标自身没有 docstring。

`List.length_append`：

- 77 个节点，其中 25 个内部管道；
- 类型级闭包 16 个，证明层新增 61 个；
- 聚合成 6 个语义概念：List、Nat、等式、逻辑、加法记号、拼接记号；
- 目标自身没有 docstring。

Round 1 的结论：**小闭包下“类型级/证明层/内部管道”三层投影成立**；但两个目标都是 Lean core，文档稀疏，不能代表 mathlib 的学习体验。

## Round 2：mathlib 目标

目标：`List.map_comp_map`（`Mathlib.Data.List.Basic`），命题是

```text
List.map g ∘ List.map f = List.map (g ∘ f)
```

### 全闭包 vs 聚焦

- 全闭包：649 节点 / 6217 边；
- 半径 1：23 节点，18/23 有 docstring；
- 半径 2：50 节点，34/50 有 docstring（语义节点 29/40，72%）；
- 半径 2 内聚合成 9 个语义概念：
  List、等式、函数复合、逻辑/函数外延、GetElem?、序关系、Nat、Option、Quot；
- 聚焦内部管道 10 个（20%）。

### 为什么全闭包会爆炸

`List.map_comp_map` 的证明用了 `ext l` 和 `rw [comp_map, Function.comp_apply]`。`List.ext_getElem?` 是重型的 extensionality 引理，它把：

- `List.getElem?` / `GetElem?`；
- `Option`；
- `Nat` 的 `LT`/除法/实例；
- `Quot` / `Quot.sound`；
- `Iff`、`funext`；

等实现细节全部拉进证明项闭包。对“理解 map 复合”这个目标，这些不是概念先修，而是**证明机器**。

这暴露了一个产品级设计点：**“证明层”不能一概展示。** 需要区分：

- **概念性证明依赖**：如 `comp_map`、`Function.comp_apply`、`funext`；
- **策略/机器依赖**：如 `List.ext_getElem?`、`GetElem?`、`Option.ext`、`Quot.sound`、除法/实例链。

当前投影把两者都标成 `[读懂证明]`，这会让学习者误以为要先学 `getElem?` 和商类型。下一轮需要给 proof 边加“机器/概念”分类。

### 文档情况

目标自身有 docstring：

> Composing a `List.map` with another `List.map` is equal to a single `List.map` of composed functions.

这是相对 core 目标的明显改善。聚焦语义节点 29/40 有文档；`List.ext_getElem?`、`List.map_map`、`Function.comp_apply`、`Option.ext`、`instLTNat` 等没有文档，说明 mathlib 也并非处处有解释。

## Round 3：跨领域 mathlib 目标（Filter.coext）

目标：`Filter.coext`（`Mathlib.Order.Filter.Basic`），命题是

```text
(∀ s, sᶜ ∈ f ↔ sᶜ ∈ g) → f = g
```

### 规模

- 全闭包：1327 节点 / 14332 边；
- 半径 1：15 节点，9/15 有 docstring；
- 半径 2：50 节点，20/50 有 docstring（语义节点 19/42，45%）；
- 类型级闭包 12；证明层新增 1315；
- 聚焦内部管道 8 个（16%）。

### 概念层

半径 2 内聚合成 8 个语义概念：

- 滤子（Filter）；
- 集合与补集（Set / Compl）；
- 成员关系（Membership）；
- 布尔代数（BooleanAlgebra）；
- 函数（Function）；
- 序关系（LT / LE / OrderBot / OrderTop）；
- 逻辑（Iff / Not / Exists）；
- 等式（Eq）。

另有 **9 个 `inst*` 实例/类型类机器**，单独成层后：

- `Set` 概念从 16 个锚点降到 8 个；
- `Filter` 概念从 6 个降到 5 个；
- 实例层保留 9 个锚点，默认折叠。

### 新发现

1. **文档密度是领域相关的**：List 聚焦语义覆盖 72%，Filter 只有 45%。很多实例/投影定义没有 docstring，不能假设 mathlib 处处有解释。
2. **实例/类型类机器必须单独成层**：`Set.instBooleanAlgebra`、`Set.instBoundedOrder`、`Set.instSDiff` 等会把“集合”概念撑大，但它们不是学习概念；把它们标成 `instance` 后投影才干净。
3. **前缀式概念规则不可扩展**：加入 Filter 目标后，必须手工补 `Filter`、`Set`、`Compl`、`Membership`、`BooleanAlgebra`、`OrderBot/OrderTop` 等规则；在此之前，`OrderBot.toBot`、`OrderTop.toTop` 会落到 `ns:OrderBot` 之类的临时概念。下一轮必须做半自动聚类。
4. **聚焦半径缓解但不消除噪声**：1327 → 50 已经可用，但 50 个节点里仍有 9 个实例和 8 个内部管道；概念后处理仍然必要。

## 对章程成功标准的对照

| 标准 | 结果 | 说明 |
|:---|:---|:---|
| 固定版本可复现 | 通过 | Lean 4.33.0 + `Mathlib.Data.List.Basic` / `Mathlib.Order.Filter.Basic`；抽取约 7 秒 |
| 闭包覆盖目标陈述所需概念 | 部分 | 语法闭包完整；语义先修仍需概念层修正 |
| 概念投影 < 100 节点 | 通过 | mathlib 聚焦 50 节点 / 9 与 8 个语义概念；core 47/77 全量 |
| 比 docs + Loogle 更快建立整体感 | 未验证 | 还没有真人任务对比 |

## 对产品的含义

1. **Focus radius 是一等参数**：默认 1–2 跳，节点可展开；不要默认显示全闭包。649→50 和 1327→50 都说明这一步不是优化，而是可用性前提。
2. **概念层要分“概念 / 实例 / 内部管道”三层**：单纯按命名空间分组会把 `List.instGetElem?*`、`Set.inst*`、`getElem?`、`Quot` 和 `List.map` 放在同一层。把 `inst*` 单独成层后，Filter 的 Set 概念从 16 个锚点降到 8 个。
3. **类型级闭包是语法闭包，不是教学先修**：`outParam` 会出现在类型层，`Nat.add`/`List.append` 反而落在证明层；需要语义修正。
4. **docstring 是必要条件，不是充分条件，而且密度领域相关**：List 聚焦语义覆盖 72%，Filter 只有 45%；关键策略引理（`ext_getElem?`）也可能没有文档。还需要例子、通俗解释和“为什么需要它”。
5. **概念规则必须半自动化**：为 List 手写的前缀规则在 Filter 上失效，必须补 `Filter`/`Set`/`Compl`/`Membership`/`BooleanAlgebra` 等规则；这是不可扩展的。下一轮用命名空间/模块/头符号 + docstring 聚类 + 人工审核。
6. **领域差异是真实的**：List 的证明机器是 `ext`/`getElem?`，Filter 的证明机器是 Boolean algebra 实例与集合补集；同一套概念规则不能假设通用。

## 下一步

1. **真实学习任务**（需要你参与）：
   - 任务：理解并复述 `List.map_comp_map` 或 `Filter.coext`，然后用它完成一个小证明；
   - A 组：只给 mathlib 文档 + Loogle；
   - B 组：给当前投影（聚焦半径 2）+ “展开”入口；
   - 记录：找到关键引理的时间、无效搜索次数、自评理解度、一周后回忆。
2. **概念层半自动化**：用命名空间/模块/类型头符号 + docstring 聚类生成候选，人工审核；不要继续手写前缀。
3. **补边**：`extends`、`instance-of`、`simp-for`、`import`；把实例链单独成层。
4. **证明机器分类**：区分概念性证明依赖与 `ext`/simp/实例机器；后者默认折叠。
5. **再换一个领域**：`MeasureTheory` 基础引理，验证半自动化概念层在文档更稀疏、类型类更多的场景下是否成立。
6. 以上通过后再做 overlay 原型；现在不做 UI。

## 复现

```bash
export PATH="$HOME/.elan/bin:$PATH"
cd /Users/anzhize/.zcode/workspace/math

# 抽取（已加入 Mathlib.Data.List.Basic 与 List.map_comp_map）
lake env lean /Users/anzhize/.zcode/workspace/app/onelook/experiments/mathlib-spike/extract.lean

cd /Users/anzhize/.zcode/workspace/app/onelook/experiments/mathlib-spike
python3 aggregate.py
```

## 判定

**Go（有条件）**：core 与两个 mathlib 领域（List、Filter）的管线都可用，聚焦邻域 + 概念/实例/机器分层能恢复可读性；但学习价值尚未验证，且概念规则仍需半自动化。继续做真实任务评估与概念层自动化，暂不进入 overlay/UI 重构。
