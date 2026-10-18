# List.map_comp_map — 概念投影

- 签名：`∀ {α : Type u} {β : Type v} {γ : Type w} (g : β → γ) (f : α → β), List.map g ∘ List.map f = List.map (g ∘ f)`
- 所在模块：`Mathlib.Data.List.Basic`
- 文档：Composing a `List.map` with another `List.map` is equal to a single `List.map` of composed functions.
- 聚焦：全闭包 649 个节点；显示半径 2 内 50 个节点（7%）；深层 599 个节点按需展开
- 闭包边：6217（类型级 2320 / 证明级 3897）
- 类型级闭包：5；证明层新增：644（= 全闭包 − 类型级闭包，含类型/证明混合路径）
- 聚焦内部管道：10 个节点（20%）
- 聚焦语义节点 docstring 覆盖率：29/40（72%）

## 投影树

List.map_comp_map
├── [中心概念] 列表与拼接（List / ++ / length）
│   ├── [目标] `List.map_comp_map` (theorem) — Composing a `List.map` with another `List.map` is equal to a
│   ├── [陈述] `List` (inductive) — Linked lists: ordered lists, in which each element has a ref
│   ├── [陈述] `List.map` (definition) — Applies a function to each element of the list, returning th
│   ├── [证明] `List.comp_map` (theorem) — A single `List.map` of a composition of functions is equal t
│   ├── [证明] `List.ext_getElem?` (theorem)
│   ├── [证明] `List.length` (definition) — The length of a list. This function is overridden in the com
│   ├── [证明] `List.map_map` (theorem)
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 4 / proof 7), 函数与复合（Function / ∘） (type 3 / proof 4), 元素访问（GetElem? / getElem?） (type 1 / proof 2), 实例/类型类机器（instances） (type 2 / proof 4), 逻辑与函数外延（True / Iff / propext / funext） (type 0 / proof 3), 自然数与加法（Nat / +） (type 2 / proof 3), Option 与可空值 (type 1 / proof 4), 序关系（LT / LE） (type 1 / proof 2)
├── [读懂陈述] 等式与同余（Eq / congr）
│   ├── [陈述] `Eq` (inductive) — The equality relation. It has one introduction rule, `Eq.ref
│   ├── [证明] `Eq.mpr` (definition) — If `h : α = β` is a proof of type equality, then `h.mpr : β 
│   ├── [证明] `Eq.rec` (recursor)
│   ├── [证明] `Eq.symm` (theorem) — Equality is symmetric: if `a = b` then `b = a`. Because this
│   ├── [证明] `congrArg` (theorem) — Congruence in the function argument: if `a₁ = a₂` then `f a₁
│   ├── [证明] `rfl` (definition) — `rfl : a = a` is the unique constructor of the equality type
├── [读懂陈述] 函数与复合（Function / ∘）
│   ├── [陈述] `Function.comp` (definition) — Function composition, usually written with the infix operato
│   ├── [证明] `Function.comp_apply` (theorem)
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 1 / proof 1)
├── [读懂证明] 实例/类型类机器（instances）
│   ├── [证明] `List.instGetElem?NatLtLength` (definition) — This instance overrides the default implementation of `a[i]?
│   ├── [证明] `List.instGetElemNatLtLength` (definition)
│   ├── [证明] `instLTNat` (definition)
│   └── 概念依赖 → 元素访问（GetElem? / getElem?） (type 1 / proof 1), 列表与拼接（List / ++ / length） (type 4 / proof 4), 自然数与加法（Nat / +） (type 3 / proof 4), 序关系（LT / LE） (type 3 / proof 3)
├── [读懂证明] Option 与可空值
│   ├── [证明] `Option` (inductive) — Optional values, which are either `some` around a value from
│   ├── [证明] `Option.ext` (theorem)
│   ├── [证明] `Option.none` (constructor) — No value.
│   ├── [证明] `Option.some` (constructor) — Some value of type `α`.
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 1 / proof 3), 逻辑与函数外延（True / Iff / propext / funext） (type 1 / proof 3)
├── [读懂证明] 自然数与加法（Nat / +）
│   ├── [证明] `Nat` (inductive) — The natural numbers, starting at zero. This type is special-
│   ├── [证明] `Nat.lt` (definition) — Strict inequality of natural numbers, usually accessed via t
├── [读懂证明] 逻辑与函数外延（True / Iff / propext / funext）
│   ├── [证明] `Iff` (inductive) — If and only if, or logical bi-implication. `a ↔ b` means tha
│   ├── [证明] `Iff.mp` (theorem) — Modus ponens for if and only if. If `a ↔ b` and `a`, then `b
│   ├── [证明] `Iff.mpr` (theorem) — Modus ponens for if and only if, reversed. If `a ↔ b` and `b
│   ├── [证明] `Iff.refl` (theorem)
│   ├── [证明] `Iff.rfl` (theorem)
│   ├── [证明] `funext` (theorem) — **Function extensionality.** If two functions return equal r
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 1 / proof 2), 商类型（Quot） (type 0 / proof 4)
├── [读懂证明] 元素访问（GetElem? / getElem?）
│   ├── [证明] `GetElem?` (inductive) — The classes `GetElem` and `GetElem?` implement lookup notati
│   ├── [证明] `GetElem?.getElem?` (definition) — The syntax `arr[i]?` gets the `i`'th element of the collecti
│   ├── [证明] `GetElem?.mk` (constructor)
│   └── 概念依赖 → Option 与可空值 (type 2 / proof 0)
├── [读懂证明] 序关系（LT / LE）
│   ├── [证明] `LT` (inductive) — `LT α` is the typeclass which supports the notation `x < y` 
│   ├── [证明] `LT.lt` (definition) — The less-than relation: `x < y`
│   ├── [证明] `LT.mk` (constructor)
└── [读懂证明] 商类型（Quot）
│   ├── [证明] `Quot` (quotient) — Low-level quotient types. Quotient types coarsen the proposi
│   ├── [证明] `Quot.liftOn` (definition) — Lifts a function from an underlying type to a function on a 
│   ├── [证明] `Quot.mk` (quotient) — Places an element of a type into the quotient that equates t
│   ├── [证明] `Quot.sound` (axiom) — The **quotient axiom**, which asserts the equality of elemen
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 2 / proof 1)

