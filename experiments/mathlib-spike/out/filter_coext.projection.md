# Filter.coext — 概念投影

- 签名：`∀ {α : Type u} {f g : Filter α}, (∀ (s : Set α), sᶜ ∈ f ↔ sᶜ ∈ g) → f = g`
- 所在模块：`Mathlib.Order.Filter.Basic`
- 文档：An extensionality lemma that is useful for filters with good lemmas about `sᶜ ∈ f` (e.g., `Filter.comap`, `Filter.coprod`, `Filter.Coprod`, `Filter.cofinite`).
- 聚焦：全闭包 1327 个节点；显示半径 2 内 50 个节点（3%）；深层 1277 个节点按需展开
- 闭包边：14332（类型级 5821 / 证明级 8511）
- 类型级闭包：12；证明层新增：1315（= 全闭包 − 类型级闭包，含类型/证明混合路径）
- 聚焦内部管道：8 个节点（16%）
- 聚焦语义节点 docstring 覆盖率：19/42（45%）

## 投影树

Filter.coext
├── [中心概念] 滤子（Filter）
│   ├── [目标] `Filter.coext` (theorem) — An extensionality lemma that is useful for filters with good
│   ├── [陈述] `Filter` (inductive) — A filter `F` on a type `α` is a collection of sets of `α` wh
│   ├── [证明] `Filter.ext` (theorem)
│   ├── [证明] `Filter.filter_eq` (theorem)
│   ├── [证明] `Filter.sets` (definition) — The set of sets that belong to the filter.
│   └── 概念依赖 → 布尔代数（BooleanAlgebra） (type 0 / proof 1), 等式与同余（Eq / congr） (type 3 / proof 1), 函数与复合（Function / ∘） (type 0 / proof 1), 实例/类型类机器（instances） (type 3 / proof 6), 逻辑与函数外延（True / Iff / propext / funext） (type 2 / proof 3), 成员关系（Membership） (type 2 / proof 3), 集合与补集（Set / Compl） (type 5 / proof 6)
├── [读懂陈述] 集合与补集（Set / Compl）
│   ├── [陈述] `Compl` (inductive) — Set / lattice complement
│   ├── [陈述] `Compl.compl` (definition) — Set / lattice complement
│   ├── [陈述] `Set` (definition) — A set is a collection of elements of some type `α`. Although
│   ├── [证明] `Compl.mk` (constructor)
│   ├── [证明] `Set.ext` (theorem)
│   ├── [证明] `Set.ofPred` (definition) — Turn a predicate `p : α → Prop` into a set, also written as 
│   ├── [证明] `compl_involutive` (theorem)
│   ├── [证明] `compl_surjective` (theorem)
│   └── 概念依赖 → 布尔代数（BooleanAlgebra） (type 4 / proof 3), 等式与同余（Eq / congr） (type 1 / proof 0), 函数与复合（Function / ∘） (type 1 / proof 1), 实例/类型类机器（instances） (type 1 / proof 1), 逻辑与函数外延（True / Iff / propext / funext） (type 1 / proof 1), 成员关系（Membership） (type 1 / proof 1)
├── [读懂陈述] 实例/类型类机器（instances）
│   ├── [陈述] `Filter.instMembership` (definition) — If `F` is a filter on `α`, and `U` a subset of `α` then we c
│   ├── [陈述] `Set.instCompl` (definition)
│   ├── [证明] `Set.instBooleanAlgebra` (definition)
│   ├── [证明] `Set.instBoundedOrder` (definition)
│   ├── [证明] `Set.instDistribLattice` (definition)
│   ├── [证明] `Set.instHImp` (definition)
│   ├── [证明] `Set.instLE` (definition) — We introduce `≤` before `⊆` to help the unifier when applyin
│   ├── [证明] `Set.instMembership` (definition)
│   ├── [证明] `Set.instSDiff` (definition)
│   └── 概念依赖 → 布尔代数（BooleanAlgebra） (type 1 / proof 1), 滤子（Filter） (type 1 / proof 2), 逻辑与函数外延（True / Iff / propext / funext） (type 0 / proof 2), 成员关系（Membership） (type 2 / proof 5), 序关系（LT / LE） (type 0 / proof 4), 集合与补集（Set / Compl） (type 10 / proof 12)
├── [读懂陈述] 等式与同余（Eq / congr）
│   ├── [陈述] `Eq` (inductive) — The equality relation. It has one introduction rule, `Eq.ref
│   ├── [证明] `Eq.rec` (recursor)
├── [读懂陈述] 逻辑与函数外延（True / Iff / propext / funext）
│   ├── [陈述] `Iff` (inductive) — If and only if, or logical bi-implication. `a ↔ b` means tha
│   ├── [证明] `Exists` (inductive) — Existential quantification. If `p : α → Prop` is a predicate
│   ├── [证明] `Iff.intro` (constructor) — If `a → b` and `b → a` then `a` and `b` are equivalent.
│   ├── [证明] `Iff.mpr` (theorem) — Modus ponens for if and only if, reversed. If `a ↔ b` and `b
│   ├── [证明] `Not` (definition) — `Not p`, or `¬p`, is the negation of `p`. It is defined to b
├── [读懂陈述] 成员关系（Membership）
│   ├── [陈述] `Membership` (inductive) — The typeclass behind the notation `a ∈ s : Prop` where `a : 
│   ├── [陈述] `Membership.mem` (definition) — The membership relation `a ∈ s : Prop` where `a : α`, `s : γ
│   ├── [证明] `Membership.mk` (constructor)
├── [读懂证明] 布尔代数（BooleanAlgebra）
│   ├── [证明] `BooleanAlgebra` (inductive) — A Boolean algebra is a bounded distributive lattice with a c
│   ├── [证明] `BooleanAlgebra.mk` (constructor)
│   ├── [证明] `BooleanAlgebra.toCompl` (definition)
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 1 / proof 0), 集合与补集（Set / Compl） (type 3 / proof 0)
├── [读懂证明] 函数与复合（Function / ∘）
│   ├── [证明] `Function.Involutive.surjective` (theorem)
│   ├── [证明] `Function.Surjective` (definition) — A function `f : α → β` is called surjective if every `b : β`
│   ├── [证明] `Function.Surjective.forall` (theorem)
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 0 / proof 4), 逻辑与函数外延（True / Iff / propext / funext） (type 1 / proof 3)
└── [读懂证明] 序关系（LT / LE）
│   ├── [证明] `BoundedOrder.toOrderBot` (definition)
│   ├── [证明] `BoundedOrder.toOrderTop` (definition)
│   ├── [证明] `OrderBot.toBot` (definition)
│   ├── [证明] `OrderTop.toTop` (definition)