## 聚焦范围内的内部管道（10 个节点，可折叠）

这些是证明项里的 equation compiler / recursor / match 辅助声明，不是学习概念，投影时默认折叠：

- `Inhabited` (inductive)
- `List.brecOn` (definition)
- `List.ext_getElem?._f` (definition)
- `List.get!Internal` (definition)
- `List.get?Internal` (definition)
- `List.length._f` (definition)
- `List.map._f` (definition)
- `_private.Init.Data.Option.Lemmas.0.Option.ext.match_1_1` (definition)
- `id` (definition)
- `outParam` (definition)

## 概念级依赖（权重，仅聚焦子图）

| from | to | type-uses | proof-uses |
|:---|:---|---:|---:|
| function | equality | 1 | 1 |
| getelem | option | 2 | 0 |
| instance | getelem | 1 | 1 |
| instance | list | 4 | 4 |
| instance | nat | 3 | 4 |
| instance | order | 3 | 3 |
| list | equality | 4 | 7 |
| list | function | 3 | 4 |
| list | getelem | 1 | 2 |
| list | instance | 2 | 4 |
| list | logic | 0 | 3 |
| list | nat | 2 | 3 |
| list | option | 1 | 4 |
| list | order | 1 | 2 |
| logic | equality | 1 | 2 |
| logic | quot | 0 | 4 |
| option | equality | 1 | 3 |
| option | logic | 1 | 3 |
| quot | equality | 2 | 1 |