## 聚焦范围内的内部管道（8 个节点，可折叠）

这些是证明项里的 equation compiler / recursor / match 辅助声明，不是学习概念，投影时默认折叠：

- `Set.instBooleanAlgebra._proof_1` (theorem)
- `Set.instBooleanAlgebra._proof_2` (theorem)
- `Set.instBooleanAlgebra._proof_3` (theorem)
- `Set.instBooleanAlgebra._proof_4` (theorem)
- `Set.instBooleanAlgebra._proof_5` (theorem)
- `Set.instBooleanAlgebra._proof_6` (theorem)
- `_private.Mathlib.Logic.Function.Basic.0.Function.Surjective.forall.match_1_1` (definition)
- `outParam` (definition)

## 概念级依赖（权重，仅聚焦子图）

| from | to | type-uses | proof-uses |
|:---|:---|---:|---:|
| boolean | equality | 1 | 0 |
| boolean | set | 3 | 0 |
| filter | boolean | 0 | 1 |
| filter | equality | 3 | 1 |
| filter | function | 0 | 1 |
| filter | instance | 3 | 6 |
| filter | logic | 2 | 3 |
| filter | membership | 2 | 3 |
| filter | set | 5 | 6 |
| function | equality | 0 | 4 |
| function | logic | 1 | 3 |
| instance | boolean | 1 | 1 |
| instance | filter | 1 | 2 |
| instance | logic | 0 | 2 |
| instance | membership | 2 | 5 |
| instance | order | 0 | 4 |
| instance | set | 10 | 12 |
| set | boolean | 4 | 3 |
| set | equality | 1 | 0 |
| set | function | 1 | 1 |
| set | instance | 1 | 1 |
| set | logic | 1 | 1 |
| set | membership | 1 | 1 |
